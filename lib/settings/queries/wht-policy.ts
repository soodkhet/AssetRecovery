import { emitAudit } from '@/lib/audit/audit'
import type { ExpenseType } from '@/lib/generated/prisma/enums'
import { prisma } from '@/lib/prisma'
import { SettingsError } from '@/lib/settings/errors'
import { toDateOnlyIso, toIso, type SettingsMutationContext } from '@/lib/settings/queries/shared'
import type { WhtPolicyDto, WhtPolicyOverviewDto } from '@/lib/settings/types'
import {
  DEFAULT_WHT_POLICY,
  isEffectiveFromAllowed,
  normalizeBaseExpenseTypes,
  resolveWhtPolicyAt,
  toWhtPolicyAuditPayload,
  type WhtCertificateMode,
  type WhtFilingMethod,
  type WhtIncomeCategory,
  type WhtIncomeTypeMode,
  type WhtPolicyEntry,
  type WhtPolicySettings,
} from '@/lib/settings/wht-policy'
import { filingDueDateOf, filingMethodResolveDate } from '@/lib/wht/wht'

/**
 * ค่าตั้งภาษีหัก ณ ที่จ่าย แบบ effective-dated (มติ PO 05/10/2569 UAT U3/U4/U5/U8/U16/U33 · `13` §6.4.2) — ชั้น DB
 *
 * - **insert-only** (แบบ `vat_rate_history`): ไม่มี PATCH/DELETE — แก้ค่า = เพิ่มแถวใหม่พร้อมวันที่มีผล
 *   (ประวัติเดิมอยู่ครบให้ตรวจย้อนหลัง) · วันเดียวกันหลายแถว ⇒ แถวล่าสุดชนะ
 * - วันที่มีผลย้อนหลังไม่ได้ (`WHT_POLICY_EFFECTIVE_DATE_PAST`) · มีผลกับรอบจ่ายที่สร้าง**ตั้งแต่**วันนั้น
 * - ทุกการเปลี่ยนลง audit พร้อม before (ค่าที่มีผลอยู่ ณ วันที่มีผลใหม่) / after + reason บังคับ (ภาษี)
 * - รอบจ่าย resolve ด้วย `resolveWhtPolicyForPayout()` แล้ว **snapshot** ลง `payout_batches` (ไฟล์ 17)
 */

const TARGET = 'wht_policy_history'

const policySelect = {
  id: true,
  effectiveFrom: true,
  baseExpenseTypes: true,
  certificateMode: true,
  incomeTypeMode: true,
  issueZeroRate402Certificate: true,
  inhouseIncomeCategory: true,
  outsourceIncomeCategory: true,
  filingMethod: true,
  reason: true,
  createdAt: true,
  createdByUser: { select: { fullName: true } },
} as const

interface PolicyRow {
  id: string
  effectiveFrom: Date
  baseExpenseTypes: ExpenseType[]
  certificateMode: WhtCertificateMode
  incomeTypeMode: WhtIncomeTypeMode
  issueZeroRate402Certificate: boolean
  inhouseIncomeCategory: WhtIncomeCategory
  outsourceIncomeCategory: WhtIncomeCategory
  filingMethod: WhtFilingMethod
  reason: string
  createdAt: Date
  createdByUser: { fullName: string }
}

function toEntry(row: PolicyRow): WhtPolicyEntry & { row: PolicyRow } {
  return {
    id: row.id,
    effectiveFrom: row.effectiveFrom,
    createdAt: row.createdAt,
    baseExpenseTypes: normalizeBaseExpenseTypes(row.baseExpenseTypes),
    certificateMode: row.certificateMode,
    incomeTypeMode: row.incomeTypeMode,
    issueZeroRate402Certificate: row.issueZeroRate402Certificate,
    inhouseIncomeCategory: row.inhouseIncomeCategory,
    outsourceIncomeCategory: row.outsourceIncomeCategory,
    filingMethod: row.filingMethod,
    row,
  }
}

