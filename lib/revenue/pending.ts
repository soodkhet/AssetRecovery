import type { RevenueSkipReason } from '@/lib/warehouse/revenue-service'

/**
 * "เคสรอเกิดรายได้" (staging E-008) — **pure** แปลเหตุผลจากเกต `19` §6.1 (`evaluateCaseRevenueGates`)
 * เป็นข้อความบนหน้าจอ · เกตอยู่ที่ `revenue-trigger-rules.ts` ที่เดียว ที่นี่แค่แปล
 *
 * รายได้เกิดเมื่อผ่านครบ 3 เงื่อนไข: วันลงพื้นที่ถูกสรุปรายการรายวันแล้ว · รายการเบิกของเคสอนุมัติครบ ·
 * คลังยืนยันส่งมอบล็อตแล้ว (เคสปิดสำเร็จ)
 */

/** เหตุผลที่แสดงในรายการ — `gates_passed` = ผ่านเกตครบแต่ยังไม่มีแถวรายได้ (เช่น ไม่มีฐานคำนวณ) */
export type RevenuePendingReason = Extract<
  RevenueSkipReason,
  'field_days_not_settled' | 'expense_not_approved' | 'warehouse_gate' | 'no_snapshot' | 'missing_basis'
> | 'gates_passed'

const REASON_TEXT: Readonly<Record<RevenuePendingReason, string>> = {
  field_days_not_settled: 'วันลงพื้นที่ยังไม่ถูกสรุปเป็นรายการรายวัน (งานรายวันรันหลังเที่ยงคืน)',
  expense_not_approved: 'รายการเบิกของเคสยังอนุมัติไม่ครบ',
  warehouse_gate: 'คลังยังไม่ยืนยันส่งมอบล็อตของเครื่อง',
  no_snapshot: 'เคสยังไม่มีค่าบริการที่บันทึกตอนรับเคส',
  missing_basis: 'ยังไม่มีฐานคำนวณ (ยอดหนี้คงเหลือของเคส)',
  gates_passed: 'ผ่านครบทุกเงื่อนไขแล้ว — ตรวจฐานคำนวณ (ยอดหนี้คงเหลือ) ของเคส',
}

export function revenuePendingReasonText(reason: RevenuePendingReason): string {
  return REASON_TEXT[reason]
}

/**
 * เหตุผลที่ต้องแสดงในรายการ — `null` = ไม่ต้องแสดง (มีรายได้แล้ว / ยังไม่ปิดงาน / แบบค่าบริการไม่คิดเงินเมื่อไม่สำเร็จ)
 */
export function revenuePendingReasonOf(skip: RevenueSkipReason | null): RevenuePendingReason | null {
  switch (skip) {
    case null:
      return 'gates_passed'
    case 'field_days_not_settled':
    case 'expense_not_approved':
    case 'warehouse_gate':
    case 'no_snapshot':
    case 'missing_basis':
      return skip
    case 'already_created':
    case 'no_outcome':
    case 'model_excludes_fail':
      return null
  }
}

/** ข้อความอธิบายบนหน้ารายได้ — เงื่อนไขครบ 3 ข้อ (staging E-008: ข้อความเดิมพูดถึงแค่ 2 ข้อ) */
export const REVENUE_TRIGGER_HINT =
  'เกิดอัตโนมัติเมื่อครบ 3 เงื่อนไข: วันลงพื้นที่ถูกสรุปรายการรายวันแล้ว · รายการเบิกอนุมัติครบ · คลังยืนยันส่งมอบ'

/** แถวของ `GET /api/finance/revenue-pending` */
export interface RevenuePendingItemDto {
  caseId: string
  caseRef: string
  trackingRound: number
  companyName: string
  debtorName: string | null
  outcome: string
  closedAt: string | null
  reason: RevenuePendingReason
  reasonText: string
}
