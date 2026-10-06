import { mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderAdvanceRequestPdf } from '@/components/pdf/advance-request'
import { renderAdvanceReturnPdf } from '@/components/pdf/advance-return'
import { extractPdfText } from '@/components/pdf/extract-text'
import { renderSubstituteReceiptPdf } from '@/components/pdf/substitute-receipt'
import { THAI_FONT_FILES } from '@/components/pdf/thai-font'
import {
  assertAdvanceRequestPrintable,
  buildAdvanceRequestDoc,
  buildAdvanceReturnDoc,
  canPrintAdvanceRequest,
  type AdvanceDocSource,
  type AdvanceReturnDocSource,
} from '@/lib/advances/advance-doc'
import { AdvanceError } from '@/lib/advances/errors'
import type { ReceiptStyleDoc } from '@/lib/documents/receipt-style-doc'
import { payeeDocParty, payeeDisplayName } from '@/lib/documents/receipt-style-doc'
import { buildSubstituteReceiptDoc, type SubstituteReceiptDocSource } from '@/lib/substitute-receipts/substitute-receipt-doc'
import { testLetterhead } from '@/tests/helpers/letterhead'

const LH = testLetterhead()

/**
 * ใบเบิก/ใบรับคืนเงินทดรอง + ใบรับรองแทนใบเสร็จรับเงิน (มติ PO U100/U101/U103 · mockup `reference/documents.html` ข้อ 6–8)
 * builder (pure) → ข้อความที่ประกอบเสร็จ · เรนเดอร์ PDF จริง 3 ชนิด + ตรวจว่าทุกอักษรมี glyph ในฟอนต์ไทย
 */

const PAYEE = {
  fullName: 'สมชาย ภาคสนาม',
  nameTitle: 'นาย',
  phone: '0812345678',
  nationalId: '1100100100011',
  addressDetail: '99/1 หมู่ 2',
  addressSubdistrict: 'บางพระ',
  addressDistrict: 'ศรีราชา',
  addressProvince: 'ชลบุรี',
  addressPostalCode: '20110',
  bankName: 'กสิกรไทย',
  accountNumber: '123-4-56789-0',
}

const ADVANCE: AdvanceDocSource = {
  advanceNumber: 'ADV-2569-0012',
  status: 'cleared',
  requestedSatang: 350_000,
  approvedSatang: 300_000,
  usedSatang: 250_000,
  returnSatang: 50_000,
  purpose: 'ค่าเดินทางและที่พัก งานติดตามทรัพย์ จังหวัดชลบุรี',
  dueClearDate: new Date('2026-10-13T00:00:00Z'),
  createdAt: new Date('2026-09-30T03:00:00Z'),
  approvedAt: new Date('2026-10-01T03:00:00Z'),
  clearedAt: new Date('2026-10-07T03:00:00Z'),
  approverName: 'การเงิน ทดสอบ',
  teamName: 'ทีมตะวันออก',
  payee: PAYEE,
  payoutBatchName: 'รอบจ่าย ต.ค. 2569 รอบ 1',
  substituteReceiptNumber: 'CRT-2569-0009',
}

const RETURN: AdvanceReturnDocSource = {
  returnNumber: 'RAV-2569-0004',
  channel: 'payout_offset',
  amountSatang: 50_000,
  returnDate: new Date('2026-10-31T03:00:00Z'),
  payoutBatchName: 'รอบจ่าย ต.ค. 2569 รอบ 2',
  voucherNumber: 'PV-2569-0031',
  reversedAt: null,
  reversalReason: null,
  collectedBeforeSatang: 0,
  advance: ADVANCE,
}

const CRT: SubstituteReceiptDocSource = {
  receiptNumber: 'CRT-2569-0009',
  issueDate: new Date('2026-10-07T00:00:00Z'),
  totalSatang: 26_000,
  lines: [
    { lineDate: new Date('2026-10-03T00:00:00Z'), description: 'ค่าผ่านทางพิเศษ ด่านบางนา (ขาไป)', amountSatang: 7_000, note: 'ทางพิเศษ' },
    { lineDate: new Date('2026-10-03T00:00:00Z'), description: 'ค่ารถจักรยานยนต์รับจ้าง', amountSatang: 4_000, note: null },
    { lineDate: new Date('2026-10-04T00:00:00Z'), description: 'ค่ารถจักรยานยนต์รับจ้าง', amountSatang: 6_000, note: 'วินหน้าซอย' },
    { lineDate: new Date('2026-10-05T00:00:00Z'), description: 'ค่าที่จอดรถ ตลาดสด', amountSatang: 2_000, note: null },
    { lineDate: new Date('2026-10-06T00:00:00Z'), description: 'ค่าผ่านทางพิเศษ ด่านชลบุรี (ขากลับ)', amountSatang: 7_000, note: null },
  ],
  payee: PAYEE,
  teamName: 'ทีมตะวันออก',
  reference: { label: 'อ้างอิงเงินทดรอง', value: 'ADV-2569-0012' },
}

