/**
 * **pure** — จุดตัดบรรทัดของข้อความไทยใน PDF (mytester7 S7-AG1-06 / S7-AG4-01)
 *
 * ตัวจัดบรรทัดของ `@react-pdf/renderer` แบ่ง "คำ" ด้วยช่องว่าง ASCII เท่านั้น ⇒ ภาษาไทยที่เขียนติดกัน
 * (ชื่อบุคคล/นิติบุคคลยาว) กลายเป็นคำเดียวยาวกว่าช่อง ล้นทับคอลัมน์ข้าง ๆ หรือตกขอบกระดาษจนอักษรหาย
 *
 * ตัวนี้ใช้เป็น `Font.registerHyphenationCallback` (ลงทะเบียนใน `ensureThaiFont()` — ทุกเอกสารได้ผลเหมือนกัน)
 * แบ่งคำด้วย `Intl.Segmenter('th', { granularity: 'word' })` แล้วแทรก {@link THAI_BREAK} ระหว่างคำไทย
 *
 * ทำไมต้องเป็น U+FEFF:
 * - react-pdf ถือส่วนที่ `trim()` แล้วว่างเป็น "ช่องว่าง" ⇒ ตัดบรรทัดตรงนั้นได้ **โดยไม่เติมขีด `-`**
 *   (ถ้าคืนเป็นส่วนย่อยเฉย ๆ react-pdf ถือเป็นจุดตัดพยางค์และเติม `-` ท้ายบรรทัด — ภาษาไทยไม่ใช้)
 * - ตัววางตัวอักษรของฟอนต์ซ่อนอักขระนี้เป็น glyph กว้าง 0 ⇒ บรรทัดที่ไม่ถูกตัดหน้าตาเหมือนเดิมทุกประการ
 *   และจำนวน glyph เท่าจำนวนอักขระ (ไม่ทำให้อักษรท้ายหายแบบปัญหาสระอำ)
 * - ข้อจำกัด: ชั้นข้อความของ PDF (คัดลอก/ค้นหา) เห็นจุดนี้เป็นช่องว่าง เช่น "สมพร รับเหมา" — หน้ากระดาษไม่เปลี่ยน
 *
 * กติกา: แทรกเฉพาะรอยต่อที่อักษรทั้งสองฝั่งเป็นอักษรไทย (เลข/อังกฤษ/วงเล็บ เช่น `40(8)` ไม่ถูกแตก) ·
 * ข้อความที่ผ่าน `pdfSafeThai()` แล้ว (สระอำแยกเป็น U+0E4D U+0E32) ถูกรวมกลับก่อนแบ่งคำ แล้วคืนตามอักขระเดิม ·
 * ต่อส่วนทั้งหมดแล้วตัด {@link THAI_BREAK} ออก = ข้อความเดิมทุกอักขระ
 */

export const THAI_BREAK = '﻿'

const THAI_CHAR = /[฀-๿]/
const DECOMPOSED_AM = 'ํา'

let segmenter: Intl.Segmenter | null = null

function thaiSegmenter(): Intl.Segmenter {
  segmenter ??= new Intl.Segmenter('th', { granularity: 'word' })
  return segmenter
}

/** แบ่ง `word` (ไม่มีช่องว่าง) เป็นส่วน ๆ พร้อมแทรก {@link THAI_BREAK} ระหว่างคำไทย */
export function thaiHyphenationCallback(word: string): string[] {
  if (!THAI_CHAR.test(word)) return [word]
  const composed = word.replaceAll(DECOMPOSED_AM, 'ำ')
  const parts: string[] = []
  let cursor = 0
  for (const { segment } of thaiSegmenter().segment(composed)) {
    // คืนตามอักขระของต้นฉบับ — "ำ" ที่รวมกลับกินต้นฉบับ 2 อักขระถ้าต้นฉบับเป็นรูปแยก
    let original = ''
    for (const char of segment) {
      if (char === 'ำ' && word.startsWith(DECOMPOSED_AM, cursor)) {
        original += DECOMPOSED_AM
        cursor += 2
      } else {
        original += word.slice(cursor, cursor + char.length)
        cursor += char.length
      }
    }
    const previous = parts.at(-1)
    if (previous === undefined) {
      parts.push(original)
    } else if (THAI_CHAR.test(previous.at(-1) ?? '') && THAI_CHAR.test(original[0] ?? '')) {
      parts.push(THAI_BREAK, original)
    } else {
      // ส่วนที่ติดกันโดยไม่มีจุดตัดต้องรวมเป็นชิ้นเดียว — แยกชิ้นไว้ react-pdf จะตัดตรงนั้นพร้อมเติม "-"
      parts[parts.length - 1] = previous + original
    }
  }
  if (cursor < word.length) {
    const rest = word.slice(cursor)
    if (parts.length === 0) parts.push(rest)
    else parts[parts.length - 1] = `${parts[parts.length - 1] ?? ''}${rest}`
  }
  return parts
}
