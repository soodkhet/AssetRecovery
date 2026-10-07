import { timingSafeEqual } from 'node:crypto'
import { isVercelDeployment } from '@/lib/env'

/**
 * ยังไม่ตั้ง `CRON_SECRET` ⇒ อนุญาตเฉพาะเครื่อง dev (ไม่ใช่ production build และไม่อยู่บน Vercel)
 * บน Vercel ทุก environment (staging/preview/production) ปฏิเสธเสมอ — fail closed (R2-018)
 * เทียบ token แบบ constant-time กันเดาทีละตัวอักษรจากเวลาตอบ
 */
export function isCronAuthorized(
  authorization: string | null,
  source: Record<string, string | undefined> = process.env,
): boolean {
  const secret = source.CRON_SECRET?.trim()
  if (secret === undefined || secret === '') return source.NODE_ENV !== 'production' && !isVercelDeployment(source)
  const expected = Buffer.from(`Bearer ${secret}`)
  const actual = Buffer.from(authorization ?? '')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
