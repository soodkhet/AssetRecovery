import { ACTIVE_EXPENSE_STATUSES } from '@/lib/field/expense-status'
import { matchesMonth, monthKeyOfDateOnly } from '@/lib/field/month-filter'
import type { FieldExpenseDto } from '@/lib/field/types'
import type { ExpenseStatus, ExpenseType } from '@/lib/generated/prisma/enums'
import type { StatusBadgeGroup } from '@/lib/ui/status-badge'

/**
 * ข้อความ / การจัดกลุ่ม / ตัวกรองของหน้า "เบิกค่าใช้จ่าย" (`41` §6.6 · §7.9) — **pure ล้วน**
 *
 * ⚠️ หน้าจอ **ห้าม if สถานะเอง** — ป้าย/สี/สิทธิ์ปุ่มต้องมาจากที่นี่ · การเปลี่ยนสถานะยังผ่าน
 * `expense-status.ts` (state machine `23` §6.3) เท่านั้น
 * ⚠️ เงินเป็น **satang** ตลอดสาย (Rule 01) — ที่นี่แค่บวก ไม่หาร 100 (หน้าจอใช้ `fmtSatang`)
 */

export const EXPENSE_STATUS_LABEL: Readonly<Record<ExpenseStatus, string>> = {
  pending_warehouse_confirm: 'รอยืนยันคืนคลัง',
  pending_approval: 'รออนุมัติจ่าย',
  pending_finance_approval: 'รอการเงินอนุมัติ',
  approved: 'อนุมัติแล้ว',
  rejected: 'ไม่อนุมัติ',
  needs_revision: 'ถูกตีกลับ — รอแก้ไข',
  superseded: 'ถูกแทนที่แล้ว',
}

/** 10 กลุ่มสีตายตัวของ `04` §8.1 — ห้ามใส่คลาสสีเองในหน้าจอ */
const EXPENSE_STATUS_GROUP: Readonly<Record<ExpenseStatus, StatusBadgeGroup>> = {
  pending_warehouse_confirm: 'cleared',
  pending_approval: 'pending',
  pending_finance_approval: 'sent',
  approved: 'success',
  rejected: 'critical',
  needs_revision: 'warning',
  superseded: 'superseded',
}

export function expenseStatusLabel(status: ExpenseStatus): string {
  return EXPENSE_STATUS_LABEL[status]
}

export function expenseStatusBadgeGroup(status: ExpenseStatus): StatusBadgeGroup {
  return EXPENSE_STATUS_GROUP[status]
}

export const EXPENSE_TYPE_LABEL: Readonly<Record<ExpenseType, string>> = {
  fuel: 'ค่าน้ำมัน',
  allowance: 'เบี้ยเลี้ยง',
  commission: 'คอมมิชชั่น',
  no_success_fee: 'เบี้ยเสี่ยง',
  hotel: 'ค่าที่พัก',
  receipt: 'ค่าใช้จ่ายตามใบเสร็จ',
  manual: 'รายการกรอกเอง',
}

/** ไอคอน emoji หน้ารายการตาม mockup ไฟล์ 41 (ไม่ใช่ระบบสีของ `04` §8.1 จึงไม่แตะ statusBadge) */
export const EXPENSE_TYPE_ICON: Readonly<Record<ExpenseType, string>> = {
  fuel: '⛽',
  allowance: '🍽️',
  commission: '💰',
  no_success_fee: '🛡️',
  hotel: '🏨',
  receipt: '🧾',
  manual: '📝',
}

export function expenseTypeLabel(type: ExpenseType): string {
  return EXPENSE_TYPE_LABEL[type]
}

/** สถานะที่ยังมีผลต่อยอด (ไม่ถูกแทนที่/ไม่ถูกปฏิเสธถาวร) — ชุดเดียวกับที่ BE ใช้สรุปยอดหัวจอ */
export function isActiveExpense(status: ExpenseStatus): boolean {
  return ACTIVE_EXPENSE_STATUSES.includes(status)
}

