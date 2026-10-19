import type { SettingsTxClient } from '@/lib/settings/queries/shared'

/**
 * ล็อกช่วงอัตรา VAT ระดับองค์กร (advisory lock ระดับทรานแซกชัน) — **จุดเดียว** ที่สร้างคีย์ล็อกนี้
 *
 * - ฝั่งแก้ช่วง (`createVatRate`/`updateVatRate`) ⇒ `exclusive` — ตรวจทับ/ช่องว่าง/รายได้อ้าง แล้วบันทึกใต้ล็อก
 * - ฝั่งที่ resolve อัตราไป snapshot ลงเอกสารเงิน (สร้างรายได้ · ใบเสร็จรับเงิน/ใบกำกับภาษี ณ วันรับเงิน)
 *   ⇒ `shared` ก่อนอ่าน `vat_rate_history` (mytester7 FX1 — TOCTOU): อ่านพร้อมกันเองได้ แต่ไม่ซ้อนกับการแก้ ⇒
 *   ไม่ snapshot อัตราของช่วงที่กำลังถูกปิด และฝั่งแก้ก็เห็นรายได้ที่เพิ่งสร้างเสมอตอนตรวจ "ช่วงที่มีรายได้อ้าง"
 *
 * ต้องเรียก **ภายใน** `$transaction` (READ COMMITTED — คำสั่งอ่านหลังได้ล็อกเห็นผลที่ฝั่งแก้ commit แล้ว)
 * ล็อกปล่อยเองเมื่อทรานแซกชันจบ · ฝั่งแก้ไม่ล็อกแถวอื่นนอกจาก `vat_rate_history` ⇒ ไม่เกิดวงล็อกกับ
 * ทรานแซกชันยืนยันล็อต/อนุมัติ/ออกใบ ที่ถือแถวล็อต/เคส/รอบวางบิลอยู่ก่อนแล้วจึงขอล็อกนี้
 */
export type VatRateLockMode = 'exclusive' | 'shared'

type LockClient = Pick<SettingsTxClient, '$executeRaw'>

export function vatRateLockKey(organizationId: string): string {
  return `vat_rate_history:${organizationId}`
}

export async function lockVatRateHistory(
  tx: LockClient,
  organizationId: string,
  mode: VatRateLockMode,
): Promise<void> {
  const key = vatRateLockKey(organizationId)
  if (mode === 'shared') {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtext(${key}))`
  } else {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`
  }
}
