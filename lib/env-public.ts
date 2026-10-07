import { z } from 'zod'

/**
 * env ฝั่ง client (เฉพาะ `NEXT_PUBLIC_*`) — **แยกไฟล์จาก `lib/env.ts` โดยเจตนา**
 * เดิมอยู่ไฟล์เดียวกัน ⇒ `lib/supabase/client.ts` ลาก schema ฝั่ง server (ชื่อ `DATABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`)
 * เข้า bundle ของ browser (preship PS-024 — รั่วแค่ชื่อ ไม่ใช่ค่า) · ห้าม import อะไรฝั่ง server เข้าไฟล์นี้
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url('NEXT_PUBLIC_SUPABASE_URL ต้องเป็น URL'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'NEXT_PUBLIC_SUPABASE_ANON_KEY ต้องมีค่า'),
})

export type PublicEnv = z.infer<typeof publicEnvSchema>

/** ใช้ได้ทั้ง client และ server — มีเฉพาะตัวแปร NEXT_PUBLIC_* */
export function getPublicEnv(): PublicEnv {
  const parsed = publicEnvSchema.safeParse({
    // ต้องอ้างชื่อเต็มตรง ๆ — Next แทนค่าเฉพาะรูป `process.env.NEXT_PUBLIC_*` ตอน build
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  })
  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(' · ')
    throw new Error(`[env] public env ไม่ครบ/ไม่ถูกต้อง — ${missing}`)
  }
  return parsed.data
}
