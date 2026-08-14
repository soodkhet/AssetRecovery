import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { getPublicEnv, getServerEnv } from '@/lib/env'

/**
 * Supabase client ฝั่ง server (อ่าน session จาก cookie) — ใช้ verify JWT / อ่านผู้ใช้ปัจจุบัน
 * ข้อมูลธุรกิจทั้งหมดอ่าน/เขียนผ่าน Prisma เท่านั้น (DEC-001/002)
 */
export async function createSupabaseServerClient() {
  // อ่าน cookie ก่อนเสมอ — เป็น runtime API ที่บอก Next ว่าหน้านี้ dynamic (กัน prerender หน้าที่ต้องมี session)
  const cookieStore = await cookies()
  const env = getPublicEnv()

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // เรียกจาก Server Component — refresh session ทำที่ middleware แทน (ปกติ ไม่ใช่ error)
        }
      },
    },
  })
}

/**
 * Supabase client สิทธิ์ service_role — bypass ทุก policy
 * ⚠️ ใช้เฉพาะงาน server-side ที่จำเป็นจริง (Storage admin / job) · ห้าม import เข้าโค้ดฝั่ง client เด็ดขาด
 */
export function createSupabaseAdminClient() {
  const env = getServerEnv()
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    cookies: {
      getAll() {
        return []
      },
      setAll() {
        // service client ไม่ผูกกับ session ของผู้ใช้
      },
    },
  })
}
