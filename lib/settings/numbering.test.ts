import { describe, expect, it } from 'vitest'
import {
  documentYear,
  formatInvoiceNumber,
  nextResetYear,
  nextSequence,
  numberingChangeWarning,
  previewNextNumber,
  type NumberingState,
} from '@/lib/settings/numbering'

/** `13` §6.12 · `31` §6.2 — เลขที่ใบกำกับภาษีต้องต่อเนื่อง ปีบนเลขเอกสารเป็น **พ.ศ.** (Rule 01) */

const continuous: NumberingState = { mode: 'continuous', prefix: 'INV', digitLength: 4, lastNumber: 12, lastResetYear: null }
const yearly: NumberingState = { mode: 'yearly_reset', prefix: 'INV', digitLength: 4, lastNumber: 12, lastResetYear: 2569 }

/** 14/08/2026 ค.ศ. = พ.ศ. 2569 (เวลาไทย) */
const inYear2569 = new Date('2026-08-14T03:00:00Z')
/** 01/01/2027 ค.ศ. 07:00 ไทย = พ.ศ. 2570 */
const inYear2570 = new Date('2027-01-01T00:00:00Z')

describe('documentYear', () => {
  it('คืนปี พ.ศ. ตามเวลาไทย', () => {
    expect(documentYear(inYear2569)).toBe(2569)
    expect(documentYear(inYear2570)).toBe(2570)
  })

  it('สิ้นปีตามเวลาไทยยังเป็นปีเดิม (UTC ข้ามปีแล้วแต่ไทยยังไม่ข้าม)', () => {
    // 31/12/2026 20:00Z = 01/01/2027 03:00 ไทย → พ.ศ. 2570
    expect(documentYear(new Date('2026-12-31T20:00:00Z'))).toBe(2570)
    // 31/12/2026 10:00Z = 31/12/2026 17:00 ไทย → พ.ศ. 2569
    expect(documentYear(new Date('2026-12-31T10:00:00Z'))).toBe(2569)
  })

  it('วันที่ไม่ถูกต้อง = โยน error ไม่ปล่อยเลขเพี้ยนออกไป', () => {
    expect(() => documentYear(new Date('ไม่ใช่วันที่'))).toThrow()
  })
})

describe('formatInvoiceNumber', () => {
  it('โหมดต่อเนื่อง — prefix + เลขเติมศูนย์', () => {
    expect(formatInvoiceNumber(continuous, 13, inYear2569)).toBe('INV-0013')
  })

  it('โหมดรีเซ็ตรายปี — แทรกปี พ.ศ.', () => {
    expect(formatInvoiceNumber(yearly, 1, inYear2569)).toBe('INV-2569-0001')
  })

  it('ไม่มี prefix ก็ได้ (ไม่มีขีดนำหน้าค้าง)', () => {
    expect(formatInvoiceNumber({ ...continuous, prefix: '' }, 7, inYear2569)).toBe('0007')
    expect(formatInvoiceNumber({ ...yearly, prefix: '  ' }, 7, inYear2569)).toBe('2569-0007')
  })

  it('เลขยาวเกินจำนวนหลักไม่ถูกตัด (เลขต้องไม่หาย)', () => {
    expect(formatInvoiceNumber({ ...continuous, digitLength: 3 }, 12345, inYear2569)).toBe('INV-12345')
  })
})

describe('nextSequence / nextResetYear', () => {
  it('โหมดต่อเนื่อง เดินเลขต่อไปเรื่อยๆ ข้ามปีก็ไม่รีเซ็ต', () => {
    expect(nextSequence(continuous, inYear2569)).toBe(13)
    expect(nextSequence(continuous, inYear2570)).toBe(13)
    expect(nextResetYear(continuous, inYear2570)).toBeNull()
  })

  it('โหมดรีเซ็ตรายปี — ปีเดิมเดินต่อ ปีใหม่กลับไป 1', () => {
    expect(nextSequence(yearly, inYear2569)).toBe(13)
    expect(nextSequence(yearly, inYear2570)).toBe(1)
    expect(nextResetYear(yearly, inYear2570)).toBe(2570)
  })

  it('ยังไม่เคยออกเลขในโหมดรีเซ็ต (lastResetYear = null) เริ่มที่ 1', () => {
    expect(nextSequence({ ...yearly, lastNumber: 0, lastResetYear: null }, inYear2569)).toBe(1)
  })
})

describe('previewNextNumber', () => {
  it('แสดงเลขถัดไปตามรูปแบบปัจจุบัน', () => {
    expect(previewNextNumber(continuous, inYear2569)).toBe('INV-0013')
    expect(previewNextNumber(yearly, inYear2570)).toBe('INV-2570-0001')
  })
})

describe('numberingChangeWarning', () => {
  it('ยังไม่เคยออกใบกำกับ = ไม่เตือน', () => {
    expect(numberingChangeWarning(continuous, { ...continuous, prefix: 'TX' }, 0)).toBeNull()
  })

  it('ค่าไม่เปลี่ยน = ไม่เตือน', () => {
    expect(numberingChangeWarning(continuous, { ...continuous }, 25)).toBeNull()
  })

  it('เปลี่ยนรูปแบบหลังออกเอกสารแล้ว = เตือน (ไม่ block — `13` §6.12)', () => {
    const warning = numberingChangeWarning(continuous, { ...continuous, mode: 'yearly_reset' }, 25)
    expect(warning).toContain('25')
  })

  it('เปลี่ยนจำนวนหลักก็เตือน', () => {
    expect(numberingChangeWarning(continuous, { ...continuous, digitLength: 6 }, 3)).not.toBeNull()
  })
})
