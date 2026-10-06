import { describe, expect, it } from 'vitest'
import { extractPdfText } from '@/components/pdf/extract-text'
import { renderHandoverNote } from '@/components/pdf/handover-note'
import { testLetterhead, testLetterheadWithLogo } from '@/tests/helpers/letterhead'
import { attachmentHeader } from '@/lib/format/attachment'
import {
  buildHandoverDoc,
  colorCapacityCheckText,
  documentColorCapacityMismatch,
  documentDeviceText,
  documentIdentifier,
  documentIdentifierActual,
  handoverFileName,
  type HandoverParty,
} from '@/lib/warehouse/handover-doc'
import {
  buildHandoverWorkbook,
  HANDOVER_SHEET_HEADERS,
  handoverSheetHeaderBlock,
  handoverSheetRows,
} from '@/lib/warehouse/handover-excel'
import type { AssetListItemDto, LotDetailDto } from '@/lib/warehouse/types'

/** `44` §6.4 — ใบส่งมอบ + Export Excel ใช้แบบข้อมูลชุดเดียวกัน (วันที่ พ.ศ. เสมอ · Rule 01) */

const ISSUER: HandoverParty = {
  name: 'บริษัท ใจดี โมบาย จำกัด',
  address: '123 ถ.พระราม 1 กรุงเทพมหานคร',
  taxId: '0105512345678',
  phone: '021234567',
}
const RECIPIENT: HandoverParty = {
  name: 'บริษัท เอสเอฟ ลีสซิ่ง จำกัด',
  address: '99 ถ.สุขุมวิท กรุงเทพมหานคร',
  taxId: '0105598765432',
  phone: null,
}

function asset(overrides: Partial<AssetListItemDto> = {}): AssetListItemDto {
  return {
    id: 'asset-1',
    caseId: 'case-1',
    caseRef: 'SF-2026-00832',
    debtorName: 'สมชาย ใจดี',
    deviceDesc: 'iPhone 15 สีดำ',
    deviceCapacity: null,
    deviceColor: null,
    colorCapacityMatched: null,
    colorCapacityNote: null,
    imeiContract: '355000000000001',
    imeiActual: '355000000000001',
    serialContract: null,
    serialActual: null,
    assetStatus: 'handover_pending',
    condition: 'normal',
    conditionNote: null,
    companyId: 'company-1',
    companyName: RECIPIENT.name,
    teamId: null,
    teamName: null,
    agentId: null,
    agentName: null,
    closedAt: '2026-07-01T03:00:00.000Z',
    receivedAt: '2026-07-02T03:00:00.000Z',
    rejectReason: null,
    rejectedAt: null,
    lotId: 'lot-1',
    lotNumber: 'LOT-2569-001',
    photoCount: 7,
    ...overrides,
  }
}

function lot(overrides: Partial<LotDetailDto> = {}): LotDetailDto {
  return {
    id: 'lot-1',
    lotNumber: 'LOT-2569-001',
    docRef: 'DLV-2569-001',
    type: 'finance_pickup',
    status: 'pending_attach',
    companyId: 'company-1',
    companyName: RECIPIENT.name,
    scheduledAt: '2026-07-10T03:00:00.000Z',
    deliveredAt: null,
    confirmedAt: null,
    assetCount: 1,
    tab: 'pending_handover',
    contactPerson: 'คุณวิภา ฝ่ายติดตามทรัพย์',
    deliveryAddr: null,
    trackingNo: null,
    signedDocUrl: null,
    deliveryProofUrl: null,
    note: null,
    confirmedByName: null,
    createdAt: '2026-07-05T03:00:00.000Z',
    assets: [asset()],
    ...overrides,
  }
}

describe('documentIdentifier', () => {
  it('IMEI มาก่อน serial', () => {
    expect(documentIdentifier({ imeiContract: '355000000000001', serialContract: 'SN-1' })).toBe('355000000000001')
  })

  it('เครื่องไม่มี IMEI (A6) ใช้ serial', () => {
    expect(documentIdentifier({ imeiContract: null, serialContract: 'SN-TAB-001' })).toBe('SN-TAB-001')
  })

  it('ไม่มีทั้งคู่ = ขีดกลาง (ไม่ปล่อยช่องว่างในเอกสาร)', () => {
    expect(documentIdentifier({ imeiContract: null, serialContract: null })).toBe('—')
  })
})

