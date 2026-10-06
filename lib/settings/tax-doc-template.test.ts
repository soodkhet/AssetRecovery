import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TAX_DOC_TEMPLATE,
  LEGALLY_REQUIRED_DOCUMENT_FIELDS,
  NO_DOC_TEMPLATE,
  TEMPLATE_DOCUMENT_SAMPLE,
  TEMPLATE_DOCUMENT_TYPES,
  TEMPLATE_DOCUMENT_TYPE_LABEL,
  TEMPLATE_COUNTERPARTY_SLOT,
  TEMPLATE_SIGNATURE_SLOT,
  signerNamesOf,
  signerTitlesOf,
  documentTemplateSnapshotJson,
  documentTemplateSnapshotOf,
  normalizeTaxDocTemplateValues,
  parseDocumentTemplateSnapshot,
  signatureImagesOf,
  toTaxDocTemplateAuditPayload,
} from '@/lib/settings/tax-doc-template'
import { DOCUMENT_SAMPLE_TYPES } from '@/lib/documents/samples/catalog'

/** `13` §6.13 · มติ PO U122 — ต่อชนิด: ข้อความท้าย + เปิด/ปิดพิมพ์ลายเซ็น · snapshot ลงเอกสารตอนออก */

const SHA = 'a'.repeat(64)
const NO_SIGNER = { authorizedSignerName: null, authorizedSignerTitle: null }
const SIGNATURE = { signaturePath: 'organization/org/signature/x.png', signatureSha256: SHA, ...NO_SIGNER }
const NO_SIGNATURE = { signaturePath: null, signatureSha256: null, ...NO_SIGNER }
const NO_SIGNER_SNAPSHOT = { signerName: null, signerTitle: null, counterpartySignerName: null }

describe('ค่าตั้งต้น', () => {
  it('ค่าเริ่มต้น: ไม่มีข้อความท้าย + ไม่พิมพ์ลายเซ็น (ตรง @default)', () => {
    expect(DEFAULT_TAX_DOC_TEMPLATE).toEqual({ footerNote: null, printSignature: false })
  })

  it('3 ชนิดเอกสาร (ไม่มี 50 ทวิ) พร้อม label · ช่องลายเซ็น · ตัวอย่าง PDF ที่มีอยู่จริง', () => {
    expect([...TEMPLATE_DOCUMENT_TYPES]).toEqual(['billing_invoice', 'tax_invoice', 'handover_note'])
    for (const type of TEMPLATE_DOCUMENT_TYPES) {
      expect(TEMPLATE_DOCUMENT_TYPE_LABEL[type].length).toBeGreaterThan(0)
      expect(DOCUMENT_SAMPLE_TYPES).toContain(TEMPLATE_DOCUMENT_SAMPLE[type])
    }
    // ใบเสร็จ/ใบกำกับ: ช่องแรก = ผู้รับเงิน · ช่องที่สอง = ผู้มีอำนาจลงนาม
    expect(TEMPLATE_SIGNATURE_SLOT.tax_invoice).toBe(1)
    expect(TEMPLATE_SIGNATURE_SLOT.billing_invoice).toBe(0)
    expect(TEMPLATE_SIGNATURE_SLOT.handover_note).toBe(0)
  })

  it('มีรายการฟิลด์บังคับตามกฎหมายไว้ให้ FE แสดงว่าปิดไม่ได้', () => {
    expect(LEGALLY_REQUIRED_DOCUMENT_FIELDS.length).toBeGreaterThanOrEqual(7)
    expect(LEGALLY_REQUIRED_DOCUMENT_FIELDS.join(' ')).toContain('เลขประจำตัวผู้เสียภาษี')
  })
})

