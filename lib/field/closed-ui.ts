import { aggregateExpenseStatus } from '@/lib/field/expense-ui'
import { matchesMonth, monthKeyOfInstant } from '@/lib/field/month-filter'
import type { FieldCaseListItemDto } from '@/lib/field/types'
import type { ExpenseStatus } from '@/lib/generated/prisma/enums'

/**
 * ตัวกรอง + ข้อความของแท็บ "จบงาน" (`41` §7.11) — **pure ล้วน**
 *
 * - pill สถานะ 4 ตัว (รวม "ถูกโอนไป") ทำงาน**ร่วมกับ** dropdown เดือน
 * - การ์ด `reassigned_away` **ไม่มีสถานะค่าใช้จ่าย** (ไม่ใช่ผลการปิดงาน จึงไม่มีรายการเบิกเกิดขึ้น)
 *   และใช้ "เวลาที่ถูกโอน" แทน "วันปิดงาน" ทั้งบนการ์ดและในตัวกรองเดือน
 */

export const CLOSED_FILTERS = ['all', 'success', 'fail', 'reassigned'] as const
export type ClosedFilter = (typeof CLOSED_FILTERS)[number]

export const CLOSED_FILTER_LABEL: Readonly<Record<ClosedFilter, string>> = {
  all: 'ทั้งหมด',
  success: 'สำเร็จ',
  fail: 'ไม่สำเร็จ',
  reassigned: 'ถูกโอนไป',
}

/** คลาสของ pill ตอนถูกเลือก (mockup ไฟล์ 41 — โทนสีเดียวกับ statusBadge ของสถานะนั้น) */
export const CLOSED_FILTER_ACTIVE_CLASS: Readonly<Record<ClosedFilter, string>> = {
  all: 'bg-slate-900 text-white',
  success: 'bg-emerald-600 text-white',
  fail: 'bg-slate-600 text-white',
  reassigned: 'bg-purple-600 text-white',
}

export function matchesClosedFilter(item: FieldCaseListItemDto, filter: ClosedFilter): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'success':
      return item.status === 'closed_success'
    case 'fail':
      return item.status === 'closed_fail'
    case 'reassigned':
      return item.status === 'reassigned_away'
  }
}

/**
 * เวลาอ้างอิงของการ์ด (ISO UTC) — ปิดงานใช้ `closedAt` · ถูกโอนใช้เวลาที่ถูกโอน
 * ใช้ทั้งการเรียงลำดับ การกรองเดือน และข้อความบนการ์ด (`41` §7.11)
 */
export function closedCardInstant(item: FieldCaseListItemDto): string | null {
  return item.status === 'reassigned_away' ? (item.reassignedAway?.reassignedAt ?? null) : item.closedAt
}

/** ตัวเลือกเดือนของแท็บนี้มาจากเวลาอ้างอิงของการ์ด (ไม่ใช่วันที่มอบหมาย) */
export function closedMonthKeys(items: readonly FieldCaseListItemDto[]): (string | null)[] {
  return items.map((item) => monthKeyOfInstant(closedCardInstant(item)))
}

/** pill + เดือนทำงานร่วมกัน (`41` §7.11) — เรียงใหม่→เก่าเสมอ */
export function filterClosedCases(
  items: readonly FieldCaseListItemDto[],
  filter: ClosedFilter,
  month: string,
): FieldCaseListItemDto[] {
  return items
    .filter((item) => matchesClosedFilter(item, filter))
    .filter((item) => matchesMonth(month, monthKeyOfInstant(closedCardInstant(item))))
    .sort((a, b) => (closedCardInstant(b) ?? '').localeCompare(closedCardInstant(a) ?? ''))
}

/**
 * สถานะค่าใช้จ่ายที่แสดงบนการ์ด — `reassigned_away` คืน `null` **เสมอ** (`41` §7.11)
 * เคสที่ไม่มีรายการเบิกเลย (DEC-006/D6) ก็คืน `null` ⇒ หน้าจอไม่แสดงแถวนั้น
 */
export function closedCardExpenseStatus(item: FieldCaseListItemDto): ExpenseStatus | null {
  if (item.status === 'reassigned_away') return null
  return aggregateExpenseStatus(item.expenseStatuses)
}

/** ข้อความมาตรฐานเมื่อถูกโอนเพราะหมดเวลาตอบรับ (`40` §11 auto-resolve) */
export const REASSIGN_TIMEOUT_REASON = 'เกินกำหนดเวลาตอบรับ'

/**
 * เหตุผลที่ถูกโอน (`41` §7.11) — หมดเวลาตอบรับใช้ข้อความมาตรฐาน
 * ยินยอมเอง = เหตุผลที่ผู้จัดการระบุตอนส่งคำขอ
 */
export function reassignReasonText(item: FieldCaseListItemDto): string | null {
  const info = item.reassignedAway
  if (info === null || info === undefined) return null
  return info.resolution === 'timeout_auto' ? REASSIGN_TIMEOUT_REASON : info.reason
}
