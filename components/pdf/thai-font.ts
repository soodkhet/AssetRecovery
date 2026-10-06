import { join } from 'node:path'
import { Font } from '@react-pdf/renderer'

/**
 * ฟอนต์ไทยของเอกสาร PDF ทุกใบ (`28` §7) — เรียก `ensureThaiFont()` **ก่อน** `renderToBuffer()` เสมอ
 *
 * ⚠️ ฟอนต์ในตัวของ `@react-pdf/renderer` ไม่มี glyph ภาษาไทย — ไม่ register = ตัวอักษรไทย
 *    **หายทั้งใบโดยไม่มี error**
 * ⚠️ คำไทยไม่มีช่องว่างคั่น ต้องปิดตัวตัดคำ ไม่งั้นบรรทัดล้นกรอบ
 * ⚠️ ตัว trace ของ Next มองไม่เห็นการอ่านไฟล์ฟอนต์ตอน runtime ⇒ route ที่เรนเดอร์ PDF ต้องอยู่ใน
 *    `outputFileTracingIncludes` ของ `next.config.ts` ไม่งั้นพังเฉพาะบน Vercel
 * ⚠️ ลงทะเบียน 2 น้ำหนัก (UAT BUG-171): ปกติ (400) + **ตัวหนา (700)** — ไฟล์ตัวหนาเป็น static instance ของ
 *    Noto Sans Thai จาก Google Fonts (OFL) อยู่ใน repo · ไม่มีไฟล์ตัวหนา = `fontWeight: 700` ถูกวาดเป็นตัวปกติเงียบ ๆ
 *    ห้ามดึงฟอนต์จาก CDN ตอน runtime
 */

export const THAI_FONT = 'NotoSansThai'

/** ไฟล์ฟอนต์ตามน้ำหนัก (path จากรากโปรเจกต์) — ใช้ร่วมกับ glyph test */
export const THAI_FONT_FILES = {
  regular: 'public/fonts/NotoSansThai.ttf',
  bold: 'public/fonts/NotoSansThai-Bold.ttf',
} as const

let registered = false

export function ensureThaiFont(): void {
  if (registered) return
  Font.register({
    family: THAI_FONT,
    fonts: [
      { src: join(process.cwd(), THAI_FONT_FILES.regular), fontWeight: 'normal' },
      { src: join(process.cwd(), THAI_FONT_FILES.bold), fontWeight: 'bold' },
    ],
  })
  Font.registerHyphenationCallback((word) => [word])
  registered = true
}