describe('documentIdentifierActual', () => {
  const base = { imeiContract: '355000000000001', serialContract: null, serialActual: null }

  it('ตรงกับสัญญา = ไม่ต้องแสดงซ้ำ', () => {
    expect(documentIdentifierActual({ ...base, imeiActual: '355000000000001' })).toBeNull()
  })

  it('ไม่ตรง = แสดงค่าที่ตรวจจริงกำกับไว้ (ผู้รับต้องเห็นส่วนต่าง)', () => {
    expect(documentIdentifierActual({ ...base, imeiActual: '355000000000999' })).toBe('355000000000999')
  })

  it('เครื่อง serial อ่านฝั่ง serial ไม่ใช่ IMEI', () => {
    expect(
      documentIdentifierActual({
        imeiContract: null,
        imeiActual: null,
        serialContract: 'SN-1',
        serialActual: 'SN-2',
      }),
    ).toBe('SN-2')
  })
})

describe('buildHandoverDoc', () => {
  it('วันที่บนเอกสารเป็น พ.ศ. เสมอ', () => {
    const doc = buildHandoverDoc(lot(), ISSUER, RECIPIENT)
    expect(doc.issuedAtLabel).toBe('10/07/2569')
    expect(doc.scheduledAtLabel).toBe('10/07/2569 10:00')
    expect(doc.scheduledAtCaption).toBe('วันนัดรับ')
  })

  it('วันที่หัวเอกสาร: วันส่งมอบจริง → วันนัด → วันที่สร้างล็อต', () => {
    expect(buildHandoverDoc(lot({ deliveredAt: '2026-07-12T04:00:00.000Z' }), ISSUER, RECIPIENT).issuedAtLabel).toBe(
      '12/07/2569',
    )
    expect(buildHandoverDoc(lot({ scheduledAt: null }), ISSUER, RECIPIENT).issuedAtLabel).toBe('05/07/2569')
  })

  it('ช่องอุปกรณ์พ่วงความจุ/สีตามสัญญา (มติ PO U166) — เครื่องก่อนมติไม่มีค่า = ชื่อเครื่องอย่างเดียว', () => {
    expect(documentDeviceText({ deviceDesc: 'iPhone 15', deviceCapacity: '128GB', deviceColor: 'ดำ' })).toBe(
      'iPhone 15 · 128GB · ดำ',
    )
    expect(documentDeviceText({ deviceDesc: 'iPhone 15', deviceCapacity: null, deviceColor: 'ขาว' })).toBe('iPhone 15 · ขาว')
    expect(documentDeviceText({ deviceDesc: 'iPhone 15', deviceCapacity: null, deviceColor: null })).toBe('iPhone 15')
    const doc = buildHandoverDoc(
      lot({ assets: [asset({ deviceDesc: 'iPhone 15', deviceCapacity: '256GB', deviceColor: 'ไม่ระบุในสัญญา' })] }),
      ISSUER,
      RECIPIENT,
    )
    expect(doc.rows[0]?.deviceDesc).toBe('iPhone 15 · 256GB · ไม่ระบุในสัญญา')
  })

  it('ลำดับรายการเริ่มที่ 1 และนับจำนวนเครื่องตามจริง', () => {
    const doc = buildHandoverDoc(lot({ assets: [asset(), asset({ id: 'asset-2', caseRef: 'SF-2026-00833' })] }), ISSUER, RECIPIENT)
    expect(doc.rows.map((row) => row.no)).toEqual([1, 2])
    expect(doc.totalCount).toBe(2)
  })

  it('ช่องว่างกลายเป็นขีดกลาง ไม่ใช่ค่าว่างในเอกสาร', () => {
    const doc = buildHandoverDoc(lot({ note: null, trackingNo: null, deliveryAddr: null }), ISSUER, RECIPIENT)
    expect(doc.note).toBe('—')
    expect(doc.trackingNo).toBe('—')
    expect(doc.recipient.deliveryAddr).toBe('—')
    expect(doc.recipient.contactPerson).toBe('คุณวิภา ฝ่ายติดตามทรัพย์')
  })

  it('สภาพเครื่องเป็นภาษาไทย และ IMEI ที่ไม่ตรงถูกกำกับไว้', () => {
    const doc = buildHandoverDoc(
      lot({ assets: [asset({ condition: 'damaged', conditionNote: 'จอแตก', imeiActual: '355000000000999' })] }),
      ISSUER,
      RECIPIENT,
    )
    expect(doc.rows[0]).toMatchObject({
      condition: 'ชำรุด',
      conditionNote: 'จอแตก',
      identifier: '355000000000001',
      identifierActual: '355000000000999',
    })
  })
})

