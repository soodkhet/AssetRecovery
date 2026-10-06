import { describe, expect, it } from 'vitest'
import {
  DOCUMENT_NUMBER_DEFAULTS,
  DOCUMENT_NUMBER_LABEL,
  DOCUMENT_NUMBER_TYPES,
  PREFIX_PATTERN,
  describeDocumentNumberPattern,
  documentNumberHead,
  documentYear,
  effectiveLastSequence,
  formatDocumentNumber,
  isTaxDocumentType,
  nextDocumentSequence,
  previewNextDocumentNumber,
  sameDocumentNumberFormat,
  type DocumentNumberState,
} from '@/lib/document-numbering/format'

/** มติ PO 06/10/2569 U102 — รูปแบบเลขที่เอกสารทุกชนิด (pure) */

/** 14/08/2569 10:00 น. ไทย · 05/01/2570 10:00 น. ไทย */
const IN_2569 = new Date('2026-08-14T03:00:00Z')
const IN_2570 = new Date('2027-01-05T03:00:00Z')

const yearly: DocumentNumberState = {
  prefix: 'RAV',
  includeYear: true,
  digits: 4,
  resetYearly: true,
  currentSeq: 12,
  currentYear: 2569,
}
const continuous: DocumentNumberState = {
  prefix: 'INV',
  includeYear: false,
  digits: 4,
  resetYearly: false,
  currentSeq: 12,
  currentYear: 2569,
}

describe('formatDocumentNumber — ทุก option', () => {
  it('รวมปี พ.ศ.: `{คำนำหน้า}-{พ.ศ.}-{ลำดับ}`', () => {
    expect(formatDocumentNumber(yearly, 1, 2569)).toBe('RAV-2569-0001')
  })

  it('ไม่รวมปี: `{คำนำหน้า}-{ลำดับ}`', () => {
    expect(formatDocumentNumber(continuous, 13, 2569)).toBe('INV-0013')
  })

  it('คำนำหน้าว่าง: ไม่มีขีดนำหน้า', () => {
    expect(formatDocumentNumber({ ...yearly, prefix: '' }, 7, 2569)).toBe('2569-0007')
    expect(formatDocumentNumber({ ...continuous, prefix: '' }, 7, 2569)).toBe('0007')
  })

  it('คำนำหน้ามีขีดคั่นกลาง', () => {
    expect(formatDocumentNumber({ ...yearly, prefix: 'TAX-INV' }, 3, 2569)).toBe('TAX-INV-2569-0003')
  })

  it('จำนวนหลัก 3–8 เติมศูนย์ · เกินจำนวนหลักยาวขึ้นเอง ไม่ตัดหลัก', () => {
    expect(formatDocumentNumber({ ...continuous, digits: 3 }, 5, 2569)).toBe('INV-005')
    expect(formatDocumentNumber({ ...continuous, digits: 8 }, 5, 2569)).toBe('INV-00000005')
    expect(formatDocumentNumber({ ...continuous, digits: 3 }, 12345, 2569)).toBe('INV-12345')
  })

  it('ลำดับต้องเป็นจำนวนเต็มบวก · ปีต้องเป็น พ.ศ. (ค.ศ. หลุดเข้ามา = throw)', () => {
    expect(() => formatDocumentNumber(yearly, 0, 2569)).toThrow(RangeError)
    expect(() => formatDocumentNumber(yearly, 1.5, 2569)).toThrow(RangeError)
    expect(() => formatDocumentNumber(yearly, 1, 2026)).toThrow(RangeError)
  })

  it('ส่วนหัวของเลข (ใช้หาลำดับสูงสุดที่มีจริง) ตรงกับเลขเต็ม', () => {
    expect(documentNumberHead(yearly, 2569)).toBe('RAV-2569-')
    expect(documentNumberHead(continuous, 2569)).toBe('INV-')
    expect(documentNumberHead({ prefix: '', includeYear: false }, 2569)).toBe('')
    expect(formatDocumentNumber(yearly, 9, 2569).startsWith(documentNumberHead(yearly, 2569))).toBe(true)
  })
})

describe('ปี พ.ศ. ตามเวลาไทย', () => {
  it('00:30 น. 1 ม.ค. ไทย (= 17:30 UTC วันก่อน) เป็นปีใหม่แล้ว', () => {
    expect(documentYear(new Date('2026-12-31T16:59:59Z'))).toBe(2569)
    expect(documentYear(new Date('2026-12-31T17:30:00Z'))).toBe(2570)
  })

  it('วันที่ไม่ถูกต้อง = throw', () => {
    expect(() => documentYear(new Date('invalid'))).toThrow()
  })
})