/**
 * รายการที่ **เจ้าของรายการเท่านั้น** แก้แล้วส่งใหม่ได้ (`41` §6.6 · §8 `resubmit_expense`)
 * ยอด/ใบเสร็จแก้ได้เฉพาะรายการกลุ่ม "เบิกแยก" — รายการที่ระบบคำนวณให้แก้ได้แค่หมายเหตุ (BE บังคับซ้ำ)
 */
export function canResubmitExpense(item: FieldExpenseDto): boolean {
  return item.status === 'needs_revision'
}

export function isSeparateExpense(item: FieldExpenseDto): boolean {
  return item.caseId === null
}

// ── ตัวกรองสถานะ (`41` §7.9) ────────────────────────────────────────────────

export const EXPENSE_STATUS_FILTERS = ['all', 'warehouse', 'approval', 'approved', 'rejected'] as const
export type ExpenseStatusFilter = (typeof EXPENSE_STATUS_FILTERS)[number]

export const EXPENSE_STATUS_FILTER_LABEL: Readonly<Record<ExpenseStatusFilter, string>> = {
  all: 'ทุกสถานะ',
  warehouse: 'รอยืนยันคืนคลัง',
  approval: 'รออนุมัติจ่าย',
  approved: 'อนุมัติแล้ว',
  rejected: 'ไม่อนุมัติ',
}

/**
 * สถานะที่นับเข้าตัวกรองแต่ละตัว
 * `needs_revision` ไม่อยู่ตัวไหนเลยโดยตั้งใจ — ถูกยกขึ้นบล็อกบนสุดเสมอ (ดู {@link splitExpensesNeedingRevision})
 */
const FILTER_STATUSES: Readonly<Record<ExpenseStatusFilter, readonly ExpenseStatus[]>> = {
  all: [],
  warehouse: ['pending_warehouse_confirm'],
  approval: ['pending_approval', 'pending_finance_approval'],
  approved: ['approved'],
  rejected: ['rejected'],
}

/** ตัวเลือกของ `<select>` แต่ละแท็บ (ตาม mockup ไฟล์ 41 — คนละชุดกันโดยตั้งใจ) */
export const CASE_BOUND_STATUS_FILTERS: readonly ExpenseStatusFilter[] = ['all', 'warehouse', 'approval', 'approved']
export const SEPARATE_STATUS_FILTERS: readonly ExpenseStatusFilter[] = ['all', 'approval', 'approved', 'rejected']

export function matchesExpenseStatusFilter(status: ExpenseStatus, filter: ExpenseStatusFilter): boolean {
  return filter === 'all' ? true : FILTER_STATUSES[filter].includes(status)
}

/**
 * แยกรายการที่ถูกตีกลับออกมาเป็นบล็อกบนสุด (`41` §6.6 — เฉพาะเจ้าของรายการแก้ได้)
 * แบบเดียวกับบล็อกส้มของแท็บ "กำลังติดตาม" (§7.5) เพื่อไม่ให้งานค้างของพนักงานจมอยู่ใต้ตัวกรอง
 */
export interface ExpenseRevisionSplit {
  needsRevision: FieldExpenseDto[]
  rest: FieldExpenseDto[]
}

export function splitExpensesNeedingRevision(items: readonly FieldExpenseDto[]): ExpenseRevisionSplit {
  return {
    needsRevision: items.filter((item) => item.status === 'needs_revision'),
    rest: items.filter((item) => item.status !== 'needs_revision'),
  }
}

// ── แท็บ "ผูกกับเคส" — 1 เคส = 1 แถวสรุป (`41` §7.9) ────────────────────────

export interface ExpenseCaseGroup {
  caseId: string
  caseRef: string | null
  debtorName: string | null
  /** วันที่ล่าสุดของรายการในกลุ่ม (`YYYY-MM-DD`) — หน้าจอแปลงเป็น พ.ศ. ด้วย `fmtDate` */
  expenseDate: string
  /** ยอดรวมของรายการที่ยังมีผล (fuel + allowance) — satang */
  totalSatang: number
  /** สถานะรวมของกลุ่ม (ดู {@link aggregateExpenseStatus}) */
  status: ExpenseStatus
  /** รายการที่ยังมีผล เรียงวันใหม่→เก่า */
  items: FieldExpenseDto[]
  /** รายการรอบก่อนหน้าที่ถูกแทนที่แล้ว (`41` §10.1) — แสดงแยกบล็อกล่าง ไม่รวมในยอด */
  supersededItems: FieldExpenseDto[]
}