interface FontLike {
  hasGlyphForCodePoint(codePoint: number): boolean
}

function openThaiFonts(): FontLike[] {
  const localRequire = createRequire(import.meta.url)
  const fontkitPath = localRequire.resolve('fontkit', { paths: [localRequire.resolve('@react-pdf/renderer')] })
  const fontkit = localRequire(fontkitPath) as { openSync(path: string): FontLike }
  // ตัวปกติ + ตัวหนา (BUG-171) — ข้อความบนเอกสารอาจพิมพ์น้ำหนักใดก็ได้
  return [THAI_FONT_FILES.regular, THAI_FONT_FILES.bold].map((file) => fontkit.openSync(join(process.cwd(), file)))
}

/** ทุกข้อความที่จะพิมพ์ของเอกสาร */
function docTexts(doc: ReceiptStyleDoc): string {
  return [
    doc.title,
    doc.titleEn,
    doc.copyLabel ?? '',
    doc.dateText,
    doc.number,
    ...doc.meta.flatMap((entry) => [entry.label, entry.value]),
    ...doc.parties.flatMap((party) => [party.label, party.name, ...party.lines]),
    ...doc.columns.map((column) => column.header),
    ...doc.rows.flatMap((row) => [...row.cells, row.sub ?? '']),
    doc.infoLine?.text ?? '',
    ...(doc.choices?.options.map((option) => option.label) ?? []),
    ...doc.summary.flatMap((entry) => [entry.label, entry.value]),
    doc.wordsText,
    doc.certification ?? '',
    doc.note ?? '',
    ...doc.signatures.flatMap((signature) => [signature.role, signature.name ?? '']),
    doc.cancelled?.title ?? '',
    doc.cancelled?.detail ?? '',
    doc.footerLeft,
    '[X] [   ] ( ........ ) วันที่ ......../......../............ หน้า 1/1 : ·',
  ].join('\n')
}

function missingGlyphs(text: string): string[] {
  const fonts = openThaiFonts()
  return [...new Set([...text])].filter(
    (char) => !/\s/.test(char) && fonts.some((font) => !font.hasGlyphForCodePoint(char.codePointAt(0) ?? 0)),
  )
}

describe('ข้อมูลผู้เบิกบนเอกสาร', () => {
  it('ชื่อพร้อมคำนำหน้า · ที่อยู่แบบต่างจังหวัด · เลขประจำตัวประชาชน', () => {
    const party = payeeDocParty('ผู้เบิก', PAYEE)
    expect(party.name).toBe('นายสมชาย ภาคสนาม')
    expect(party.lines).toContain('99/1 หมู่ 2 ต.บางพระ อ.ศรีราชา จ.ชลบุรี 20110')
    expect(party.lines).toContain('เลขประจำตัวประชาชน 1100100100011')
  })

  it('ชื่อขึ้นต้นด้วยคำนำหน้าแล้วไม่เติมซ้ำ', () => {
    expect(payeeDisplayName({ fullName: 'นายสมชาย', nameTitle: 'นาย' })).toBe('นายสมชาย')
  })
})

