import type { CookieOptionsWithName } from '@supabase/ssr'

/**
 * ตัวเลือกคุกกี้ session ของ Supabase — ใช้ร่วมทุก client (proxy · server · browser)
 * - `secure` บน production build (Vercel = https · `localhost` ถือเป็น secure context จึง `next start` บนเครื่องได้)
 * - **ไม่ตั้ง `httpOnly`**: หน้าตั้งรหัสผ่าน (`components/auth/set-password-form.tsx`) ใช้ browser client อ่าน/เขียนคุกกี้นี้
 *   — ถ้าจะปิดการอ่านจาก JavaScript ต้องย้าย flow นั้นไปทำฝั่ง server ก่อน (staging S-007)
 */
export const SUPABASE_COOKIE_OPTIONS: CookieOptionsWithName = {
  path: '/',
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
}
