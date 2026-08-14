/**
 * Flow เชิญผู้ใช้ + ตั้งรหัสผ่านครั้งแรก — **pure ล้วน** (ตัวที่คุย Supabase อยู่ `provisioning.ts`)
 *
 * มติ PO 14/08/2569 ปิด open item **D1**: ใช้ `supabase.auth.admin.inviteUserByEmail()` ส่งลิงก์ให้
 * ผู้ใช้ตั้งรหัสผ่านเอง — ระบบเราไม่เก็บ/ไม่ตั้งรหัสผ่านให้ใครทั้งสิ้น (`08` §6 · `05` §6.1)
 *
 * ค่าที่ยึดเป็น default (ไม่ได้ระบุแยกในมติ — ปรับได้โดยไม่กระทบสัญญา API):
 * - **อายุลิงก์** = ค่าของ Supabase project (ตั้งที่ Dashboard → Auth → Email link expiry) ไม่ override รายครั้ง
 * - **ใครส่งซ้ำได้** = ผู้ที่มีสิทธิ์ `manage:manage_users` (ชุดเดียวกับคนที่สร้างผู้ใช้ได้) ผ่าน
 *   `POST /api/users/:id/invite` ซึ่งบังคับ `reason` เพราะกระทบ `supabase_uid` (`90` §13)
 */

/** ปลายทางหลังผู้ใช้กดลิงก์ในอีเมล — ต้องอยู่ใน Redirect URLs ของ Supabase project ด้วย */
export const SET_PASSWORD_PATH = '/auth/set-password'

export function buildInviteRedirectUrl(origin: string): string {
  return new URL(SET_PASSWORD_PATH, origin).toString()
}

/** ผลของการ provision 1 ครั้ง — `uid = null` แปลว่ายังผูก Supabase Auth ไม่สำเร็จ */
export interface InviteOutcome {
  uid: string | null
  /** ส่งอีเมลคำเชิญออกไปจริงหรือไม่ (false เมื่อไปเจอบัญชี Auth เดิมแล้วผูกให้เฉย ๆ) */
  emailSent: boolean
  /** ผูกกับบัญชี Supabase Auth ที่มีอยู่ก่อนแล้ว (อีเมลเดิมเคยถูกใช้) */
  linkedExisting: boolean
  /** เหตุผลที่ผูกไม่สำเร็จ — ใช้ประกอบ warning ที่ส่งกลับ FE (ไม่ใช่ error ที่ block การสร้าง) */
  failureMessage: string | null
}

export function inviteSucceeded(outcome: InviteOutcome): boolean {
  return outcome.uid !== null
}

/**
 * Supabase ตอบว่าอีเมลนี้มีบัญชีอยู่แล้ว — ข้อความ/โค้ดต่างกันตามเวอร์ชัน gotrue จึงเช็คหลายแบบ
 * (เจอเคสนี้ = ไม่ใช่ความผิดพลาด ให้ไปผูก uid เดิมแทน)
 */
export function isEmailAlreadyRegistered(error: { code?: string; message?: string } | null): boolean {
  if (error === null) return false
  const code = (error.code ?? '').toLowerCase()
  if (code === 'email_exists' || code === 'user_already_exists') return true

  const message = (error.message ?? '').toLowerCase()
  return message.includes('already been registered') || message.includes('already registered')
}

/** ข้อความเตือนที่ส่งกลับ FE เมื่อสร้าง/แก้ผู้ใช้สำเร็จแต่ผูก Auth ไม่สำเร็จ */
export function inviteWarning(outcome: InviteOutcome): { code: string; title: string; message: string } | null {
  if (outcome.uid === null) {
    return {
      code: 'USER_NOT_PROVISIONED',
      title: 'สร้างบัญชีแล้ว แต่ส่งคำเชิญไม่สำเร็จ',
      message: `ผู้ใช้จะยังเข้าสู่ระบบไม่ได้จนกว่าจะส่งคำเชิญสำเร็จ — กดปุ่ม “ส่งคำเชิญอีกครั้ง” ในตารางผู้ใช้งาน${
        outcome.failureMessage === null ? '' : ` (${outcome.failureMessage})`
      }`,
    }
  }

  if (outcome.linkedExisting) {
    return {
      code: 'USER_LINKED_EXISTING_AUTH',
      title: 'ผูกกับบัญชี Supabase Auth เดิม',
      message: 'อีเมลนี้มีบัญชี Auth อยู่ก่อนแล้ว ระบบจึงผูกให้โดยไม่ส่งอีเมลคำเชิญใหม่ — ผู้ใช้เข้าสู่ระบบด้วยรหัสผ่านเดิมได้ทันที',
    }
  }

  return null
}