describe('ชื่อไฟล์ดาวน์โหลด', () => {
  it('ตั้งจากเลขล็อต', () => {
    expect(handoverFileName({ lotNumber: 'LOT-2569-001' }, 'pdf')).toBe('LOT-2569-001.pdf')
    expect(handoverFileName({ lotNumber: 'LOT-2569-001' }, 'xlsx')).toBe('LOT-2569-001.xlsx')
  })

  it('header รองรับชื่อไฟล์ภาษาไทยด้วย filename* (RFC 5987)', () => {
    const header = attachmentHeader('ใบส่งมอบ.pdf')
    expect(header).toContain("filename*=UTF-8''")
    expect(header).toMatch(/filename="[\w.\-]+"/)
  })
})

describe('Export Excel', () => {
  it('หัวคอลัมน์เรียงเหมือนตารางในใบส่งมอบ', () => {
    expect(HANDOVER_SHEET_HEADERS).toHaveLength(9)
    expect(HANDOVER_SHEET_HEADERS[1]).toBe('เลขสัญญา')
  })

  it('แถวข้อมูลตรงกับรายการเครื่องในล็อต', () => {
    const doc = buildHandoverDoc(lot(), ISSUER, RECIPIENT)
    expect(handoverSheetRows(doc)).toEqual([
      ['1', 'SF-2026-00832', 'สมชาย ใจดี', 'iPhone 15 สีดำ', '—', '355000000000001', '—', 'ปกติ', '—'],
    ])
  })

  it('ส่วนหัวชีตบอกเลขที่/ล็อต/คู่สัญญา (เปิดไฟล์แล้วรู้ทันทีว่าล็อตไหน)', () => {
    const header = handoverSheetHeaderBlock(buildHandoverDoc(lot(), ISSUER, RECIPIENT))
    expect(header[1]).toEqual(['เลขที่ใบส่งมอบ', 'DLV-2569-001', 'เลขล็อต', 'LOT-2569-001'])
    expect(header[2]?.[1]).toBe(ISSUER.name)
    expect(header[4]).toEqual(['วันนัดรับ', '10/07/2569 10:00'])
  })

  it('เขียนไฟล์ .xlsx ได้จริง (ZIP signature ของ OOXML)', () => {
    const buffer = buildHandoverWorkbook(buildHandoverDoc(lot(), ISSUER, RECIPIENT))
    expect(buffer.length).toBeGreaterThan(0)
    expect(buffer.subarray(0, 2).toString('latin1')).toBe('PK')
  })
})

