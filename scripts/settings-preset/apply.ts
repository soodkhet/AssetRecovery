import { z } from 'zod'
import type { PresetContext } from './context'

/**
 * ตั้งค่าตาม preset — ทุกแถวผ่าน Zod schema ของ route + service ของหน้าตั้งค่า (audit + เหตุผล)
 * รันซ้ำได้: ข้ามแถวที่มีอยู่แล้ว (เทียบคีย์ธรรมชาติของแต่ละหมวด) · ค่าตั้งเดี่ยวตั้งทับเมื่อค่าต่าง
 */

const row = z.record(z.string(), z.unknown())
const section = z.object({ basis: z.string(), needsAccountant: z.boolean() })
export const presetSchema = z.object({
  name: z.string(),
  title: z.string(),
  version: z.string(),
  description: z.string().optional(),
  sections: z.object({
    vatRates: section.extend({ rows: z.array(row) }).optional(),
    taxProfiles: section.extend({ rows: z.array(row) }).optional(),
    taxProfileDefaults: section
      .extend({
        slots: z.object({
          inhouseIndividual: z.string().nullable(),
          inhouseCorporate: z.string().nullable(),
          outsourceIndividual: z.string().nullable(),
          outsourceCorporate: z.string().nullable(),
        }),
      })
      .optional(),
    whtPolicy: section.extend({ rows: z.array(row) }).optional(),
    financePolicy: section.extend({ values: row }).optional(),
    dataRetention: section.extend({ values: row }).optional(),
    holidays: section.extend({ rows: z.array(z.tuple([z.string(), z.string()])) }).optional(),
    approvalMatrices: section
      .extend({
        rows: z.array(
          z.object({
            condition: z.string(),
            conditionThresholdSatang: z.number().int().nullable(),
            approvalFlowRoles: z.array(z.tuple([z.string(), z.enum(['system', 'inhouse', 'outsource', 'finance_company'])])),
            enforceSegregationOfDuties: z.boolean(),
          }),
        ),
      })
      .optional(),
    payoutCycles: section.extend({ rows: z.array(row) }).optional(),
    costCenters: section.extend({ rows: z.array(row) }).optional(),
    documentTemplates: section
      .extend({
        rows: z.array(
          z.object({
            documentType: z.enum(['billing_invoice', 'tax_invoice', 'handover_note']),
            footerNote: z.string().nullable(),
            printSignature: z.boolean(),
          }),
        ),
      })
      .optional(),
    operations: section.extend({ values: row }).optional(),
  }),
})

export type Preset = z.infer<typeof presetSchema>
export type SectionKey = keyof Preset['sections']

const dateOnly = (iso: string) => new Date(`${iso}T00:00:00.000Z`)
const isoOf = (date: Date) => date.toISOString().slice(0, 10)
function strip<T extends { reason?: unknown }>(value: T): Omit<T, 'reason'> {
  const { reason: _reason, ...rest } = value
  return rest
}

