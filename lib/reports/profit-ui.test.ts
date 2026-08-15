import { describe, expect, it } from 'vitest'
import {
  PROFIT_DIMENSION_OPTIONS,
  PROFIT_PERIOD_OPTIONS,
  freshnessLabel,
  grossProfitToneClass,
  marginToneClass,
} from '@/lib/reports/profit-ui'

describe('ตัวเลือกของแท็บกำไร', () => {
  it('มิติ 2 ตัวตาม `21` §6.2 · ช่วงเวลา 3 แบบตาม `21` §8', () => {
    expect(PROFIT_DIMENSION_OPTIONS.map((option) => option.id)).toEqual(['company', 'team'])
    expect(PROFIT_PERIOD_OPTIONS.map((option) => option.id)).toEqual(['month', 'quarter', 'year'])
    for (const option of [...PROFIT_DIMENSION_OPTIONS, ...PROFIT_PERIOD_OPTIONS]) {
      expect(option.label.length).toBeGreaterThan(0)
    }
  })
})

describe('marginToneClass', () => {
  it('≥40% เขียว · ≥25% ส้ม · ต่ำกว่านั้นแดง', () => {
    expect(marginToneClass(48.9)).toContain('emerald')
    expect(marginToneClass(40)).toContain('emerald')
    expect(marginToneClass(37)).toContain('amber')
    expect(marginToneClass(25)).toContain('amber')
    expect(marginToneClass(10)).toContain('red')
    expect(marginToneClass(-5)).toContain('red')
  })

  it('`null` (revenue = 0 ⇒ N/A) เป็นสีเทา ไม่ใช่สีแดง', () => {
    expect(marginToneClass(null)).toContain('slate')
  })
})

describe('grossProfitToneClass', () => {
  it('ขาดทุนขั้นต้นเป็นสีแดง · กำไรเป็นสีเขียว', () => {
    expect(grossProfitToneClass(-1)).toContain('red')
    expect(grossProfitToneClass(0)).toContain('emerald')
    expect(grossProfitToneClass(100_00)).toContain('emerald')
  })
})

describe('freshnessLabel', () => {
  it('บอกได้ว่าเป็นข้อมูลแคชหรือคำนวณสด', () => {
    expect(freshnessLabel(true)).toContain('แคช')
    expect(freshnessLabel(false)).toContain('คำนวณสด')
  })
})
