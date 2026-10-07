import { installThaiZodErrors } from '@/lib/validation/zod-thai'

// ฝั่ง browser: ข้อความ validation ภาษาไทยของฟอร์ม (preship PS-015 · ฝั่ง server อยู่ที่ `instrumentation.ts`)
installThaiZodErrors()
