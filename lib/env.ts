import { z } from 'zod'

/**
 * ตรวจ env ฝั่ง **server** ตอน boot — ขาดตัวไหน fail เร็วพร้อมชื่อตัวแปร (ดู `.env.example`)
 * ⚠️ ห้าม import ไฟล์นี้จาก client — ใช้ `lib/env-public.ts`
 * ห้าม log ค่า secret ออกมาไม่ว่ากรณีใด
 */
const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL ต้องมีค่า'),
  DIRECT_URL: z.string().min(1, 'DIRECT_URL ต้องมีค่า'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY ต้องมีค่า'),
  NEXT_PUBLIC_SUPABASE_URL: z.url('NEXT_PUBLIC_SUPABASE_URL ต้องเป็น URL'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'NEXT_PUBLIC_SUPABASE_ANON_KEY ต้องมีค่า'),
})

export type ServerEnv = z.infer<typeof serverEnvSchema>

function parseOrThrow<T>(schema: z.ZodType<T>, source: Record<string, string | undefined>, label: string): T {
  const parsed = schema.safeParse(source)
  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(' · ')
    throw new Error(`[env] ${label} ไม่ครบ/ไม่ถูกต้อง — ${missing}`)
  }
  return parsed.data
}

/** ใช้ได้เฉพาะฝั่ง server (API route / server component / job) เท่านั้น */
export function getServerEnv(): ServerEnv {
  return parseOrThrow(serverEnvSchema, process.env, 'server env')
}

/**
 * env ที่ deployment บน Vercel (staging/production) ต้องตั้ง แต่ระบบยังทำงานต่อได้ถ้าขาด (R2-004)
 * ขาดแล้วฟีเจอร์นั้นเงียบหาย ⇒ เตือนตอน boot ({@link deploymentEnvWarnings}) · ชื่อทั้งหมดต้องมีใน `.env.example`
 * - `CRON_SECRET` — ขาดบน Vercel ⇒ `/api/cron/jobs` ปฏิเสธทุกคำขอ (fail closed — `app/api/cron/jobs/route.ts`)
 * - `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` / `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — ขาด ⇒ ไม่มี Web Push
 * - `GOOGLE_MAPS_API_KEY` (หรือชื่อสำรอง `GOOGLE_MAPS_SERVER_KEY`) — ขาด ⇒ คำนวณระยะทางภาคสนามไม่ได้
 */
export const DEPLOYMENT_ENV_NAMES = [
  'CRON_SECRET',
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'VAPID_SUBJECT',
  'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
  'GOOGLE_MAPS_API_KEY',
] as const

/** อยู่บน deployment ของ Vercel (preview/staging/production) — เครื่อง dev ไม่มี `VERCEL_ENV` */
export function isVercelDeployment(source: Record<string, string | undefined> = process.env): boolean {
  return (source.VERCEL_ENV ?? '').trim() !== ''
}

/**
 * เครื่องมือทดสอบ (dev trigger · ทางลัดปิดงวด · วันจำลอง) เปิดอยู่หรือไม่ — staging E-013 (มติ PO 10/10/2569 · `91` §14.1)
 *
 * - เครื่อง dev (`next dev` / test — ไม่ใช่ production build และไม่อยู่บน Vercel) ⇒ เปิด
 * - Vercel **Preview** (staging) ⇒ เปิดเฉพาะเมื่อตั้ง `ENABLE_DEV_TOOLS=1` เอง (opt-in · Vercel ตั้ง `NODE_ENV=production`
 *   ทุก environment จึงใช้ `NODE_ENV` แยกไม่ได้ — เดิมทำให้ staging ทดสอบงานเบื้องหลังไม่ได้เลย)
 * - Vercel **Production** ⇒ ปิดเสมอ ไม่ว่าตั้ง env อะไร · production build นอก Vercel ⇒ ปิด (fail closed)
 */
export function isDevToolsEnabled(source: Record<string, string | undefined> = process.env): boolean {
  const vercelEnv = (source.VERCEL_ENV ?? '').trim()
  if (vercelEnv === 'production') return false
  if (vercelEnv === 'preview') return (source.ENABLE_DEV_TOOLS ?? '').trim() === '1'
  if (vercelEnv !== '') return false
  return source.NODE_ENV !== 'production'
}

/** ชื่อ env ที่ deployment ยังไม่ได้ตั้ง (บอกแค่ชื่อ ห้ามมีค่า) — เครื่อง dev คืนว่างเสมอ */
export function deploymentEnvWarnings(source: Record<string, string | undefined> = process.env): string[] {
  if (!isVercelDeployment(source)) return []
  const isSet = (name: string) => (source[name] ?? '').trim() !== ''
  return DEPLOYMENT_ENV_NAMES.filter((name) => {
    if (isSet(name)) return false
    // ชื่อสำรองที่โค้ดรับแทนได้ (`lib/field/distance-provider.ts` resolveGoogleMapsKey)
    return !(ENV_ALIASES[name] ?? []).some(isSet)
  })
}

/** ชื่อสำรองของ env ที่โค้ดอ่านแทนได้ — ตั้งตัวใดตัวหนึ่งก็พอ */
const ENV_ALIASES: Readonly<Partial<Record<(typeof DEPLOYMENT_ENV_NAMES)[number], readonly string[]>>> = {
  GOOGLE_MAPS_API_KEY: ['GOOGLE_MAPS_SERVER_KEY'],
}

// ฝั่ง client อยู่ที่ `lib/env-public.ts` (แยกไฟล์เพื่อไม่ให้ schema ฝั่ง server ไปถึง browser) — re-export ให้ผู้เรียกเดิม
export { getPublicEnv, type PublicEnv } from '@/lib/env-public'