describe('normalizeTaxDocTemplateValues', () => {
  it('ข้อความว่างกลายเป็น null · ตัดช่องว่างหัวท้าย', () => {
    expect(normalizeTaxDocTemplateValues({ footerNote: '   ', printSignature: true })).toEqual({
      footerNote: null,
      printSignature: true,
    })
    expect(normalizeTaxDocTemplateValues({ footerNote: ' ชำระภายใน 30 วัน ', printSignature: false }).footerNote).toBe(
      'ชำระภายใน 30 วัน',
    )
  })
})

describe('toTaxDocTemplateAuditPayload', () => {
  it('ใช้ชื่อคอลัมน์ snake_case + มี document_type กำกับ', () => {
    expect(toTaxDocTemplateAuditPayload('handover_note', { footerNote: 'x', printSignature: true })).toEqual({
      document_type: 'handover_note',
      footer_note: 'x',
      print_signature: true,
    })
  })
})

describe('documentTemplateSnapshotOf — ค่าที่ snapshot ลงเอกสารตอนออก', () => {
  it('เปิดสวิตช์ + มีรูป = เก็บ path + hash ของรูป', () => {
    expect(documentTemplateSnapshotOf({ footerNote: ' ขอบคุณ ', printSignature: true }, SIGNATURE)).toEqual({
      footerNote: 'ขอบคุณ',
      signaturePath: SIGNATURE.signaturePath,
      signatureSha256: SHA,
      ...NO_SIGNER_SNAPSHOT,
    })
  })

  it('ปิดสวิตช์ = ไม่เก็บรูป (เว้นช่องเซ็นมือ) แม้องค์กรมีรูป', () => {
    expect(documentTemplateSnapshotOf({ footerNote: null, printSignature: false }, SIGNATURE)).toEqual({
      footerNote: null,
      signaturePath: null,
      signatureSha256: null,
      ...NO_SIGNER_SNAPSHOT,
    })
  })

  it('เปิดสวิตช์แต่ยังไม่อัปโหลดรูป = ไม่มีรูป', () => {
    expect(documentTemplateSnapshotOf({ footerNote: null, printSignature: true }, NO_SIGNATURE).signaturePath).toBeNull()
  })

  it('ยังไม่เคยตั้งค่า (ไม่มีแถว) = ค่าเริ่มต้น', () => {
    expect(documentTemplateSnapshotOf(null, SIGNATURE)).toEqual({
      footerNote: null,
      signaturePath: null,
      signatureSha256: null,
      ...NO_SIGNER_SNAPSHOT,
    })
  })
})

describe('snapshot JSONB ไป–กลับ', () => {
  it('json → parse ได้ค่าเดิม', () => {
    const snapshot = documentTemplateSnapshotOf({ footerNote: 'ท้าย', printSignature: true }, SIGNATURE)
    expect(parseDocumentTemplateSnapshot(documentTemplateSnapshotJson(snapshot))).toEqual(snapshot)
  })

  it('NULL (เอกสารก่อน U122) = null — ไม่ใช่ค่าว่างที่ดึงค่าปัจจุบัน', () => {
    expect(parseDocumentTemplateSnapshot(null)).toBeNull()
    expect(parseDocumentTemplateSnapshot(undefined)).toBeNull()
    expect(parseDocumentTemplateSnapshot([])).toBeNull()
  })

  it('ค่ารูปไม่ตรง = ช่องนั้นว่าง · hash ไม่ใช่ hex 64 = ไม่ตรวจ hash', () => {
    expect(parseDocumentTemplateSnapshot({ footer_note: 5, signature_path: 'p', signature_sha256: 'zz' })).toEqual({
      footerNote: null,
      signaturePath: 'p',
      signatureSha256: null,
      ...NO_SIGNER_SNAPSHOT,
    })
  })

  it('มติ PO U151: snapshot ก่อน U151 (ไม่มีคีย์ผู้ลงนาม) = ไม่พิมพ์ชื่อ — ไม่ดึงค่าปัจจุบัน', () => {
    const parsed = parseDocumentTemplateSnapshot({ footer_note: 'x', signature_path: null, signature_sha256: null })
    expect(parsed?.signerName).toBeNull()
    expect(parsed?.signerTitle).toBeNull()
    expect(parsed?.counterpartySignerName).toBeNull()
  })
})

