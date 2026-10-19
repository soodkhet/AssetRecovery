import { Prisma } from '@/lib/generated/prisma/client'
import { SettingsError } from '@/lib/settings/errors'
import type { SettingsTxClient } from '@/lib/settings/queries/shared'

/**
 * ล็อกช่วงอัตรา VAT ระดับองค์กร (advisory lock ระดับทรานแซกชัน) — **จุดเดียว** ที่สร้างคีย์ล็อกนี้
 *
 * - ฝั่งแก้ช่วง (`createVatRate`/`updateVatRate`) ⇒ `exclusive` — ตรวจทับ/ช่องว่าง/เอกสารอ้าง แล้วบันทึกใต้ล็อก
 * - ฝั่งที่ resolve อัตราไป snapshot ลงเอกสารเงิน (สร้างรายได้ · ใบเสร็จรับเงิน/ใบกำกับภาษี ณ วันรับเงิน)
 *   ⇒ `shared` ก่อนอ่าน `vat_rate_history` (mytester7 FX1 — TOCTOU): อ่านพร้อมกันเองได้ แต่ไม่ซ้อนกับการแก้ ⇒
 *   ไม่ snapshot อัตราของช่วงที่กำลังถูกปิด และฝั่งแก้ก็เห็นรายได้/ใบกำกับภาษีที่เพิ่งออกเสมอตอนตรวจ
 *   "ช่วงที่มีเอกสารอ้าง" (`revenues.revenue_date` + ใบกำกับภาษีขายที่ยังไม่ยกเลิก ตามวันที่ที่ใช้ resolve อัตรา)
 * - รอล็อกได้สูงสุด {@link VAT_RATE_LOCK_TIMEOUT} (mytester7 FX review sec) — เกิน ⇒ `VAT_RATE_LOCK_TIMEOUT`
 *   (409 ให้ลองใหม่) แทนการรอไม่จำกัด · คืนค่า `lock_timeout` เดิมหลังได้ล็อก (ไม่กระทบล็อกอื่นในทรานแซกชัน)
 *
 * ต้องเรียก **ภายใน** `$transaction` (READ COMMITTED — คำสั่งอ่านหลังได้ล็อกเห็นผลที่ฝั่งแก้ commit แล้ว)
 * ล็อกปล่อยเองเมื่อทรานแซกชันจบ · ฝั่งแก้ไม่ล็อกแถวอื่นนอกจาก `vat_rate_history` ⇒ ไม่เกิดวงล็อกกับ
 * ทรานแซกชันยืนยันล็อต/อนุมัติ/ออกใบ ที่ถือแถวล็อต/เคส/รอบวางบิลอยู่ก่อนแล้วจึงขอล็อกนี้
 */
export type VatRateLockMode = 'exclusive' | 'shared'

type LockClient = Pick<SettingsTxClient, '$executeRaw' | '$queryRaw'>

/** เวลารอล็อกสูงสุด (รูปแบบค่า `lock_timeout` ของ Postgres) */
export const VAT_RATE_LOCK_TIMEOUT = '5s'

/** SQLSTATE `lock_not_available` — รอล็อกเกิน `lock_timeout` */
const LOCK_NOT_AVAILABLE = '55P03'

export function vatRateLockKey(organizationId: string): string {
  return `vat_rate_history:${organizationId}`
}

/** error จาก Postgres ว่ารอล็อกเกินเวลาหรือไม่ (driver adapter รายงานใน `meta.driverAdapterError.cause`) — pure */
export function isLockTimeoutError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false
  const meta = error.meta as Record<string, unknown> | undefined
  if (meta === undefined) return false
  if (meta['code'] === LOCK_NOT_AVAILABLE) return true
  const adapter = meta['driverAdapterError']
  if (typeof adapter !== 'object' || adapter === null) return false
  const cause = (adapter as Record<string, unknown>)['cause']
  if (typeof cause !== 'object' || cause === null) return false
  const fields = cause as Record<string, unknown>
  return fields['originalCode'] === LOCK_NOT_AVAILABLE || fields['code'] === LOCK_NOT_AVAILABLE
}

/** แปลง error รอล็อกเกินเวลาเป็น `VAT_RATE_LOCK_TIMEOUT` · error อื่นคืนตามเดิม — pure */
export function mapVatRateLockError(error: unknown, organizationId: string): unknown {
  if (!isLockTimeoutError(error)) return error
  return new SettingsError('VAT_RATE_LOCK_TIMEOUT', { detail: `vat rate lock timeout org=${organizationId}` })
}

export async function lockVatRateHistory(
  tx: LockClient,
  organizationId: string,
  mode: VatRateLockMode,
): Promise<void> {
  const key = vatRateLockKey(organizationId)
  try {
    const [previous] = await tx.$queryRaw<{ value: string }[]>`SELECT current_setting('lock_timeout') AS value`
    await tx.$executeRaw`SELECT set_config('lock_timeout', ${VAT_RATE_LOCK_TIMEOUT}, true)`
    if (mode === 'shared') {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtext(${key}))`
    } else {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`
    }
    await tx.$executeRaw`SELECT set_config('lock_timeout', ${previous?.value ?? '0'}, true)`
  } catch (error) {
    throw mapVatRateLockError(error, organizationId)
  }
}
