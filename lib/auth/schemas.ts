import { z } from 'zod'

/** Zod schema ชุดเดียวใช้ร่วม FE/BE (Rule 04) — หน้า Login และ `POST /api/auth/login` ใช้ตัวนี้ทั้งคู่ */
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('รูปแบบอีเมลไม่ถูกต้อง')),
  password: z.string().min(1, 'กรุณากรอกรหัสผ่าน'),
})

export type LoginInput = z.infer<typeof loginSchema>
