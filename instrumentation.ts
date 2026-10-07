import { installThaiZodErrors } from '@/lib/validation/zod-thai'

/**
 * เรียกครั้งเดียวตอนเริ่ม server (Next instrumentation) — ตั้งค่าที่ต้องมีก่อนรับ request แรก
 * - ข้อความ validation ภาษาไทยกลางของ Zod (preship PS-015 · ฝั่ง browser อยู่ที่ `instrumentation-client.ts`)
 */
export function register(): void {
  installThaiZodErrors()
}
