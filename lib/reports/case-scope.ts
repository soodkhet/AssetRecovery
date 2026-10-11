import type { CaseStatus } from '@/lib/generated/prisma/enums'

/**
 * มติชั่วคราว M7 (mytester J-07 · 11/10/2569 — รอ PO ยืนยัน): ขอบเขต "เคสที่รับเข้าระบบ" ของรายงานเคส
 * (O1 / E1 / E2 / E3 — `96` §6-O1) **ไม่นับ** `draft` (ยังไม่ส่ง) และ `rejected` (ไม่รับเคส)
 * ⇒ "เคสทั้งหมด" และ "ยังไม่ปิด" ตรงกับแดชบอร์ด "เคสตามสถานะ" และนิยาม open ของ O4
 */
export const REPORT_CASE_EXCLUDED_STATUSES: readonly CaseStatus[] = ['draft', 'rejected']

/** pure — เคสสถานะนี้อยู่ในขอบเขตรายงานเคสไหม */
export function isReportableCaseStatus(status: CaseStatus): boolean {
  return !REPORT_CASE_EXCLUDED_STATUSES.includes(status)
}

/** ตัวกรอง Prisma ของขอบเขตเดียวกัน */
export function reportableCaseStatusWhere(): { status: { notIn: CaseStatus[] } } {
  return { status: { notIn: [...REPORT_CASE_EXCLUDED_STATUSES] } }
}