describe('ใบเบิกเงินทดรอง', () => {
  it('ออกได้หลังอนุมัติเท่านั้น', () => {
    expect(canPrintAdvanceRequest('pending_approval')).toBe(false)
    expect(canPrintAdvanceRequest('rejected')).toBe(false)
    expect(canPrintAdvanceRequest('approved')).toBe(true)
    expect(canPrintAdvanceRequest('overdue')).toBe(true)
    expect(() => assertAdvanceRequestPrintable('pending_approval', 'a-1')).toThrow(AdvanceError)
  })

  it('เลข ADV · ต้นฉบับเดียว · ยอดอนุมัติ + ตัวอักษร · ผู้เซ็น 3 ช่อง', () => {
    const doc = buildAdvanceRequestDoc(ADVANCE, LH)
    expect(doc.number).toBe('ADV-2569-0012')
    expect(doc.copyLabel).toBe('(ต้นฉบับ / Original)')
    expect(doc.dateText).toBe('01/10/2569')
    expect(doc.parties.map((party) => party.label)).toEqual(['จ่ายโดย', 'ผู้เบิก'])
    expect(doc.parties[1].lines).toContain('บัญชีรับโอน: กสิกรไทย 123-4-56789-0')
    expect(doc.summary).toEqual([{ label: 'รวมเงินเบิกทั้งสิ้น :', value: '3,000.00', tone: 'total' }])
    expect(doc.wordsText).toBe('จำนวนเงิน: -สามพันบาทถ้วน-')
    expect(doc.rows[0]?.sub).toBe('ขอเบิก 3,500.00 บาท · อนุมัติ 3,000.00 บาท')
    expect(doc.signatures.map((signature) => signature.role)).toEqual(['ผู้เบิก', 'ผู้อนุมัติ', 'ผู้จ่ายเงิน'])
    expect(doc.meta).toContainEqual({ label: 'กำหนดเคลียร์ยอด', value: '13/10/2569' })
    expect(missingGlyphs(docTexts(doc))).toEqual([])
  })
})

describe('ใบรับคืนเงินทดรอง', () => {
  it('เลข RAV · ชำระโดยพนักงาน/ชำระให้องค์กร · ยอดเบิก/ใช้จริง/คืน · ช่องทางหักกลบพร้อมรอบ + PV', () => {
    const doc = buildAdvanceReturnDoc(RETURN, LH)
    expect(doc.number).toBe('RAV-2569-0004')
    expect(doc.parties.map((party) => party.label)).toEqual(['ชำระโดย', 'ชำระให้'])
    expect(doc.rows.map((row) => row.cells[2])).toEqual(['3,000.00', '(2,500.00)'])
    expect(doc.rows[1]?.sub).toContain('CRT-2569-0009')
    expect(doc.summary.at(-1)).toEqual({ label: 'ยอดรับคืนครั้งนี้ :', value: '500.00', tone: 'total' })
    expect(doc.choices?.options).toEqual([
      { label: 'เงินสด', checked: false },
      { label: 'โอนเข้าบัญชีบริษัท', checked: false },
      { label: 'หักกลบในรอบจ่าย รอบจ่าย ต.ค. 2569 รอบ 2 · PV-2569-0031', checked: true },
    ])
    expect(doc.cancelled).toBeNull()
    expect(doc.signatures.map((signature) => signature.role)).toEqual(['ผู้รับเงิน (การเงิน)', 'ผู้คืนเงิน'])
    expect(missingGlyphs(docTexts(doc))).toEqual([])
  })

  it('รับคืนบางส่วนหลายครั้ง — แสดงยอดที่รับแล้วก่อนหน้า', () => {
    const doc = buildAdvanceReturnDoc({ ...RETURN, channel: 'cash', amountSatang: 20_000, collectedBeforeSatang: 30_000 }, LH)
    expect(doc.summary.map((entry) => entry.value)).toEqual(['500.00', '(300.00)', '200.00'])
    expect(doc.choices?.options[0]).toEqual({ label: 'เงินสด', checked: true })
  })

  it('แถวที่กลับรายการแล้ว — ป้าย "ยกเลิก" พร้อมวันที่และเหตุผล', () => {
    const doc = buildAdvanceReturnDoc(
      { ...RETURN, reversedAt: new Date('2026-11-02T03:00:00Z'), reversalReason: 'รอบจ่ายถูกยกเลิก' },
      LH,
    )
    expect(doc.cancelled?.title).toBe('ยกเลิก')
    expect(doc.cancelled?.detail).toContain('02/11/2569')
    expect(doc.cancelled?.detail).toContain('รอบจ่ายถูกยกเลิก')
  })
})

