import { z } from 'zod'

/** Zod schema ชุดเดียวใช้ร่วม FE/BE (Rule 04) — หน้า Login และ `POST /api/auth/login` ใช้ตัวนี้ทั้งคู่ */
export const loginSchema = z.object({
  /** อีเมลหรือชื่อผู้ใช้ (มติ PO 03/10/2569) — แยกชนิดด้วย `parseLoginIdentifier()` */
  identifier: z.string().trim().toLowerCase().min(1, 'กรุณากรอกอีเมลหรือชื่อผู้ใช้').max(255, 'ยาวเกินไป'),
  password: z.string().min(1, 'กรุณากรอกรหัสผ่าน'),
})

export type LoginInput = z.infer<typeof loginSchema>

/**
 * นโยบายรหัสผ่าน — ใช้ทั้งตอนผู้ดูแลตั้ง/รีเซ็ตให้ และตอนผู้ใช้เปลี่ยนเอง (มติ PO 03/10/2569)
 * สเปคไม่ได้กำหนดความยาวขั้นต่ำไว้ จึงยึดค่าที่เข้มกว่า default ของ Supabase (6 ตัว) ไว้ก่อน
 * ⚠️ ระบบเราไม่เก็บรหัสผ่าน — ส่งต่อให้ Supabase Auth (service role) ฝั่ง server เท่านั้น
 */
export const PASSWORD_MIN_LENGTH = 8

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `รหัสผ่านต้องยาวอย่างน้อย ${PASSWORD_MIN_LENGTH} ตัวอักษร`)
  .max(72, 'รหัสผ่านยาวเกินไป')
  .regex(/[A-Za-z]/, 'รหัสผ่านต้องมีตัวอักษรอย่างน้อย 1 ตัว')
  .regex(/[0-9]/, 'รหัสผ่านต้องมีตัวเลขอย่างน้อย 1 ตัว')

export const passwordPairFields = z.object({ password: passwordSchema, confirmPassword: z.string() })

/** ใช้ต่อท้าย schema ที่มีคู่ `password`/`confirmPassword` — error ลงที่ช่องยืนยัน */
export function refinePasswordPair<T extends z.ZodType<{ password: string; confirmPassword: string }>>(schema: T) {
  return schema.refine((value) => value.password === value.confirmPassword, {
    message: 'รหัสผ่านทั้งสองช่องไม่ตรงกัน',
    path: ['confirmPassword'],
  })
}

/** หน้า `/auth/set-password` (ลิงก์จากอีเมล Supabase — ยืนยันตัวตนด้วยลิงก์แล้ว ไม่ต้องมีรหัสเดิม) */
export const setPasswordSchema = refinePasswordPair(passwordPairFields)

/**
 * `POST /api/auth/change-password` — ผู้ใช้เปลี่ยนรหัสของตัวเอง (บังคับหลังผู้ดูแลตั้งให้ — DEC-010)
 * ต้องกรอกรหัสปัจจุบันเสมอ (ตอนถูกบังคับ = รหัสชั่วคราวที่ผู้ดูแลแจ้ง) — กัน session ที่ถูกขโมยยึดบัญชีถาวร
 */
export const changePasswordSchema = refinePasswordPair(
  passwordPairFields.extend({ currentPassword: z.string().min(1, 'กรุณากรอกรหัสผ่านปัจจุบัน') }),
).refine((value) => value.password !== value.currentPassword, {
  message: 'รหัสผ่านใหม่ต้องไม่ซ้ำรหัสผ่านปัจจุบัน',
  path: ['password'],
})

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>

export type SetPasswordInput = z.infer<typeof setPasswordSchema>
