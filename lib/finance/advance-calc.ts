import { assertNonNegativeSatang } from '@/lib/finance/satang'

/**
 * เงินทดรองจ่าย — ยอดคืน (`22` §6.13 · `15` §6.2) — **pure ล้วน ไม่มี I/O**
 *
 * - **ยอดคืน**: `02` §5 กำหนดคอลัมน์ `advances.return_satang` เป็น **generated column** ของ DB จริง
 *   `GREATEST(0, COALESCE(approved_satang, 0) - used_satang)` ⇒ ฐานคือ **ยอดที่อนุมัติ** (เงินที่จ่ายออกไปจริง)
 *   ไม่ใช่ยอดที่ขอ — `advanceReturnSatang()` มิเรอร์สูตรนี้เป๊ะ (`22` §6.13 แก้ให้ตรงแล้วตามมติ PO 03/10/2569 UAT Q3)
 * - **ใช้เกินยอด (มติ PO 03/10/2569 — UAT Q3, BUG-011)**: เคลียร์ยอดได้เสมอ **ไม่บล็อก** — ยอดคืน = 0
 *   และส่วนที่ใช้เกินยอดอนุมัติ (`excessSatang`) กลายเป็น **คำขอเบิกส่วนเกินอัตโนมัติ** (Manual Claim
 *   ของ payee เดียวกัน — `lib/advances/queries.ts` `settleAdvance()`) · `USED_EXCEEDS_REQUEST_NO_TOPUP`
 *   ถูกยกเลิกจาก `24` §6.4 แล้ว
 *
 * ⚠️ ห้ามเขียนค่า `return_satang` ลง DB เอง (Prisma มองเป็นคอลัมน์ธรรมดาแล้วไปตายที่ DB — ดู REUSE_INDEX)
 * ฟังก์ชันนี้ใช้สำหรับ **แสดงผล/ตรวจสอบ/สรุปยอด** ก่อนบันทึกเท่านั้น
 */

export interface AdvanceSettlementInput {
  /** ยอดที่ขอเบิก (`advances.requested_satang`) */
  requestedSatang: number
  /** ยอดที่อนุมัติจริง (`advances.approved_satang`) — `null` = ยังไม่อนุมัติ ⇒ ยังไม่มีเงินออก */
  approvedSatang: number | null
  /** ยอดใช้จริงตอนเคลียร์ยอด (`advances.used_satang`) */
  usedSatang: number
}

export interface AdvanceSettlement {
  /** ยอดที่ต้องคืนบริษัท — **ไม่ติดลบเด็ดขาด** (`22` §6.13) */
  returnSatang: number
  /** ส่วนที่ใช้เกินยอดอนุมัติ = ยอดของคำขอเบิกส่วนเกินที่ระบบสร้างให้อัตโนมัติ (ไม่เพิ่มยอดทดรองย้อนหลัง) */
  excessSatang: number
  /** true = ใช้เกินยอดอนุมัติ ⇒ ระบบสร้างคำขอเบิกส่วนเกินอัตโนมัติตอนเคลียร์ยอด (UAT Q3) */
  needsExtraClaim: boolean
}

/** `02` §5 (generated column) — `GREATEST(0, COALESCE(approved, 0) - used)` */
export function advanceReturnSatang(input: Pick<AdvanceSettlementInput, 'approvedSatang' | 'usedSatang'>): number {
  const approved = input.approvedSatang ?? 0
  assertNonNegativeSatang(approved, 'ยอดที่อนุมัติ')
  assertNonNegativeSatang(input.usedSatang, 'ยอดใช้จริง')
  return Math.max(0, approved - input.usedSatang)
}

/** ยอดคืน + ส่วนเกิน สำหรับหน้าจอเคลียร์ยอด (`15` §8) */
export function advanceSettlement(input: AdvanceSettlementInput): AdvanceSettlement {
  const approved = input.approvedSatang ?? 0
  const returnSatang = advanceReturnSatang(input)
  const excessSatang = Math.max(0, input.usedSatang - approved)
  return { returnSatang, excessSatang, needsExtraClaim: excessSatang > 0 }
}