describe('PDF ใบส่งมอบ (UAT BUG-079 · BUG-080)', () => {
  async function pdfText(doc: ReturnType<typeof buildHandoverDoc>): Promise<string> {
    const pdf = await renderHandoverNote(doc, testLetterhead({ nameTh: ISSUER.name }))
    return extractPdfText(new Uint8Array(pdf)).replace(/\n/g, '')
  }

  it('ชื่อบริษัทตัวหนาพิมพ์ครบถึงตัวท้าย ("…จำกัด" ไม่ขาด "ด")', async () => {
    const text = await pdfText(buildHandoverDoc(lot(), ISSUER, RECIPIENT))
    expect(text).toContain('บริษัท เอสเอฟ ลีสซิ่ง จำกัด')
    expect(text).toContain('บริษัท ใจดี โมบาย จำกัด')
  })

  it('แสดงวันนัดรับ / กำหนดจัดส่งตามรูปแบบการส่งมอบ (พ.ศ. + เวลา)', async () => {
    expect(await pdfText(buildHandoverDoc(lot(), ISSUER, RECIPIENT))).toContain('วันนัดรับ: 10/07/2569 10:00')
    expect(await pdfText(buildHandoverDoc(lot({ type: 'we_deliver' }), ISSUER, RECIPIENT))).toContain(
      'กำหนดจัดส่ง: 10/07/2569 10:00',
    )
  })

  it('มติ PO U99 — หัวเอกสารกลาง: มีโลโก้ฝังรูป · ไม่มีโลโก้ไม่มีรูป · พิมพ์ข้อมูลติดต่อ/เลขผู้เสียภาษีขององค์กร', async () => {
    const doc = buildHandoverDoc(lot(), ISSUER, RECIPIENT)
    const withLogo = await renderHandoverNote(doc, testLetterheadWithLogo())
    const withoutLogo = await renderHandoverNote(doc, testLetterhead())
    expect(withLogo.toString('latin1')).toContain('/Subtype /Image')
    expect(withoutLogo.toString('latin1')).not.toContain('/Subtype /Image')
    const text = extractPdfText(new Uint8Array(withLogo)).replace(/\n/g, '')
    expect(text).toContain('Jaidee Mobile Co., Ltd.')
    expect(text).toContain('เลขประจำตัวผู้เสียภาษี 0105560123456 · สำนักงานใหญ่')
  })
})

describe('มติ O77 — ผลตรวจสี/ความจุ ตรง/ไม่ตรง ในรายละเอียดเครื่องและใบส่งมอบ', () => {
  it('ข้อความในรายละเอียดเครื่อง', () => {
    expect(colorCapacityCheckText({ colorCapacityMatched: null, colorCapacityNote: null })).toBe('—')
    expect(colorCapacityCheckText({ colorCapacityMatched: true, colorCapacityNote: null })).toBe('ตรง')
    expect(colorCapacityCheckText({ colorCapacityMatched: false, colorCapacityNote: 'สีขาว 64GB' })).toBe('ไม่ตรง — สีขาว 64GB')
    // แถวก่อนมติ O77 (ช่องติ๊กที่ไม่ได้ติ๊ก)
    expect(colorCapacityCheckText({ colorCapacityMatched: false, colorCapacityNote: null })).toBe('ไม่ได้ยืนยัน')
  })

  it('ใบส่งมอบกำกับเฉพาะ "ไม่ตรง" ที่มีสิ่งที่พบ', () => {
    expect(documentColorCapacityMismatch({ colorCapacityMatched: true, colorCapacityNote: null })).toBeNull()
    expect(documentColorCapacityMismatch({ colorCapacityMatched: false, colorCapacityNote: null })).toBeNull()
    expect(documentColorCapacityMismatch({ colorCapacityMatched: false, colorCapacityNote: 'สีขาว' })).toBe(
      'สี/ความจุไม่ตรงสัญญา: สีขาว',
    )
  })

  it('PDF + Excel พิมพ์ส่วนต่างสี/ความจุ', async () => {
    const base = lot()
    const mismatchLot = {
      ...base,
      assets: base.assets.map((each) => ({
        ...each,
        deviceCapacity: '128GB',
        deviceColor: 'ดำ',
        colorCapacityMatched: false,
        colorCapacityNote: 'สีขาว 64GB',
      })),
    }
    const doc = buildHandoverDoc(mismatchLot, ISSUER, RECIPIENT)
    expect(doc.rows[0]?.colorCapacityMismatch).toBe('สี/ความจุไม่ตรงสัญญา: สีขาว 64GB')
    expect(handoverSheetRows(doc)[0]?.[4]).toBe('สี/ความจุไม่ตรงสัญญา: สีขาว 64GB')
    const pdf = await renderHandoverNote(doc, testLetterhead({ nameTh: ISSUER.name }))
    const text = extractPdfText(new Uint8Array(pdf)).replace(/\s/g, '')
    expect(text).toContain('สีขาว64GB')
  })
})
