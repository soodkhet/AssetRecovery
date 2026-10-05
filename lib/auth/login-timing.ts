/**
 * เวลาตอบของ login ที่ล้มเหลวต้องใกล้เคียงกันไม่ว่าบัญชีมีจริงหรือไม่ (UAT BUG-140 · มติ PO U64 · `05` §10)
 *
 * ปัญหา: บัญชีที่มีจริงต้องอ่านอีเมลจาก Auth + ตรวจรหัสผ่าน (~200 ms) ส่วนบัญชีที่ไม่มีตอบเร็วกว่า
 * ~3 เท่า → ไล่เดา username จากเวลาได้ · แก้ 2 ชั้น:
 * 1. ทางที่ไม่พบบัญชีทำงานเทียบเท่า (เรียก Auth จำนวนครั้งเท่ากัน — อยู่ใน `auth-service.ts`)
 * 2. ทุกครั้งที่ตอบ `INVALID_CREDENTIALS` รอจนครบเวลาขั้นต่ำคงที่ (`LOGIN_FAILURE_MIN_DURATION_MS`)
 *    นับจากตอนเริ่มรับคำขอ — ความต่างที่เหลือถูกกลบด้วยค่าคงที่นี้
 *
 * ไม่แตะการตั้งค่า Supabase Auth · audit failed login ยังลงครบทุกครั้ง (รอหลัง audit)
 * · rate limit ของ Supabase Auth ยังทำงานเหมือนเดิม (จำนวนครั้งที่เรียก sign in ต่อคำขอเท่าเดิม)
 */

/** ขั้นต่ำของเวลาตอบเมื่อ login ไม่ผ่านเพราะตัวตน/รหัสผ่าน — สูงกว่าเวลาจริงของทางที่ช้าที่สุดในสภาวะปกติ */
export const LOGIN_FAILURE_MIN_DURATION_MS = 800

export interface LoginTimingClock {
  now: () => number
  sleep: (ms: number) => Promise<void>
}

export const realLoginTimingClock: LoginTimingClock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}

/** เวลาที่ยังต้องรอ (ms) ให้ครบขั้นต่ำ — ไม่ติดลบ (ทำงานนานกว่าขั้นต่ำแล้ว = ไม่รอเพิ่ม) */
export function remainingLoginDelayMs(startedAt: number, now: number, minDurationMs = LOGIN_FAILURE_MIN_DURATION_MS): number {
  return Math.max(0, startedAt + minDurationMs - now)
}

/** รอจนครบขั้นต่ำนับจาก `startedAt` */
export async function padLoginFailure(
  startedAt: number,
  clock: LoginTimingClock = realLoginTimingClock,
  minDurationMs = LOGIN_FAILURE_MIN_DURATION_MS,
): Promise<void> {
  const remaining = remainingLoginDelayMs(startedAt, clock.now(), minDurationMs)
  if (remaining > 0) await clock.sleep(remaining)
}
