import { describe, expect, it } from 'vitest'
import { buildCsv, csvBaht, csvCell, csvDate, csvText, CSV_BOM, CSV_EMPTY } from '@/lib/exports/csv'

describe('CSV ของ Accounting Pack (`37` §6.1)', () => {
  it('ไฟล์ขึ้นต้นด้วย BOM และปิดทุกบรรทัดด้วย CRLF (ตรงกับ reference/samples)', () => {
    const csv = buildCsv(['a', 'b'], [['1', '2']])
    expect(csv.startsWith(CSV_BOM)).toBe(true)
    expect(csv).toBe(`${CSV_BOM}a,b\r\n1,2\r\n`)
  })

  it('ใส่เครื่องหมายคำพูดเมื่อค่ามีลูกน้ำ/คำพูด/ขึ้นบรรทัดใหม่', () => {
    expect(csvCell('ปกติ')).toBe('ปกติ')
    expect(csvCell('มี,ลูกน้ำ')).toBe('"มี,ลูกน้ำ"')
    expect(csvCell('มี"คำพูด"')).toBe('"มี""คำพูด"""')
    expect(csvCell('ขึ้น\nบรรทัด')).toBe('"ขึ้น\nบรรทัด"')
    expect(csvCell(null)).toBe('')
  })

  it('เหตุผลของ Adjustment ที่มีลูกน้ำไม่ทำให้คอลัมน์เพี้ยน', () => {
    const csv = buildCsv(['reason'], [['แก้ไขยอด VAT, ปัดเศษผิด']])
    expect(csv).toBe(`${CSV_BOM}reason\r\n"แก้ไขยอด VAT, ปัดเศษผิด"\r\n`)
  })

  it('เงินเป็นทศนิยม 2 ตำแหน่งไม่มีตัวคั่นหลักพัน และคำนวณด้วยเลขจำนวนเต็มล้วน (Rule 01)', () => {
    expect(csvBaht(1200000)).toBe('12000.00')
    expect(csvBaht(490600)).toBe('4906.00')
    expect(csvBaht(1808942)).toBe('18089.42')
    expect(csvBaht(5)).toBe('0.05')
    expect(csvBaht(0)).toBe('0.00')
  })

  it('ยอดติดลบของ Adjustment แสดงเครื่องหมายลบหน้าจำนวน', () => {
    expect(csvBaht(-10000)).toBe('-100.00')
    expect(csvBaht(-1)).toBe('-0.01')
  })

  it('วันที่เป็น พ.ศ. DD/MM/YYYY เสมอ และค่าว่างเป็น "-" (Rule 01)', () => {
    expect(csvDate(new Date('2026-06-25T03:00:00Z'))).toBe('25/06/2569')
    expect(csvDate(null)).toBe(CSV_EMPTY)
    // 07:00 ของวันไทย = วันเดียวกัน (เที่ยงคืน UTC ของ 25/06 = 07:00 ไทย)
    expect(csvDate(new Date('2026-06-25T00:00:00Z'))).toBe('25/06/2569')
  })

  it('ข้อความว่าง/ช่องว่างล้วนกลายเป็น "-" ไม่ใช่ช่องเปล่า', () => {
    expect(csvText(null)).toBe(CSV_EMPTY)
    expect(csvText('   ')).toBe(CSV_EMPTY)
    expect(csvText(' BTR-2569-06-0231 ')).toBe('BTR-2569-06-0231')
  })
})