/**
 * ลำดับความ "ต้องรู้ก่อน" ของสถานะรวม — รายการที่ต้องลงมือแก้มาก่อน แล้วไล่ตามขั้นอนุมัติ
 * ใช้ทั้งแถวสรุปต่อเคส (§7.9) และป้ายสถานะค่าใช้จ่ายบนการ์ดแท็บจบงาน (§7.11)
 */
const STATUS_PRIORITY: readonly ExpenseStatus[] = [
  'needs_revision',
  'pending_warehouse_confirm',
  'pending_approval',
  'pending_finance_approval',
  'approved',
  'rejected',
  'superseded',
]

/** สถานะรวมของหลายรายการ — คืน `null` เมื่อไม่มีรายการเลย (เช่น เคสที่ไม่มีค่าใช้จ่ายตาม DEC-006/D6) */
export function aggregateExpenseStatus(statuses: readonly ExpenseStatus[]): ExpenseStatus | null {
  for (const status of STATUS_PRIORITY) {
    if (statuses.includes(status)) return status
  }
  return null
}

/** จัดกลุ่มรายการ "ผูกกับเคส" ตามเคส เรียงวันใหม่→เก่า (`41` §7.9) */
export function groupExpensesByCase(items: readonly FieldExpenseDto[]): ExpenseCaseGroup[] {
  const byCase = new Map<string, FieldExpenseDto[]>()
  for (const item of items) {
    if (item.caseId === null) continue
    const bucket = byCase.get(item.caseId)
    if (bucket === undefined) byCase.set(item.caseId, [item])
    else bucket.push(item)
  }

  const groups = [...byCase.entries()].map(([caseId, list]) => {
    const sorted = [...list].sort((a, b) => b.expenseDate.localeCompare(a.expenseDate))
    const active = sorted.filter((item) => item.status !== 'superseded')
    const first = active[0] ?? sorted[0]
    return {
      caseId,
      caseRef: first?.caseRef ?? null,
      debtorName: first?.debtorName ?? null,
      expenseDate: first?.expenseDate ?? '',
      // ยอดรวมนับเฉพาะรายการที่ยังมีผล — rejected/superseded ไม่เข้ายอด (ตรงกับสรุปหัวจอของ BE)
      totalSatang: sorted
        .filter((item) => isActiveExpense(item.status))
        .reduce((sum, item) => sum + item.grossSatang, 0),
      status: aggregateExpenseStatus(active.map((item) => item.status)) ?? 'superseded',
      items: active,
      supersededItems: sorted.filter((item) => item.status === 'superseded'),
    }
  })

  return groups.sort((a, b) => b.expenseDate.localeCompare(a.expenseDate) || a.caseId.localeCompare(b.caseId))
}

/** ตัวกรองสถานะของแท็บ "ผูกกับเคส" — เทียบกับ**สถานะรวมของกลุ่ม** ไม่ใช่รายการย่อย */
export function filterCaseGroups(
  groups: readonly ExpenseCaseGroup[],
  filter: ExpenseStatusFilter,
): ExpenseCaseGroup[] {
  return groups.filter((group) => matchesExpenseStatusFilter(group.status, filter))
}

// ── แท็บ "เบิกแยก" — filter สถานะ + เดือน (`41` §7.9) ───────────────────────

export function filterSeparateExpenses(
  items: readonly FieldExpenseDto[],
  filter: ExpenseStatusFilter,
  month: string,
): FieldExpenseDto[] {
  return items.filter(
    (item) =>
      matchesExpenseStatusFilter(item.status, filter) &&
      matchesMonth(month, monthKeyOfDateOnly(item.expenseDate)),
  )
}

/** ยอดรวมของรายการชุดหนึ่ง (satang) — นับเฉพาะที่ยังมีผล */
export function sumActiveExpenses(items: readonly FieldExpenseDto[]): number {
  return items.filter((item) => isActiveExpense(item.status)).reduce((sum, item) => sum + item.grossSatang, 0)
}