function toDto(entry: WhtPolicyEntry & { row: PolicyRow }, currentId: string | null): WhtPolicyDto {
  return {
    id: entry.id,
    effectiveFrom: toDateOnlyIso(entry.effectiveFrom),
    baseExpenseTypes: [...entry.baseExpenseTypes],
    certificateMode: entry.certificateMode,
    incomeTypeMode: entry.incomeTypeMode,
    issueZeroRate402Certificate: entry.issueZeroRate402Certificate,
    inhouseIncomeCategory: entry.inhouseIncomeCategory,
    outsourceIncomeCategory: entry.outsourceIncomeCategory,
    filingMethod: entry.filingMethod,
    reason: entry.row.reason,
    createdAt: toIso(entry.createdAt),
    createdByName: entry.row.createdByUser.fullName,
    isCurrent: entry.id === currentId,
  }
}

/** client ที่อ่านค่าตั้งได้ — `prisma` หรือ tx client (structural แบบ `PeriodQueryClient`) */
type PolicyReadClient = Pick<typeof prisma, 'whtPolicyHistory'>

async function loadEntries(organizationId: string, client: PolicyReadClient = prisma) {
  const rows = await client.whtPolicyHistory.findMany({ where: { organizationId }, select: policySelect })
  return rows.map(toEntry)
}

function valuesOf(entry: WhtPolicySettings | null): WhtPolicySettings {
  if (entry === null) return DEFAULT_WHT_POLICY
  return {
    baseExpenseTypes: [...entry.baseExpenseTypes],
    certificateMode: entry.certificateMode,
    incomeTypeMode: entry.incomeTypeMode,
    issueZeroRate402Certificate: entry.issueZeroRate402Certificate,
    inhouseIncomeCategory: entry.inhouseIncomeCategory,
    outsourceIncomeCategory: entry.outsourceIncomeCategory,
    filingMethod: entry.filingMethod,
  }
}

/**
 * **วิธียื่น ภ.ง.ด. ที่มีผล ณ วันหนึ่ง** (มติ PO 05/10/2569 UAT U45) — ไม่มีแถว = ออนไลน์ (ค่าเริ่มต้น)
 * สรุปรอบนำส่งเรียกด้วย `filingMethodResolveDate()` (วันที่ 1 ของเดือนที่ยื่น) ภายในทรานแซกชันเดียวกัน
 */
export async function resolveWhtFilingMethod(
  client: PolicyReadClient,
  organizationId: string,
  at: Date,
): Promise<WhtFilingMethod> {
  return valuesOf(resolveWhtPolicyAt(await loadEntries(organizationId, client), at)).filingMethod
}

