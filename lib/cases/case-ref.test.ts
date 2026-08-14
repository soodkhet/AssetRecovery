import { describe, expect, it } from 'vitest'
import { normalizeCaseRef } from '@/lib/cases/case-ref'

/**
 * `38` §11 — normalize เบาที่สุด: uppercase + trim หัวท้าย **เท่านั้น**
 * เทสต์ชุดนี้คือยามกัน "ปรับ normalize ให้ฉลาดขึ้น" ซึ่งจะกลายเป็น false-positive บล็อกเคสที่ไม่ซ้ำจริง
 */
describe('normalizeCaseRef()', () => {
  it('uppercase + trim หัวท้าย', () => {
    expect(normalizeCaseRef('  sf-2026-00832 ')).toBe('SF-2026-00832')
    expect(normalizeCaseRef('sf2026')).toBe('SF2026')
  })

  it('ไม่ตัด dash / underscore ออก (false-positive อันตรายกว่า)', () => {
    expect(normalizeCaseRef('SF-2026-001')).toBe('SF-2026-001')
    expect(normalizeCaseRef('SF_2026_001')).toBe('SF_2026_001')
    expect(normalizeCaseRef('SF-2026-001')).not.toBe(normalizeCaseRef('SF2026001'))
  })

  it('ไม่ยุบช่องว่างที่อยู่กลางข้อความ', () => {
    expect(normalizeCaseRef(' SF 2026 001 ')).toBe('SF 2026 001')
  })

  it('idempotent — normalize ซ้ำได้ค่าเดิม', () => {
    const once = normalizeCaseRef('  sf-2026-00832 ')
    expect(normalizeCaseRef(once)).toBe(once)
  })

  it('ค่าว่างยังเป็นค่าว่าง (schema เป็นคนปฏิเสธ ไม่ใช่ตัว normalize)', () => {
    expect(normalizeCaseRef('   ')).toBe('')
  })
})