export async function applyPreset(
  ctx: PresetContext,
  input: unknown,
  options: { only: Set<string> | null; dryRun: boolean },
): Promise<string[]> {
  const preset = presetSchema.parse(input)
  const report: string[] = [`preset: ${preset.title} (${preset.name} v${preset.version})${options.dryRun ? ' · DRY RUN — ไม่เขียนฐาน' : ''}`]
  const s = await import('@/lib/settings/schemas')
  const org = ctx.organizationId
  const db = ctx.db
  const want = (key: SectionKey) => preset.sections[key] !== undefined && (options.only === null || options.only.has(key))
  const R = (key: SectionKey, text: string) => `${text} — ค่าตั้งมาตรฐาน ${preset.name} v${preset.version}${preset.sections[key]?.needsAccountant ? ' [รอนักบัญชียืนยัน]' : ''}`
  const done = (key: SectionKey, created: number, skipped: number, note = '') =>
    report.push(`${created > 0 ? '✅' : '⏭️ '} ${key}: ตั้งใหม่ ${created} · มีอยู่แล้ว ${skipped}${note}`)

  // ── VAT ──────────────────────────────────────────────────────────────
  if (want('vatRates')) {
    const q = await import('@/lib/settings/queries/vat-rates')
    let created = 0
    let skipped = 0
    for (const raw of preset.sections.vatRates?.rows ?? []) {
      const parsed = s.vatRateCreateSchema.parse({ ...raw, reason: R('vatRates', 'อัตรา VAT') })
      const exists = await db.vatRateHistory.findFirst({ where: { organizationId: org, effectiveFrom: parsed.effectiveFrom }, select: { id: true } })
      if (exists !== null) { skipped++; continue }
      if (!options.dryRun) await q.createVatRate(ctx.mutation(R('vatRates', `อัตรา VAT ${parsed.ratePct}%`)), strip(parsed))
      created++
    }
    done('vatRates', created, skipped)
  }

  // ── Tax Profile ──────────────────────────────────────────────────────
  const profileIdByName = new Map<string, string>()
  const loadProfiles = async () => {
    for (const p of await db.taxProfile.findMany({ where: { organizationId: org, deletedAt: null }, select: { id: true, name: true } })) {
      profileIdByName.set(p.name, p.id)
    }
  }
  await loadProfiles()
  if (want('taxProfiles')) {
    const q = await import('@/lib/settings/queries/tax-profiles')
    let created = 0
    let skipped = 0
    for (const raw of preset.sections.taxProfiles?.rows ?? []) {
      const parsed = s.taxProfileCreateSchema.parse({ ...raw, reason: R('taxProfiles', 'Tax Profile') })
      if (profileIdByName.has(parsed.name)) { skipped++; continue }
      if (!options.dryRun) {
        const row = await q.createTaxProfile(ctx.mutation(R('taxProfiles', `Tax Profile ${parsed.name}`)), strip(parsed))
        profileIdByName.set(row.name, row.id)
      }
      created++
    }
    done('taxProfiles', created, skipped)
  }

  if (want('taxProfileDefaults')) {
    const q = await import('@/lib/settings/queries/tax-profile-defaults')
    const slots = preset.sections.taxProfileDefaults?.slots
    if (slots !== undefined) {
      const idOf = (name: string | null) => {
        if (name === null) return null
        const id = profileIdByName.get(name)
        if (id === undefined && !options.dryRun) throw new Error(`taxProfileDefaults อ้าง Tax Profile "${name}" ที่ไม่มีในฐาน`)
        return id ?? null
      }
      const next = {
        inhouseIndividual: idOf(slots.inhouseIndividual),
        inhouseCorporate: idOf(slots.inhouseCorporate),
        outsourceIndividual: idOf(slots.outsourceIndividual),
        outsourceCorporate: idOf(slots.outsourceCorporate),
      }
      const current = await db.taxProfileDefaultHistory.findFirst({ where: { organizationId: org }, orderBy: { createdAt: 'desc' } })
      const same = current !== null &&
        current.inhouseIndividualTaxProfileId === next.inhouseIndividual && current.inhouseCorporateTaxProfileId === next.inhouseCorporate &&
        current.outsourceIndividualTaxProfileId === next.outsourceIndividual && current.outsourceCorporateTaxProfileId === next.outsourceCorporate
      if (!same && !options.dryRun) await q.createTaxProfileDefaults(ctx.mutation(R('taxProfileDefaults', 'ค่าเริ่มต้น Tax Profile ตามประเภทผู้รับ')), next)
      done('taxProfileDefaults', same ? 0 : 1, same ? 1 : 0)
    }
  }

  // ── นโยบายภาษีหัก ณ ที่จ่าย ─────────────────────────────────────────
  // ระบบห้ามมีผลย้อนหลัง (รอบจ่ายที่สร้างแล้วใช้ค่าเดิม) ⇒ วันที่ในอดีต/"today" = วันนี้ (เวลาไทย)
  // ข้ามเมื่อนโยบายล่าสุดมีค่าตรงกับ preset แล้ว (รันซ้ำ/ข้ามวันไม่สร้างแถวซ้ำ)
  if (want('whtPolicy')) {
    const q = await import('@/lib/settings/queries/wht-policy')
    const todayBkk = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)
    let created = 0
    let skipped = 0
    for (const raw of preset.sections.whtPolicy?.rows ?? []) {
      const from = typeof raw['effectiveFrom'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw['effectiveFrom']) ? raw['effectiveFrom'] : todayBkk
      const wanted = from > todayBkk ? from : todayBkk
      const parsed = s.whtPolicyCreateSchema.parse({ ...raw, effectiveFrom: wanted, reason: R('whtPolicy', 'นโยบายภาษีหัก ณ ที่จ่าย') })
      const latest = await db.whtPolicyHistory.findFirst({ where: { organizationId: org }, orderBy: { effectiveFrom: 'desc' } })
      const same = latest !== null &&
        [...latest.baseExpenseTypes].sort().join() === [...parsed.baseExpenseTypes].sort().join() &&
        latest.certificateMode === parsed.certificateMode && latest.incomeTypeMode === parsed.incomeTypeMode &&
        latest.issueZeroRate402Certificate === parsed.issueZeroRate402Certificate &&
        latest.inhouseIncomeCategory === parsed.inhouseIncomeCategory && latest.outsourceIncomeCategory === parsed.outsourceIncomeCategory &&
        latest.allowGrossUpConditions === parsed.allowGrossUpConditions && latest.filingMethod === parsed.filingMethod
      if (same) { skipped++; continue }
      if (!options.dryRun) await q.createWhtPolicy(ctx.mutation(R('whtPolicy', `นโยบายภาษีหัก ณ ที่จ่าย มีผล ${isoOf(parsed.effectiveFrom)}`)), strip(parsed))
      created++
    }
    done('whtPolicy', created, skipped)
  }

  // ── ค่าตั้งเดี่ยว ────────────────────────────────────────────────────
  if (want('financePolicy')) {
    const q = await import('@/lib/settings/queries/finance-policy')
    const parsed = s.financePolicyUpdateSchema.parse({ ...preset.sections.financePolicy?.values, reason: R('financePolicy', 'นโยบายการเงิน') })
    if (!options.dryRun) await q.updateFinancePolicy(ctx.mutation(R('financePolicy', 'นโยบายการเงิน')), await q.getFinancePolicy(org), strip(parsed))
    done('financePolicy', 1, 0, ' (ตั้งทับ)')
  }
  if (want('dataRetention')) {
    const q = await import('@/lib/settings/queries/data-retention')
    const parsed = s.dataRetentionUpdateSchema.parse({ ...preset.sections.dataRetention?.values, reason: R('dataRetention', 'ระยะเก็บเอกสาร') })
    if (!options.dryRun) await q.updateDataRetentionPolicy(ctx.mutation(R('dataRetention', 'ระยะเก็บเอกสาร')), await q.getDataRetentionPolicy(org), strip(parsed))
    done('dataRetention', 1, 0, ' (ตั้งทับ)')
  }
  if (want('operations')) {
    const sla = await import('@/lib/settings/queries/sla-policy')
    const assign = await import('@/lib/settings/queries/assignment-policy')
    const values = preset.sections.operations?.values ?? {}
    const slaParsed = s.slaPolicyUpdateSchema.parse({ slaAlertHours: values['slaAlertHours'], reason: R('operations', 'SLA') })
    const { slaAlertHours: _sla, ...assignValues } = values
    const assignParsed = s.assignmentPolicyUpdateSchema.parse({ ...assignValues, reason: R('operations', 'นโยบายมอบหมาย') })
    if (!options.dryRun) {
      await sla.updateSlaPolicy(ctx.mutation(R('operations', 'SLA')), await sla.getSlaPolicy(org), strip(slaParsed))
      await assign.updateAssignmentPolicySettings(ctx.mutation(R('operations', 'นโยบายมอบหมาย')), strip(assignParsed))
    }
    done('operations', 1, 0, ' (ตั้งทับ)')
  }

  // ── วันหยุด ─────────────────────────────────────────────────────────
  if (want('holidays')) {
    const q = await import('@/lib/settings/queries/holidays')
    const rows = (preset.sections.holidays?.rows ?? []).map(([date, name]) => ({ holidayDate: dateOnly(date), name }))
    const existing = new Set(
      (await db.publicHoliday.findMany({ where: { organizationId: org, deletedAt: null }, select: { holidayDate: true } })).map((h) => isoOf(h.holidayDate)),
    )
    const fresh = rows.filter((r) => !existing.has(isoOf(r.holidayDate)))
    if (fresh.length > 0 && !options.dryRun) await q.importHolidays(ctx.mutation(R('holidays', 'วันหยุดราชการ')), fresh)
    done('holidays', fresh.length, rows.length - fresh.length)
  }

  // ── สายอนุมัติ ──────────────────────────────────────────────────────
  if (want('approvalMatrices')) {
    const q = await import('@/lib/settings/queries/approval-matrix')
    let created = 0
    let skipped = 0
    for (const raw of preset.sections.approvalMatrices?.rows ?? []) {
      const exists = await db.approvalMatrix.findFirst({ where: { organizationId: org, condition: raw.condition, deletedAt: null }, select: { id: true } })
      if (exists !== null) { skipped++; continue }
      const roleIds: string[] = []
      for (const [name, roleGroup] of raw.approvalFlowRoles) {
        const role = await db.role.findFirst({ where: { organizationId: org, name, roleGroup, deletedAt: null }, select: { id: true } })
        if (role === null) throw new Error(`สายอนุมัติอ้าง role ${name}/${roleGroup} ที่ไม่มีในฐาน — รัน pnpm db:seed ก่อน`)
        roleIds.push(role.id)
      }
      const parsed = s.approvalMatrixCreateSchema.parse({
        condition: raw.condition,
        conditionThresholdSatang: raw.conditionThresholdSatang,
        approvalFlowRoleIds: roleIds,
        enforceSegregationOfDuties: raw.enforceSegregationOfDuties,
        reason: R('approvalMatrices', 'สายอนุมัติ'),
      })
      if (!options.dryRun) await q.createApprovalMatrix(ctx.mutation(R('approvalMatrices', `สายอนุมัติ ${raw.condition}`)), strip(parsed))
      created++
    }
    done('approvalMatrices', created, skipped)
  }

  // ── รอบจ่าย ─────────────────────────────────────────────────────────
  if (want('payoutCycles')) {
    const q = await import('@/lib/settings/queries/cycles')
    let created = 0
    let skipped = 0
    for (const raw of preset.sections.payoutCycles?.rows ?? []) {
      const parsed = s.cycleCreateSchema.parse({ ...raw, reason: R('payoutCycles', 'รอบจ่าย') })
      const exists = await db.billingPayoutCycle.findFirst({ where: { organizationId: org, name: parsed.name, deletedAt: null }, select: { id: true } })
      if (exists !== null) { skipped++; continue }
      if (!options.dryRun) await q.createCycle(ctx.mutation(R('payoutCycles', `รอบ ${parsed.name}`)), strip(parsed))
      created++
    }
    done('payoutCycles', created, skipped)
  }

  // ── ศูนย์ต้นทุน ─────────────────────────────────────────────────────
  if (want('costCenters')) {
    const q = await import('@/lib/settings/queries/cost-centers')
    let created = 0
    let skipped = 0
    for (const raw of preset.sections.costCenters?.rows ?? []) {
      const parsed = s.costCenterCreateSchema.parse({ ...raw, reason: R('costCenters', 'ศูนย์ต้นทุน') })
      const exists = await db.costCenter.findFirst({ where: { organizationId: org, name: parsed.name, deletedAt: null }, select: { id: true } })
      if (exists !== null) { skipped++; continue }
      if (!options.dryRun) await q.createCostCenter(ctx.mutation(R('costCenters', `ศูนย์ต้นทุน ${parsed.name}`)), strip(parsed))
      created++
    }
    done('costCenters', created, skipped)
  }

  // ── เทมเพลตเอกสาร ───────────────────────────────────────────────────
  if (want('documentTemplates')) {
    const q = await import('@/lib/settings/queries/tax-doc-templates')
    let changed = 0
    let same = 0
    for (const raw of preset.sections.documentTemplates?.rows ?? []) {
      const current = await db.taxDocumentTemplateSettings.findFirst({ where: { organizationId: org, documentType: raw.documentType } })
      if (current !== null && current.footerNote === raw.footerNote && current.printSignature === raw.printSignature) { same++; continue }
      if (!options.dryRun) {
        await q.updateTaxDocTemplate(ctx.mutation(R('documentTemplates', `เทมเพลต ${raw.documentType}`)), raw.documentType, {
          footerNote: raw.footerNote,
          printSignature: raw.printSignature,
        })
      }
      changed++
    }
    done('documentTemplates', changed, same)
  }

  const flagged = (Object.keys(preset.sections) as SectionKey[]).filter((key) => want(key) && preset.sections[key]?.needsAccountant)
  if (flagged.length > 0) report.push(`ℹ️  หมวดที่ควรให้นักบัญชียืนยัน: ${flagged.join(', ')}`)
  return report
}