/** ค่าที่มีผลวันนี้ + ประวัติทั้งหมด (ใหม่ → เก่า) + ค่าเริ่มต้นตามมติ */
export async function getWhtPolicyOverview(organizationId: string, now: Date = new Date()): Promise<WhtPolicyOverviewDto> {
  const entries = await loadEntries(organizationId)
  const current = resolveWhtPolicyAt(entries, now)
  const sorted = [...entries].sort(
    (a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime() || b.createdAt.getTime() - a.createdAt.getTime(),
  )
  return {
    current: valuesOf(current),
    currentId: current?.id ?? null,
    isDefault: current === null,
    defaults: valuesOf(DEFAULT_WHT_POLICY),
    history: sorted.map((entry) => toDto(entry, current?.id ?? null)),
  }
}

/**
 * **resolver ของรอบจ่าย** — ค่าที่มีผล ณ เวลาสร้างรอบ (วันตามปฏิทินไทย) · ไม่มีแถว = ค่าเริ่มต้นตามมติ
 * ผู้เรียก snapshot ทั้ง `policyId` และค่าทั้ง 3 ลงรอบ (ห้ามอ่านค่าตั้งปัจจุบันมาตีความรอบเก่า)
 */
export async function resolveWhtPolicyForPayout(
  organizationId: string,
  at: Date,
): Promise<{ policyId: string | null; values: WhtPolicySettings }> {
  const entry = resolveWhtPolicyAt(await loadEntries(organizationId), at)
  return { policyId: entry?.id ?? null, values: valuesOf(entry) }
}

/**
 * คิดวันกำหนดยื่นของสรุปรอบนำส่งที่ยัง `pending` ใหม่ตามวิธียื่นที่มีผล (U45) — idempotent: แก้เฉพาะแถวที่เปลี่ยนจริง
 * คืนรายการที่เปลี่ยน (ลง audit ของค่าตั้งตัวที่ทำให้เปลี่ยน) · รอบที่ยื่นแล้ว (`filed`) ไม่แตะ
 */
async function refreshPendingFilingDueDates(
  tx: Pick<typeof prisma, 'whtPolicyHistory' | 'whtFilingSummary'>,
  organizationId: string,
): Promise<{ summary_id: string; filing_method: WhtFilingMethod; filing_due_date: string }[]> {
  const pending = await tx.whtFilingSummary.findMany({
    where: { organizationId, status: 'pending' },
    select: { id: true, filingMethod: true, filingDueDate: true, period: { select: { yearBe: true, month: true } } },
  })
  if (pending.length === 0) return []
  const entries = await loadEntries(organizationId, tx)
  const changed: { summary_id: string; filing_method: WhtFilingMethod; filing_due_date: string }[] = []
  for (const row of pending) {
    const period = { yearBe: row.period.yearBe, month: row.period.month }
    const filingMethod = valuesOf(resolveWhtPolicyAt(entries, filingMethodResolveDate(period))).filingMethod
    const filingDueDate = filingDueDateOf(period, filingMethod)
    if (filingMethod === row.filingMethod && filingDueDate.getTime() === row.filingDueDate.getTime()) continue
    await tx.whtFilingSummary.update({ where: { id: row.id }, data: { filingMethod, filingDueDate } })
    changed.push({ summary_id: row.id, filing_method: filingMethod, filing_due_date: toDateOnlyIso(filingDueDate) })
  }
  return changed
}

export interface WhtPolicyCreateValues extends WhtPolicySettings {
  effectiveFrom: Date
}

export async function createWhtPolicy(
  context: SettingsMutationContext,
  values: WhtPolicyCreateValues,
  now: Date = new Date(),
): Promise<WhtPolicyDto> {
  const organizationId = context.actor.organizationId
  if (!isEffectiveFromAllowed(values.effectiveFrom, now)) {
    throw new SettingsError('WHT_POLICY_EFFECTIVE_DATE_PAST', {
      detail: `effective_from=${toDateOnlyIso(values.effectiveFrom)}`,
    })
  }
  const baseExpenseTypes = normalizeBaseExpenseTypes(values.baseExpenseTypes)
  // before = ค่าที่จะมีผลในวันนั้นถ้าไม่เพิ่มแถวนี้ (ให้ audit เห็นว่าเปลี่ยนจากอะไรเป็นอะไร)
  const before = resolveWhtPolicyAt(await loadEntries(organizationId), values.effectiveFrom)

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.whtPolicyHistory.create({
      data: {
        organizationId,
        effectiveFrom: values.effectiveFrom,
        baseExpenseTypes,
        certificateMode: values.certificateMode,
        incomeTypeMode: values.incomeTypeMode,
        issueZeroRate402Certificate: values.issueZeroRate402Certificate,
        inhouseIncomeCategory: values.inhouseIncomeCategory,
        outsourceIncomeCategory: values.outsourceIncomeCategory,
        filingMethod: values.filingMethod,
        reason: context.reason,
        createdBy: context.actor.id,
      },
      select: policySelect,
    })

    // U45 — วิธียื่นเปลี่ยน ⇒ คิดวันกำหนดยื่นของรอบนำส่งที่ยังไม่ยื่นใหม่ (ค่าตั้งที่มีผล ณ วันที่ 1 ของเดือนที่ยื่น)
    const refreshedSummaries = await refreshPendingFilingDueDates(tx, organizationId)

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'create',
        targetType: TARGET,
        targetId: row.id,
        before: toWhtPolicyAuditPayload(valuesOf(before)),
        after: {
          ...toWhtPolicyAuditPayload({
          baseExpenseTypes,
          certificateMode: values.certificateMode,
          incomeTypeMode: values.incomeTypeMode,
          issueZeroRate402Certificate: values.issueZeroRate402Certificate,
          inhouseIncomeCategory: values.inhouseIncomeCategory,
          outsourceIncomeCategory: values.outsourceIncomeCategory,
          filingMethod: values.filingMethod,
          effectiveFrom: toDateOnlyIso(values.effectiveFrom),
          }),
          ...(refreshedSummaries.length === 0 ? {} : { refreshed_filing_summaries: refreshedSummaries }),
        },
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )

    return row
  })

  const entry = toEntry(created)
  const current = resolveWhtPolicyAt([...(await loadEntries(organizationId))], now)
  return toDto(entry, current?.id ?? null)
}
