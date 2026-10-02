import type { LoginInput } from '@/lib/auth/schemas'

/**
 * ทางลัด login `admin` / `admin` สำหรับเครื่อง dev เท่านั้น — **pure ล้วน**
 *
 * Supabase Auth ของ localhost เป็น project บน cloud (ไม่มี Supabase ในเครื่อง) และ Supabase บังคับรหัส ≥ 6 ตัว
 * จึงตั้งรหัส `admin` จริงไม่ได้ และไม่ควรมีบัญชีรหัสอ่อนบน cloud — บัญชีจริงใช้รหัสสุ่มยาวที่
 * `pnpm auth:dev-admin` เขียนลง `.env.local` (`DEV_ADMIN_AUTH_PASSWORD`) แล้วตรงนี้แค่ "แปล" รหัส
 * `admin` → รหัสจริงก่อนส่งให้ Supabase · ทุกด่านหลังจากนั้น (สถานะบัญชี/audit/landing) เดินตามปกติ
 *
 * ⚠️ ทำงานเมื่อครบทั้ง 3 เงื่อนไขเท่านั้น: `NODE_ENV=development` (`next dev` — production build เป็น
 *    `production` เสมอ) · มี `DEV_ADMIN_AUTH_PASSWORD` (ห้ามตั้งบน Vercel) · request มาที่ localhost
 */

export const DEV_ALIAS_USERNAME = 'admin'
const DEV_ALIAS_PASSWORD = 'admin'
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

export interface DevLoginAliasContext {
  nodeEnv: string | undefined
  aliasPassword: string | undefined
  hostname: string
}

export function isDevLoginAliasEnabled(context: DevLoginAliasContext): boolean {
  return (
    context.nodeEnv === 'development' &&
    context.aliasPassword !== undefined &&
    context.aliasPassword.length > 0 &&
    LOCAL_HOSTNAMES.has(context.hostname)
  )
}

export function applyDevLoginAlias(input: LoginInput, context: DevLoginAliasContext): LoginInput {
  if (!isDevLoginAliasEnabled(context)) return input
  if (input.identifier !== DEV_ALIAS_USERNAME || input.password !== DEV_ALIAS_PASSWORD) return input
  return { ...input, password: context.aliasPassword ?? input.password }
}