describe('ใบรับรองแทนใบเสร็จรับเงิน', () => {
  it('รายการ 5 บรรทัด · รวม ฿260 · คำรับรองระบุชื่อผู้จ่าย · ผู้เซ็น 2 ช่อง', () => {
    const doc = buildSubstituteReceiptDoc(CRT, LH)
    expect(doc.number).toBe('CRT-2569-0009')
    expect(doc.rows).toHaveLength(5)
    expect(doc.rows[0]?.cells).toEqual(['03/10/2569', 'ค่าผ่านทางพิเศษ ด่านบางนา (ขาไป)', '70.00', 'ทางพิเศษ'])
    expect(doc.summary).toEqual([{ label: 'รวมเงินทั้งสิ้น :', value: '260.00', tone: 'total' }])
    expect(doc.wordsText).toBe('จำนวนเงิน: -สองร้อยหกสิบบาทถ้วน-')
    expect(doc.certification).toContain('ข้าพเจ้า นายสมชาย ภาคสนาม (ผู้เบิกจ่าย)')
    expect(doc.signatures.map((signature) => signature.role)).toEqual(['ผู้เบิกจ่าย', 'ผู้อนุมัติ'])
    expect(missingGlyphs(docTexts(doc))).toEqual([])
  })

  it('ยอด snapshot ไม่ตรงผลรวมบรรทัด = ไม่พิมพ์ (ข้อมูลเสีย)', () => {
    expect(() => buildSubstituteReceiptDoc({ ...CRT, totalSatang: 99 }, LH)).toThrow(RangeError)
  })

  it('มติ PO U107 — ใบที่ยกเลิก: พิมพ์ป้าย "ยกเลิก" + วันเวลา พ.ศ. + เหตุผล · ใบปกติไม่มีป้าย', () => {
    expect(buildSubstituteReceiptDoc(CRT, LH).cancelled).toBeNull()
    const doc = buildSubstituteReceiptDoc(
      { ...CRT, cancellation: { cancelledAt: new Date('2026-10-06T08:30:00Z'), reason: 'กรอกรายการผิดวัน' } },
      LH,
    )
    expect(doc.cancelled?.title).toBe('ยกเลิก')
    expect(doc.cancelled?.detail).toContain('06/10/2569 15:30')
    expect(doc.cancelled?.detail).toContain('กรอกรายการผิดวัน')
    expect(missingGlyphs(docTexts(doc))).toEqual([])
  })
})

/** ตั้ง `PDF_SAMPLE_DIR=<โฟลเดอร์>` ตอนรัน ⇒ เขียนไฟล์ตัวอย่างไว้ตรวจด้วยตา (ไม่ commit) */
function save(name: string, pdf: Buffer): void {
  const dir = process.env.PDF_SAMPLE_DIR
  if (dir === undefined || dir === '') return
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${name}.pdf`), pdf)
}

describe('เรนเดอร์ PDF จริง 3 ชนิด', () => {
  it('ใบเบิกเงินทดรอง', async () => {
    const pdf = await renderAdvanceRequestPdf(buildAdvanceRequestDoc(ADVANCE, LH), LH)
    save('06-advance-request', pdf)
    const text = extractPdfText(pdf).replace(/\n/g, '')
    expect(text).toContain('ใบเบิกเงินทดรอง')
    expect(text).toContain('ADV-2569-0012')
    expect(text).toContain('สามพันบาทถ้วน')
  }, 30_000)

  it('ใบรับคืนเงินทดรอง (รวมป้ายยกเลิก)', async () => {
    const doc = buildAdvanceReturnDoc({ ...RETURN, reversedAt: new Date('2026-11-02T03:00:00Z') }, LH)
    const pdf = await renderAdvanceReturnPdf(doc, LH)
    save('07-advance-return-cancelled', pdf)
    save('07b-advance-return', await renderAdvanceReturnPdf(buildAdvanceReturnDoc(RETURN, LH), LH))
    const text = extractPdfText(pdf).replace(/\n/g, '')
    expect(text).toContain('ใบรับคืนเงินทดรอง')
    expect(text).toContain('RAV-2569-0004')
    expect(text).toContain('ยกเลิก')
  }, 30_000)

  it('ใบรับรองแทนใบเสร็จรับเงิน', async () => {
    const pdf = await renderSubstituteReceiptPdf(buildSubstituteReceiptDoc(CRT, LH), LH)
    save('08-substitute-receipt', pdf)
    const text = extractPdfText(pdf).replace(/\n/g, '')
    expect(text).toContain('ใบรับรองแทนใบเสร็จรับเงิน')
    expect(text).toContain('CRT-2569-0009')
    expect(text).toContain('สองร้อยหกสิบบาทถ้วน')
  }, 30_000)
})
