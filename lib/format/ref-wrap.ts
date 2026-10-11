/**
 * **pure** — แบ่งเลขอ้างอิงยาว (เลขสัญญา/เลขเคส) เป็นหลายบรรทัดสำหรับ PDF (mytester WH-01)
 *
 * ฟอนต์ไทยของ PDF ปิดการตัดคำภายในคำ (`components/pdf/thai-font.ts` — `registerHyphenationCallback`)
 * ⇒ เลขที่ไม่มีช่องว่างอย่าง `MTJ-HP-6810-MT1011-01` ไม่มีจุดให้ขึ้นบรรทัด และล้นทับคอลัมน์ถัดไป
 * ตัวนี้แทรก `\n` **หลัง** `-` `/` `_` `.` ให้แต่ละบรรทัดไม่เกิน `maxChars` · ไม่เพิ่ม/ลบตัวอักษรของเลข
 * (ต่อบรรทัดกลับ = ค่าเดิมทุกตัว) · ช่วงที่ยาวเกินโดยไม่มีตัวคั่น ⇒ ตัดตามจำนวนตัวอักษร
 */
export function wrapReference(value: string, maxChars: number): string {
  if (!Number.isInteger(maxChars) || maxChars < 1) throw new RangeError('maxChars ต้องเป็นจำนวนเต็มบวก')
  if (value.length <= maxChars) return value
  // แยกเป็นช่วงที่จบด้วยตัวคั่น (ตัวคั่นอยู่ท้ายช่วง) — "MTJ-" "HP-" "6810-" …
  const segments = value.match(/[^-/_.]*[-/_.]|[^-/_.]+$/g) ?? [value]
  const lines: string[] = []
  let current = ''
  for (const segment of segments) {
    for (let start = 0; start < segment.length; start += maxChars) {
      const piece = segment.slice(start, start + maxChars)
      if (current.length + piece.length > maxChars && current !== '') {
        lines.push(current)
        current = ''
      }
      current += piece
    }
  }
  if (current !== '') lines.push(current)
  return lines.join('\n')
}
