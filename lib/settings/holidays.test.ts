import { describe, expect, it } from 'vitest'
import {
  holidayWeekdayLabel,
  holidayYearBe,
  holidayYearRange,
  MAX_HOLIDAY_IMPORT_ROWS,
  normalizeHolidayDate,
  parseHolidayImport,
} from '@/lib/settings/holidays'
import { holidayCreateSchema, holidayImportSchema } from '@/lib/settings/schemas'

/** ปฏิทินวันหยุด (มติ PO 06/10/2569 UAT U93) — ตัวแยกข้อความนำเข้า + ตัวช่วยแสดงผล */
describe('normalizeHolidayDate', () => {
  it('รับ ค.ศ. และ พ.ศ. (−543) · คั่นด้วย - หรือ /', () => {
    expect(normalizeHolidayDate('2026-12-31')).toBe('2026-12-31')
    expect(normalizeHolidayDate('2569-12-31')).toBe('2026-12-31')
    expect(normalizeHolidayDate('2570/4/13')).toBe('2027-04-13')
  })

  it('วันที่ไม่มีจริง/รูปแบบผิด ⇒ null', () => {
    expect(normalizeHolidayDate('2026-02-30')).toBeNull()
    expect(normalizeHolidayDate('31/12/2026')).toBeNull()
    expect(normalizeHolidayDate('วันหยุด')).toBeNull()
  })
})

describe('parseHolidayImport', () => {
  it('แยกบรรทัด comma/tab · ข้ามหัวตาราง บรรทัดว่าง และ #', () => {
    const result = parseHolidayImport(
      'วันที่,ชื่อ\n2027-01-01,วันขึ้นปีใหม่\n\n# หมายเหตุ\n2570-04-13\tวันสงกรานต์\r\n"2027-04-14","วันสงกรานต์ (2)"',
    )
    expect(result.errors).toEqual([])
    expect(result.items).toEqual([
      { holidayDate: '2027-01-01', name: 'วันขึ้นปีใหม่' },
      { holidayDate: '2027-04-13', name: 'วันสงกรานต์' },
      { holidayDate: '2027-04-14', name: 'วันสงกรานต์ (2)' },
    ])
  })

  it('ชื่อมี comma ได้ (ตัดที่ comma แรกเท่านั้น)', () => {
    expect(parseHolidayImport('2027-05-04,วันฉัตรมงคล, หยุดชดเชย').items[0]?.name).toBe('วันฉัตรมงคล, หยุดชดเชย')
  })

  it('รายงานข้อผิดพลาดรายบรรทัด: วันที่ผิด · ไม่มีชื่อ · วันที่ซ้ำในชุด', () => {
    const result = parseHolidayImport('2027-01-01,ปีใหม่\n2027-02-30,ไม่มีวันนี้\n2027-03-01\n2570-01-01,ซ้ำ')
    expect(result.items).toHaveLength(1)
    expect(result.errors.map((error) => error.line)).toEqual([2, 3, 4])
    expect(result.errors[2]?.message).toContain('บรรทัดที่ 1')
    // ข้อความที่ผู้ใช้เห็นห้ามมีเลขอ้างอิงสเปค
    for (const error of result.errors) expect(error.message).not.toMatch(/§|`\d{2}`/)
  })

  it(`เกิน ${MAX_HOLIDAY_IMPORT_ROWS} วัน ⇒ error ระดับชุด`, () => {
    const lines = Array.from({ length: MAX_HOLIDAY_IMPORT_ROWS + 1 }, (_, index) => {
      const date = new Date(Date.UTC(2027, 0, 1 + index)).toISOString().slice(0, 10)
      return `${date},วันหยุด ${index}`
    })
    const result = parseHolidayImport(lines.join('\n'))
    expect(result.errors.some((error) => error.line === 0)).toBe(true)
  })
})

describe('ตัวช่วยแสดงผล', () => {
  it('ปี พ.ศ. · ช่วงวันที่ของปี · ชื่อวัน', () => {
    expect(holidayYearBe('2026-12-31')).toBe(2569)
    const range = holidayYearRange(2570)
    expect(range.from.toISOString()).toBe('2027-01-01T00:00:00.000Z')
    expect(range.to.toISOString()).toBe('2027-12-31T00:00:00.000Z')
    expect(holidayWeekdayLabel('2026-11-15')).toBe('อาทิตย์')
    expect(holidayWeekdayLabel('2026-11-16')).toBe('จันทร์')
  })
})

describe('Zod schema (ใช้ร่วม FE/BE)', () => {
  it('เพิ่มวันหยุด: วันที่ YYYY-MM-DD → เที่ยงคืน UTC · ชื่อ + เหตุผลบังคับ', () => {
    const parsed = holidayCreateSchema.safeParse({ holidayDate: '2026-12-31', name: 'วันสิ้นปี', reason: 'ประกาศวันหยุดประจำปี' })
    expect(parsed.success).toBe(true)
    expect(parsed.data?.holidayDate.toISOString()).toBe('2026-12-31T00:00:00.000Z')
    expect(holidayCreateSchema.safeParse({ holidayDate: '2026-12-31', name: ' ', reason: 'ประกาศวันหยุดประจำปี' }).success).toBe(false)
    expect(holidayCreateSchema.safeParse({ holidayDate: '2026-12-31', name: 'วันสิ้นปี', reason: '' }).success).toBe(false)
  })

  it('นำเข้า: ต้องมีอย่างน้อย 1 รายการ ไม่เกินเพดาน', () => {
    expect(holidayImportSchema.safeParse({ items: [], reason: 'นำเข้าวันหยุด' }).success).toBe(false)
    expect(
      holidayImportSchema.safeParse({ items: [{ holidayDate: '2027-01-01', name: 'ปีใหม่' }], reason: 'นำเข้าวันหยุด' }).success,
    ).toBe(true)
  })
})
