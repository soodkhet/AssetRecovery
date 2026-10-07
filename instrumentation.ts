import { deploymentEnvWarnings } from '@/lib/env'
import { installThaiZodErrors } from '@/lib/validation/zod-thai'

/**
 * เรียกครั้งเดียวตอนเริ่ม server (Next instrumentation) — ตั้งค่าที่ต้องมีก่อนรับ request แรก
 * - ข้อความ validation ภาษาไทยกลางของ Zod (preship PS-015 · ฝั่ง browser อยู่ที่ `instrumentation-client.ts`)
 * - เตือนใน log ของ deployment เมื่อยังไม่ตั้ง env ที่จำเป็นต่อ go-live (R2-004 — ชื่อเท่านั้น ห้ามพิมพ์ค่า)
 */
export function register(): void {
  installThaiZodErrors()
  const missing = deploymentEnvWarnings()
  if (missing.length > 0) console.warn(`[env] deployment ยังไม่ได้ตั้งค่า: ${missing.join(', ')}`)
}
