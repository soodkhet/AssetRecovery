/**
 * ตัวระบุตอน login (มติ PO 03/10/2569) — **pure ล้วน** ใช้ร่วม FE/BE
 *
 * - ช่องเดียว "อีเมลหรือชื่อผู้ใช้": มี `@` = อีเมล · ไม่มี = username (username ห้ามมี `@` อยู่แล้ว)
 * - บัญชี Supabase Auth ต้องมีอีเมลเสมอ — ผู้ใช้ที่ไม่มีอีเมลจริงใช้ **อีเมลภายใน** ผูกกับ `users.id`
 *   (ไม่ผูกกับ username → เปลี่ยน username ได้โดยไม่ต้องแตะ Supabase) · ผู้ใช้ไม่เคยเห็นอีเมลนี้
 */

/** โดเมนของอีเมลภายใน — `.invalid` สงวนไว้ตาม RFC 2606 ส่งเมลออกไม่ได้แน่นอน */
export const INTERNAL_AUTH_EMAIL_DOMAIN = 'users.assetrecovery.invalid'

/** username: a-z 0-9 . _ - ยาว 3–50 ขึ้นต้นด้วยตัวอักษร/ตัวเลข (เก็บตัวพิมพ์เล็กเสมอ) */
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,49}$/

export type LoginIdentifier = { kind: 'email'; email: string } | { kind: 'username'; username: string }

export function parseLoginIdentifier(raw: string): LoginIdentifier {
  const value = raw.trim().toLowerCase()
  return value.includes('@') ? { kind: 'email', email: value } : { kind: 'username', username: value }
}

export function internalAuthEmail(userId: string): string {
  return `${userId}@${INTERNAL_AUTH_EMAIL_DOMAIN}`
}

/** อีเมลที่ต้องใช้กับบัญชี Supabase Auth ของผู้ใช้คนนี้ — อีเมลจริงถ้ามี ไม่งั้นอีเมลภายใน */
export function authEmailFor(user: { id: string; email: string | null }): string {
  return user.email ?? internalAuthEmail(user.id)
}
