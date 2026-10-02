import type { RoleGroup } from '@/lib/generated/prisma/enums'

/**
 * กติกา pure ของบัญชีเข้าสู่ระบบ (DEC-010 · มติ PO 03/10/2569 — แทน flow เชิญทางอีเมลของ D1)
 * ตัวที่คุย Supabase อยู่ `provisioning.ts` · ห้าม import อะไรที่แตะ Prisma/Supabase ที่นี่
 *
 * - ผู้ดูแลที่สร้างผู้ใช้ได้ (`manage:manage_users`) ตั้ง/รีเซ็ตรหัสผ่านให้ได้ภายใน scope ของตัวเอง
 * - **บัญชีกลุ่มแอดมิน (`system`) จัดการได้เฉพาะ Superadmin** — สร้าง/แก้/ย้ายเข้ากลุ่ม/ตั้งรหัส/ระงับ/ลบ
 *   กลุ่มนี้ถือสิทธิ์การเงิน/บริหาร/ปลดล็อกงวด ถ้าผู้ดูแลทั่วไปตั้งรหัสหรือสร้างบัญชีกลุ่มนี้เองได้
 *   = login เป็นคนนั้นแล้วได้สิทธิ์ที่ตัวเองไม่มี (privilege escalation — มติ PO 03/10/2569)
 * - ไม่ใช่ Superadmin **เปลี่ยน role ของตัวเองไม่ได้** (กันยกสิทธิ์ตัวเอง)
 * - ตั้งรหัสให้คนอื่น → บังคับเจ้าของบัญชีเปลี่ยนเองตอน login ครั้งถัดไป · ตั้งให้ตัวเอง → ไม่บังคับ
 */

/** ผู้กระทำจัดการบัญชีที่อยู่ (หรือจะย้ายไปอยู่) ใน role group นี้ได้ไหม */
export function canManageAccountIn(actor: { isSuperadmin: boolean }, roleGroup: RoleGroup): boolean {
  return actor.isSuperadmin || roleGroup !== 'system'
}

export function canSetPasswordFor(actor: { isSuperadmin: boolean }, target: { roleGroup: RoleGroup }): boolean {
  return canManageAccountIn(actor, target.roleGroup)
}

/** เปลี่ยน role ของตัวเองได้เฉพาะ Superadmin (ยามคนสุดท้ายยังบังคับแยกที่ `assertNotLastSuperadmin`) */
export function canChangeOwnRole(actor: { isSuperadmin: boolean }): boolean {
  return actor.isSuperadmin
}

export function mustChangeAfterAdminSet(actorUserId: string, targetUserId: string): boolean {
  return actorUserId !== targetUserId
}

/**
 * Supabase ตอบว่าอีเมลนี้มีบัญชีอยู่แล้ว — ข้อความ/โค้ดต่างกันตามเวอร์ชัน gotrue จึงเช็คหลายแบบ
 * (เจอเคสนี้ = ไปดูว่า uid นั้นกำพร้าหรือมีผู้ใช้ถืออยู่ — `createAuthAccount()`)
 */
export function isEmailAlreadyRegistered(error: { code?: string; message?: string } | null): boolean {
  if (error === null) return false
  const code = (error.code ?? '').toLowerCase()
  if (code === 'email_exists' || code === 'user_already_exists') return true

  const message = (error.message ?? '').toLowerCase()
  return message.includes('already been registered') || message.includes('already registered')
}
