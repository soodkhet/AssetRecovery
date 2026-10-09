import type { Preset } from './apply'
import type { PresetContext } from './context'

/**
 * เก็บค่าตั้งปัจจุบันขององค์กรเป็นไฟล์ preset (รูปเดียวกับ `presets/thai-standard.json`) — เรียกใช้ภายหลังด้วย `--apply`
 * อ้างข้ามตารางด้วยชื่อ (Tax Profile · role) ไม่ใช้ id ⇒ ใช้กับฐานอื่น/หลัง reset ได้
 * ไม่รวมข้อมูลเฉพาะธุรกิจ (องค์กร · บัญชีธนาคาร · รูปแบบไฟล์ธนาคาร · แผน · ทีม · บริษัท · ผู้ใช้)
 */
export async function exportPreset(ctx: PresetContext): Promise<Preset> {
  const db = ctx.db
  const where = { organizationId: ctx.organizationId }
  const live = { ...where, deletedAt: null }
  const iso = (date: Date) => date.toISOString().slice(0, 10)
  const keep = (basis: string) => ({ basis, needsAccountant: false })

  const profiles = await db.taxProfile.findMany({ where: live, orderBy: { createdAt: 'asc' } })
  const nameOf = new Map(profiles.map((p) => [p.id, p.name]))
  const defaults = await db.taxProfileDefaultHistory.findFirst({ where, orderBy: { createdAt: 'desc' } })
  const roles = new Map((await db.role.findMany({ where: live, select: { id: true, name: true, roleGroup: true } })).map((r) => [r.id, r]))
  const finance = await db.financePolicySettings.findUnique({ where: { organizationId: ctx.organizationId } })
  const retention = await db.dataRetentionSettings.findUnique({ where: { organizationId: ctx.organizationId } })
  const assignment = await db.assignmentPolicySettings.findUnique({ where: { organizationId: ctx.organizationId } })

  const preset: Preset = {
    name: `export-${new Date().toISOString().slice(0, 10)}`,
    title: 'ค่าตั้งที่ส่งออกจากระบบ',
    version: new Date().toISOString().slice(0, 10),
    description: 'ส่งออกด้วย pnpm settings:preset --export — ใช้กลับด้วย --apply --preset=<ไฟล์นี้>',
    sections: {
      vatRates: {
        ...keep('ส่งออกจากระบบ'),
        rows: (await db.vatRateHistory.findMany({ where, orderBy: { effectiveFrom: 'asc' } })).map((v) => ({
          ratePct: Number(v.ratePct), effectiveFrom: iso(v.effectiveFrom), effectiveTo: v.effectiveTo === null ? null : iso(v.effectiveTo), note: v.note,
        })),
      },
      taxProfiles: {
        ...keep('ส่งออกจากระบบ'),
        rows: profiles.map((p) => ({
          name: p.name, whtPct: Number(p.whtPct), whtBasis: p.whtBasis, whtMinThresholdSatang: p.whtMinThresholdSatang,
          incomeTypeCode: p.incomeTypeCode, incomeType: p.incomeTypeCode === 'other' ? p.incomeType : '', filingForm: p.filingForm,
        })),
      },
      ...(defaults === null ? {} : {
        taxProfileDefaults: {
          ...keep('ส่งออกจากระบบ'),
          slots: {
            inhouseIndividual: nameOf.get(defaults.inhouseIndividualTaxProfileId ?? '') ?? null,
            inhouseCorporate: nameOf.get(defaults.inhouseCorporateTaxProfileId ?? '') ?? null,
            outsourceIndividual: nameOf.get(defaults.outsourceIndividualTaxProfileId ?? '') ?? null,
            outsourceCorporate: nameOf.get(defaults.outsourceCorporateTaxProfileId ?? '') ?? null,
          },
        },
      }),
      whtPolicy: {
        ...keep('ส่งออกจากระบบ'),
        rows: (await db.whtPolicyHistory.findMany({ where, orderBy: { effectiveFrom: 'asc' } })).map((w) => ({
          effectiveFrom: iso(w.effectiveFrom), baseExpenseTypes: w.baseExpenseTypes, certificateMode: w.certificateMode,
          incomeTypeMode: w.incomeTypeMode, issueZeroRate402Certificate: w.issueZeroRate402Certificate,
          inhouseIncomeCategory: w.inhouseIncomeCategory, outsourceIncomeCategory: w.outsourceIncomeCategory,
          allowGrossUpConditions: w.allowGrossUpConditions, filingMethod: w.filingMethod,
        })),
      },
      ...(finance === null ? {} : {
        financePolicy: {
          ...keep('ส่งออกจากระบบ'),
          values: {
            advanceMaxAmountPerRequestSatang: finance.advanceMaxAmountPerRequestSatang, requirePayeeIdDocument: finance.requirePayeeIdDocument,
            arAgingBuckets: finance.arAgingBuckets, writeOffToleranceSatang: finance.writeOffToleranceSatang,
            substituteReceiptMaxPerDocSatang: finance.substituteReceiptMaxPerDocSatang, substituteReceiptMaxPerMonthSatang: finance.substituteReceiptMaxPerMonthSatang,
          },
        },
      }),
      ...(retention === null ? {} : { dataRetention: { ...keep('ส่งออกจากระบบ'), values: { debtorDocumentRetentionYears: retention.debtorDocumentRetentionYears } } }),
      holidays: {
        ...keep('ส่งออกจากระบบ'),
        rows: (await db.publicHoliday.findMany({ where: live, orderBy: { holidayDate: 'asc' } })).map((h) => [iso(h.holidayDate), h.name] as [string, string]),
      },
      approvalMatrices: {
        ...keep('ส่งออกจากระบบ'),
        rows: (await db.approvalMatrix.findMany({ where: live, orderBy: { createdAt: 'asc' } })).map((m) => ({
          condition: m.condition,
          conditionThresholdSatang: m.conditionThresholdSatang,
          approvalFlowRoles: m.approvalFlowRoleIds.map((id) => {
            const role = roles.get(id)
            if (role === undefined) throw new Error(`สายอนุมัติ "${m.condition}" อ้าง role ที่ไม่มีแล้ว (${id})`)
            return [role.name, role.roleGroup] as [string, typeof role.roleGroup]
          }),
          enforceSegregationOfDuties: m.enforceSegregationOfDuties,
        })),
      },
      payoutCycles: {
        ...keep('ส่งออกจากระบบ — เฉพาะรอบที่ไม่ผูกบริษัท (รอบเลือกบริษัทต้องตั้งใหม่หลังสร้างบริษัท)'),
        rows: (await db.billingPayoutCycle.findMany({ where: { ...live, scopeKind: { not: 'selected_companies' } }, orderBy: { createdAt: 'asc' } })).map((c) => ({
          name: c.name, type: c.type, cutoffRuleType: c.cutoffRuleType, cutoffDates: c.cutoffDates,
          dueRuleType: c.dueRuleType, dueRuleValue: c.dueRuleValue, scopeKind: c.scopeKind, companyIds: [],
        })),
      },
      costCenters: {
        ...keep('ส่งออกจากระบบ'),
        rows: (await db.costCenter.findMany({ where: live, orderBy: { createdAt: 'asc' } })).map((c) => ({ name: c.name, description: c.description, isActive: c.isActive })),
      },
      documentTemplates: {
        ...keep('ส่งออกจากระบบ'),
        rows: (await db.taxDocumentTemplateSettings.findMany({ where, orderBy: { documentType: 'asc' } })).map((t) => ({
          documentType: t.documentType, footerNote: t.footerNote, printSignature: t.printSignature,
        })),
      },
      ...(assignment === null ? {} : {
        operations: {
          ...keep('ส่งออกจากระบบ'),
          values: {
            slaAlertHours: assignment.slaAlertHours, reassignTimeoutHours: assignment.reassignTimeoutHours,
            supervisorCanAssignSystem: assignment.supervisorCanAssignSystem, supervisorCanAssignInhouse: assignment.supervisorCanAssignInhouse,
            supervisorCanAssignOutsource: assignment.supervisorCanAssignOutsource, acceptDeadlineHours: assignment.acceptDeadlineHours,
          },
        },
      }),
    },
  }
  return preset
}
