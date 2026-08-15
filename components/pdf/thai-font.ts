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
 */

export const THAI_FONT = 'NotoSansThai'

let registered = false

export function ensureThaiFont(): void {
  if (registered) return
  Font.register({ family: THAI_FONT, src: join(process.cwd(), 'public/fonts/NotoSansThai.ttf') })
  Font.registerHyphenationCallback((word) => [word])
  registered = true
}
