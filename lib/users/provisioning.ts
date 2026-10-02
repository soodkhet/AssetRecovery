import { createSupabaseAdminClient, createSupabaseStatelessClient } from '@/lib/supabase/server'
import { isEmailAlreadyRegistered } from '@/lib/users/auth-account'
import { UserError } from '@/lib/users/errors'

/**
 * ตัวคุยกับ Supabase Auth (service_role) ของโมดูลผู้ใช้งาน — **server เท่านั้น**
 * ⚠️ ห้าม import เข้าไฟล์ `'use client'` (ลาก service role key เข้า bundle)
 *
 * มติ PO 03/10/2569 (แทนมติ D1 เดิมที่เชิญทางอีเมล): ผู้ดูแลตั้งรหัสผ่านให้ตอนสร้าง/รีเซ็ตผ่าน
 * `admin.createUser` / `admin.updateUserById` — ไม่ส่งอีเมลใดๆ · ระบบเราเก็บแค่ `users.supabase_uid`
 * ไม่เก็บรหัสผ่านเอง (`08` §6) · ผู้ใช้ที่ไม่มีอีเมลจริงใช้อีเมลภายใน (`lib/auth/login-identifier.ts`)
 *
 * ทุกฟังก์ชันล้มเหลว = `AUTH_ACCOUNT_SYNC_FAILED` (502 ปลายทางภายนอก) ให้ผู้เรียกจัดการต่อ
 */

const AUTH_USER_PAGE_SIZE = 1000

function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message
  }
  return String(error)
}

function errorShape(error: unknown): { code?: string; message?: string } {
  if (typeof error !== 'object' || error === null) return { message: String(error) }
  const shaped = error as { code?: unknown; message?: unknown }
  return {
    code: typeof shaped.code === 'string' ? shaped.code : undefined,
    message: typeof shaped.message === 'string' ? shaped.message : undefined,
  }
}

function syncFailed(step: string, error: unknown): UserError {
  return new UserError('AUTH_ACCOUNT_SYNC_FAILED', { detail: `${step}: ${errorMessage(error)}` })
}

/** หา auth user จากอีเมล (gotrue ยังไม่มี getUserByEmail ใน admin API — ต้องไล่ list เอง) */
export async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: AUTH_USER_PAGE_SIZE })
  if (error) return null

  const target = email.toLowerCase()
  return data.users.find((user) => user.email?.toLowerCase() === target)?.id ?? null
}

/**
 * สร้างบัญชี Supabase Auth พร้อมรหัสผ่าน (ยืนยันอีเมลให้เลย ไม่ส่งเมล) — คืน uid
 * อีเมลนี้มีบัญชี Auth อยู่แล้ว → `isUidTaken` บอกว่ามีผู้ใช้ในระบบ (รวมที่ลบแล้ว) ถือ uid นั้นอยู่ไหม:
 * - มีคนถือ = อีเมลซ้ำ (`DUPLICATE_USER_EMAIL`)
 * - ไม่มีใครถือ = บัญชีกำพร้า → **ลบทิ้งแล้วสร้างใหม่** ห้ามผูกของเดิม: ใครก็ signUp ด้วยอีเมลคนอื่นไว้ก่อนได้
 *   ผูกของเดิม = session/refresh token ที่ผู้สร้างถืออยู่จะกลายเป็นบัญชีของผู้ใช้จริงทันที (ยึดบัญชีล่วงหน้า)
 */
export async function createAuthAccount(
  email: string,
  password: string,
  isUidTaken: (uid: string) => Promise<boolean>,
): Promise<string> {
  const admin = createSupabaseAdminClient()
  const first = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (!first.error && first.data.user) return first.data.user.id

  if (!isEmailAlreadyRegistered(errorShape(first.error))) throw syncFailed('createUser', first.error)

  const existing = await findAuthUserIdByEmail(email)
  if (existing === null) throw syncFailed('createUser', first.error)
  if (await isUidTaken(existing)) throw new UserError('DUPLICATE_USER_EMAIL', { detail: `auth email=${email}` })

  const removed = await admin.auth.admin.deleteUser(existing)
  if (removed.error) throw syncFailed('deleteUser(orphan)', removed.error)

  const retry = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (retry.error || !retry.data.user) throw syncFailed('createUser(after orphan)', retry.error)
  return retry.data.user.id
}

/** ตรวจว่ารหัสผ่านถูกต้องโดยไม่แตะ session ของผู้ใช้ (client ไม่ผูก cookie) */
export async function verifyPassword(email: string, password: string): Promise<boolean> {
  const client = createSupabaseStatelessClient()
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  return !error && data.user !== null
}

/** ตั้งรหัสผ่านใหม่ให้บัญชี Auth (ผู้ดูแลรีเซ็ต / ผู้ใช้เปลี่ยนเอง) */
export async function setAuthPassword(uid: string, password: string): Promise<void> {
  const admin = createSupabaseAdminClient()
  const { error } = await admin.auth.admin.updateUserById(uid, { password })
  if (error) throw syncFailed('updateUserById(password)', error)
}

/** อีเมลจริงของบัญชี Auth — login ใช้ตัวนี้เสมอ ไม่เดาจาก DB (กันกรณีย้ายอีเมลค้างครึ่งทาง) */
export async function getAuthEmail(uid: string): Promise<string | null> {
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin.auth.admin.getUserById(uid)
  if (error || !data.user) return null
  return data.user.email ?? null
}

/** ลบบัญชี Auth ที่เพิ่งสร้าง — ใช้ชดเชยเมื่อเขียน DB ไม่สำเร็จ (best effort ไม่ throw) */
export async function deleteAuthAccount(uid: string): Promise<void> {
  const admin = createSupabaseAdminClient()
  await admin.auth.admin.deleteUser(uid)
}

/**
 * ย้ายอีเมลของบัญชี Auth ตามข้อมูลในระบบ (เพิ่ม/เปลี่ยน/ลบอีเมลจริง → อีเมลภายใน)
 * คืนข้อความผิดพลาดเมื่อไม่สำเร็จ — ผู้เรียกเอาไปทำ warning ไม่ต้อง rollback ข้อมูลธุรกิจ
 * (login อ่านอีเมลจาก Auth ตรงผ่าน `getAuthEmail()` จึงยัง login ได้แม้ย้ายไม่สำเร็จ)
 */
export async function syncAuthEmail(uid: string, email: string): Promise<string | null> {
  const admin = createSupabaseAdminClient()
  const { error } = await admin.auth.admin.updateUserById(uid, { email, email_confirm: true })
  return error ? errorMessage(error) : null
}
