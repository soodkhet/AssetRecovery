import { z } from 'zod'

/** Zod schema ชุดเดียวใช้ร่วม FE/BE (Rule 04) — หน้า Login และ `POST /api/auth/login` ใช้ตัวนี้ทั้งคู่ */
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('รูปแบบอีเมลไม่ถูกต้อง')),
  password: z.string().min(1, 'กรุณากรอกรหัสผ่าน'),
})

export type LoginInput = z.infer<typeof loginSchema>

/**
 * นโยบายรหัสผ่านตอนตั้งครั้งแรก/เปลี่ยนรหัส (`08` §6 · มติ PO ปิด D1 — ผู้ใช้ตั้งรหัสเอง)
 * สเปคไม่ได้กำหนดความยาวขั้นต่ำไว้ จึงยึดค่าที่เข้มกว่า default ของ Supabase (6 ตัว) ไว้ก่อน
 * ⚠️ ระบบเราไม่เก็บรหัสผ่าน — schema นี้ใช้ตรวจฝั่ง client ก่อนส่งให้ Supabase Auth เท่านั้น
 */
export const PASSWORD_MIN_LENGTH = 8

export const setPasswordSchema = z
  .object({
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `รหัสผ่านต้องยาวอย่างน้อย ${PASSWORD_MIN_LENGTH} ตัวอักษร`)
      .max(72, 'รหัสผ่านยาวเกินไป')
      .regex(/[A-Za-z]/, 'รหัสผ่านต้องมีตัวอักษรอย่างน้อย 1 ตัว')
      .regex(/[0-9]/, 'รหัสผ่านต้องมีตัวเลขอย่างน้อย 1 ตัว'),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: 'รหัสผ่านทั้งสองช่องไม่ตรงกัน',
    path: ['confirmPassword'],
  })

export type SetPasswordInput = z.infer<typeof setPasswordSchema>
