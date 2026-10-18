import { describe, expect, it } from 'vitest'
import { pdfSafeThai } from '@/components/pdf/text'
import { THAI_BREAK, thaiHyphenationCallback } from '@/components/pdf/thai-line-break'

const join = (parts: readonly string[]): string => parts.filter((part) => part !== THAI_BREAK).join('')

describe('thaiHyphenationCallback — จุดตัดบรรทัดภาษาไทยใน PDF (mytester7 S7-AG1-06/S7-AG4-01)', () => {
  const longName = 'สมพรรับเหมาติดตามทรัพย์สินและบริหารสินเชื่อภาคตะวันตกและภาคกลางตอนล่าง'

  it('คำไทยยาวไม่มีช่องว่าง ⇒ มีจุดตัดหลายจุด และต่อกลับได้ข้อความเดิมทุกอักขระ', () => {
    const parts = thaiHyphenationCallback(longName)
    expect(parts.filter((part) => part === THAI_BREAK).length).toBeGreaterThan(5)
    expect(join(parts)).toBe(longName)
  })

  it('จุดตัดคั่นระหว่างชิ้นเสมอ — ไม่มีชิ้นติดกันที่ไม่มีจุดตัด (react-pdf จะเติม "-")', () => {
    const parts = thaiHyphenationCallback('นางสาวพรรณราย(MT7)40(8)')
    for (let index = 1; index < parts.length; index += 1) {
      const isBreak = parts[index] === THAI_BREAK
      const previousIsBreak = parts[index - 1] === THAI_BREAK
      expect(isBreak !== previousIsBreak).toBe(true)
    }
  })

  it('ไม่แตกเลข/อังกฤษ/วงเล็บ', () => {
    expect(thaiHyphenationCallback('40(8)')).toEqual(['40(8)'])
    expect(thaiHyphenationCallback('MTJ-HP-6810')).toEqual(['MTJ-HP-6810'])
    expect(join(thaiHyphenationCallback('(MT7)'))).toBe('(MT7)')
  })

  it('ข้อความที่แยกสระอำแล้ว (pdfSafeThai) ยังแบ่งคำถูก และคืนอักขระรูปแยกเดิม', () => {
    const word = pdfSafeThai('จำนวนเงินที่จ่ายค่าจ้างทำของ')
    const parts = thaiHyphenationCallback(word)
    expect(join(parts)).toBe(word)
    // "จำนวน" ต้องอยู่ชิ้นเดียว (ไม่ถูกแตกเป็น "จํา" + "นว" + "น" เพราะสระอำรูปแยก)
    expect(parts).toContain(pdfSafeThai('จำนวน'))
  })

  it('สระอำรูปปกติ (ไม่ผ่าน pdfSafeThai) ก็คืนอักขระเดิม', () => {
    expect(join(thaiHyphenationCallback('จำกัดสำนักงาน'))).toBe('จำกัดสำนักงาน')
  })

  it('คำสั้น/ไม่ใช่ภาษาไทยคืนชิ้นเดียว', () => {
    expect(thaiHyphenationCallback('บาท')).toEqual(['บาท'])
    expect(thaiHyphenationCallback('ABC')).toEqual(['ABC'])
  })
})
