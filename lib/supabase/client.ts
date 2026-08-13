import { createBrowserClient } from '@supabase/ssr'
import { getPublicEnv } from '@/lib/env'

/**
 * Supabase client ฝั่ง browser — ใช้เพื่อ Auth (JWT) และ signed URL ของ Storage เท่านั้น (DEC-001/003)
 * ⚠️ ห้ามใช้ query ข้อมูลธุรกิจตรงจากฝั่ง client — ทุก data access ผ่าน API route + Prisma
 *    เพราะ permission enforce ที่ backend middleware ไม่ใช่ RLS (DEC-002)
 */
export function createSupabaseBrowserClient() {
  const env = getPublicEnv()
  return createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}
