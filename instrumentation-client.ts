import { installModalHistory } from '@/components/ui/modal-history'
import { installThaiZodErrors } from '@/lib/validation/zod-thai'

// ฝั่ง browser: ข้อความ validation ภาษาไทยของฟอร์ม (preship PS-015 · ฝั่ง server อยู่ที่ `instrumentation.ts`)
installThaiZodErrors()

// ปุ่ม Back ระหว่างเปิด modal ฟอร์ม (preship R3-014) — listener ต้องมาก่อน router ของ Next จึงติดตั้งก่อน hydrate
installModalHistory()
