import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { UserError } from '@/lib/users/errors'
import { isEmailAlreadyRegistered, type InviteOutcome } from '@/lib/users/invite'

/**
 * ตัวคุยกับ Supabase Auth (service_role) ของโมดูลผู้ใช้งาน — **server เท่านั้น**
 * ⚠️ ห้าม import เข้าไฟล์ `'use client'` (ลาก service role key เข้า bundle)
 *
 * มติ PO ปิด D1: เชิญด้วย `inviteUserByEmail` → ผู้ใช้ตั้งรหัสผ่านเองที่หน้า `/auth/set-password`
 * ระบบเราเก็บแค่ `users.supabase_uid` ไม่เก็บรหัสผ่านเอง (`08` §6)
 *
 * หลักการรับมือความล้มเหลว: **การสร้างผู้ใช้ต้องไม่ล้มเพราะอีเมลส่งไม่ออก** — ถ้าเชิญไม่สำเร็จ
 * ให้บันทึกผู้ใช้ไว้ก่อนโดย `supabase_uid = null` (UI ขึ้นป้าย "รอตั้งรหัสผ่าน") แล้วส่งคำเชิญซ้ำ
 * ผ่าน `POST /api/users/:id/invite` ได้ตลอด
 */

const AUTH_USER_PAGE_SIZE = 1000

function toErrorShape(error: unknown): { code?: string; message?: string } | null {
  if (error === null || error === undefined) return null
  if (typeof error === 'object') {
    const shaped = error as { code?: unknown; message?: unknown }
    return {
      code: typeof shaped.code === 'string' ? shaped.code : undefined,
      message: typeof shaped.message === 'string' ? shaped.message : undefined,
    }
  }
  return { message: String(error) }
}

/** หา auth user จากอีเมล (gotrue ยังไม่มี getUserByEmail ใน admin API — ต้องไล่ list เอง) */
export async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: AUTH_USER_PAGE_SIZE })
  if (error) return null

  const target = email.toLowerCase()
  const found = data.users.find((user) => user.email?.toLowerCase() === target)
  return found?.id ?? null
}

/**
 * เชิญผู้ใช้ใหม่ทางอีเมล — คืน `InviteOutcome` เสมอ ไม่ throw ให้ผู้เรียกล้มทั้งงาน
 * (อีเมลซ้ำกับบัญชี Auth เดิม = ผูก uid เดิมให้ ไม่ถือว่าผิดพลาด)
 */
export async function inviteUser(email: string, redirectUrl: string): Promise<InviteOutcome> {
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: redirectUrl })

  if (!error && data.user) {
    return { uid: data.user.id, emailSent: true, linkedExisting: false, failureMessage: null }
  }

  const shaped = toErrorShape(error)
  if (isEmailAlreadyRegistered(shaped)) {
    const existing = await findAuthUserIdByEmail(email)
    if (existing !== null) {
      return { uid: existing, emailSent: false, linkedExisting: true, failureMessage: null }
    }
  }

  return {
    uid: null,
    emailSent: false,
    linkedExisting: false,
    failureMessage: shaped?.message ?? 'ไม่ทราบสาเหตุ',
  }
}

/**
 * ส่งคำเชิญซ้ำ (`POST /api/users/:id/invite`) — ต่างจาก `inviteUser()` ตรงที่ **ล้มแล้วต้องรู้**
 * เพราะผู้ใช้กดปุ่มนี้เพื่อสิ่งนี้โดยเฉพาะ → โยน `INVITE_SEND_FAILED`
 */
export async function resendInvite(email: string, redirectUrl: string): Promise<InviteOutcome> {
  const outcome = await inviteUser(email, redirectUrl)
  if (outcome.uid === null) {
    throw new UserError('INVITE_SEND_FAILED', { detail: outcome.failureMessage ?? undefined })
  }
  return outcome
}

/**
 * ย้ายอีเมลของบัญชี Auth ตามข้อมูลในระบบ (อีเมล = username ตอน login)
 * คืนข้อความผิดพลาดเมื่อไม่สำเร็จ — ผู้เรียกเอาไปทำ warning ไม่ต้อง rollback ข้อมูลธุรกิจ
 */
export async function syncAuthEmail(uid: string, email: string): Promise<string | null> {
  const admin = createSupabaseAdminClient()
  const { error } = await admin.auth.admin.updateUserById(uid, { email, email_confirm: true })
  if (!error) return null
  return toErrorShape(error)?.message ?? 'ไม่ทราบสาเหตุ'
}