describe('ลำดับถัดไป / ตัวอย่างเลขถัดไป', () => {
  it('รีเซ็ตรายปี: ปีเดียวกันนับต่อ · ข้ามปีเริ่ม 1', () => {
    expect(nextDocumentSequence(yearly, IN_2569)).toBe(13)
    expect(nextDocumentSequence(yearly, IN_2570)).toBe(1)
    expect(previewNextDocumentNumber(yearly, IN_2569)).toBe('RAV-2569-0013')
    expect(previewNextDocumentNumber(yearly, IN_2570)).toBe('RAV-2570-0001')
  })

  it('ต่อเนื่อง: ข้ามปีก็นับต่อ', () => {
    expect(nextDocumentSequence(continuous, IN_2570)).toBe(13)
    expect(previewNextDocumentNumber(continuous, IN_2570)).toBe('INV-0013')
    expect(previewNextDocumentNumber({ ...continuous, includeYear: true }, IN_2570)).toBe('INV-2570-0013')
  })

  it('ยังไม่เคยออก = เริ่ม 1', () => {
    expect(nextDocumentSequence({ ...yearly, currentSeq: 0, currentYear: null }, IN_2569)).toBe(1)
    expect(effectiveLastSequence({ ...continuous, currentSeq: 0, currentYear: null }, 2569)).toBe(0)
  })

  it('เปลี่ยนคำนำหน้าแล้วเลขถัดไปใช้รูปแบบใหม่ต่อจากลำดับเดิม', () => {
    expect(previewNextDocumentNumber({ ...yearly, prefix: 'RTN', digits: 3 }, IN_2569)).toBe('RTN-2569-013')
  })
})

describe('ค่าเริ่มต้น + ประเภท', () => {
  it('ครบทุกชนิด · ค่าเริ่มต้นตรงรูปแบบเดิม (INV/BL/LOT/DLV/WHT) + PV/ADV/RAV/CRT ใหม่', () => {
    expect(Object.keys(DOCUMENT_NUMBER_DEFAULTS).sort()).toEqual([...DOCUMENT_NUMBER_TYPES].sort())
    expect(Object.keys(DOCUMENT_NUMBER_LABEL).sort()).toEqual([...DOCUMENT_NUMBER_TYPES].sort())
    const sample = (type: (typeof DOCUMENT_NUMBER_TYPES)[number]) => formatDocumentNumber(DOCUMENT_NUMBER_DEFAULTS[type], 1, 2569)
    expect(sample('tax_invoice')).toBe('INV-0001')
    expect(sample('billing_batch')).toBe('BL-2569-001')
    expect(sample('handover_lot')).toBe('LOT-2569-001')
    expect(sample('delivery_note')).toBe('DLV-2569-001')
    expect(sample('wht_certificate')).toBe('WHT-2569-001')
    expect(sample('payment_voucher')).toBe('PV-2569-0001')
    expect(sample('advance')).toBe('ADV-2569-0001')
    expect(sample('advance_return')).toBe('RAV-2569-0001')
    expect(sample('substitute_receipt')).toBe('CRT-2569-0001')
  })

  it('ค่าเริ่มต้นผ่านกติกาคำนำหน้า · รีเซ็ตรายปีมีปีเสมอ', () => {
    for (const type of DOCUMENT_NUMBER_TYPES) {
      const format = DOCUMENT_NUMBER_DEFAULTS[type]
      expect(PREFIX_PATTERN.test(format.prefix), type).toBe(true)
      expect(!format.resetYearly || format.includeYear, type).toBe(true)
    }
  })

  it('เอกสารภาษี = ใบกำกับภาษี + 50 ทวิ เท่านั้น', () => {
    expect(DOCUMENT_NUMBER_TYPES.filter(isTaxDocumentType)).toEqual(['tax_invoice', 'wht_certificate'])
  })

  it('รูปแบบอ่านง่าย + เทียบรูปแบบ', () => {
    expect(describeDocumentNumberPattern(yearly)).toBe('RAV-{พ.ศ.}-NNNN')
    expect(describeDocumentNumberPattern(continuous)).toBe('INV-NNNN')
    const laterState: DocumentNumberState = { ...yearly, currentSeq: 99 }
    expect(sameDocumentNumberFormat(yearly, laterState)).toBe(true)
    expect(sameDocumentNumberFormat(yearly, { ...yearly, digits: 5 })).toBe(false)
  })
})