describe('มติ PO U151 — ผู้มีอำนาจลงนามใน snapshot', () => {
  const SIGNER = { ...SIGNATURE, authorizedSignerName: ' นายสมชาย ใจดี ', authorizedSignerTitle: 'กรรมการผู้จัดการ' }

  it('เก็บชื่อ/ตำแหน่ง (ตัดช่องว่าง) แม้ปิดสวิตช์รูปลายเซ็น — ชื่อไม่ขึ้นกับรูป', () => {
    const snapshot = documentTemplateSnapshotOf({ footerNote: null, printSignature: false }, SIGNER)
    expect(snapshot.signaturePath).toBeNull()
    expect(snapshot.signerName).toBe('นายสมชาย ใจดี')
    expect(snapshot.signerTitle).toBe('กรรมการผู้จัดการ')
  })

  it('ผู้ลงนามคู่ค้า (ใบส่งมอบ) เก็บแยก · ว่าง = null', () => {
    expect(documentTemplateSnapshotOf(null, SIGNER, 'นางสาวรับมอบ').counterpartySignerName).toBe('นางสาวรับมอบ')
    expect(documentTemplateSnapshotOf(null, SIGNER, '  ').counterpartySignerName).toBeNull()
  })

  it('json → parse ได้ชื่อเดิม (พิมพ์ซ้ำได้ชื่อ ณ ตอนออก)', () => {
    const snapshot = documentTemplateSnapshotOf({ footerNote: null, printSignature: true }, SIGNER, 'ผู้รับ')
    expect(parseDocumentTemplateSnapshot(documentTemplateSnapshotJson(snapshot))).toEqual(snapshot)
  })

  it('signerNamesOf/signerTitlesOf: ชื่อบริษัทที่ช่องลายเซ็นของบริษัท · ชื่อคู่ค้าที่ช่องคู่ค้า · ช่องอื่นเว้นจุด', () => {
    const template = {
      ...NO_DOC_TEMPLATE,
      signatureSlot: TEMPLATE_SIGNATURE_SLOT.handover_note,
      signerName: 'ผู้ส่ง',
      signerTitle: 'ผู้จัดการ',
      counterpartySignerName: 'ผู้รับ',
    }
    expect(signerNamesOf(template, 2, TEMPLATE_COUNTERPARTY_SLOT.handover_note ?? null)).toEqual(['ผู้ส่ง', 'ผู้รับ'])
    expect(signerNamesOf(template, 2)).toEqual(['ผู้ส่ง', null])
    expect(signerTitlesOf(template, 2)).toEqual(['ผู้จัดการ', null])
    expect(signerNamesOf({ ...template, signatureSlot: 1 }, 2)).toEqual([null, 'ผู้ส่ง'])
  })

  it('เอกสารที่ไม่มีเทมเพลต = ไม่มีชื่อทุกช่อง', () => {
    expect(signerNamesOf(NO_DOC_TEMPLATE, 2, 1)).toEqual([null, null])
  })

  it('ใบส่งมอบเท่านั้นที่มีช่องคู่ค้า ("ผู้รับมอบ")', () => {
    expect(TEMPLATE_COUNTERPARTY_SLOT).toEqual({ handover_note: 1 })
  })
})

describe('signatureImagesOf', () => {
  const image = { data: Buffer.from([1]), format: 'png' as const }

  it('ใส่รูปเฉพาะช่องของบริษัท — ช่องอื่นเซ็นมือ', () => {
    expect(signatureImagesOf({ ...NO_DOC_TEMPLATE, signature: image, signatureSlot: 1 }, 2)).toEqual([null, image])
  })

  it('ไม่มีเทมเพลต = ทุกช่องเซ็นมือ', () => {
    expect(signatureImagesOf(NO_DOC_TEMPLATE, 2)).toEqual([null, null])
  })
})
