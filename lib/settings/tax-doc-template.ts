import type { TemplateDocumentType } from '@/lib/generated/prisma/enums'
import type { DocumentSampleType } from '@/lib/documents/samples/catalog'
import type { LetterheadLogo } from '@/lib/organization/profile'

/**
 * **เทมเพลตเอกสาร** (`13` §6.13 · มติ PO 06/10/2569 U122) — **pure ล้วน ใช้ร่วม FE/BE/PDF**
 *
 * หลักของมติ: ค่าที่**ใช้ร่วมทุกเอกสาร** (โลโก้ · ข้อมูลบริษัท · รูปลายเซ็นผู้มีอำนาจ) อยู่ที่หน้า "ข้อมูลองค์กร"
 * ค่าที่**ต่างกันตามชนิดเอกสาร**อยู่ที่นี่ — ข้อความท้ายเอกสาร + เปิด/ปิดพิมพ์รูปลายเซ็น
 * แบบเอกสารเป็น A4 ภาษาไทยตายตัวตามแบบที่ผู้ใช้อนุมัติ (ไม่มีค่าตั้งขนาดกระดาษ/ภาษา) · 50 ทวิ ใช้แบบทางการ ไม่มีค่าตั้ง
 *
 * ค่าที่ใช้จริง **snapshot ลงเอกสารตอนออก** (`document_template_snapshot`) — แก้ค่าตั้งภายหลังเอกสารเดิมไม่เปลี่ยน
 * · เอกสารก่อน U122 (ไม่มี snapshot) ไม่พิมพ์ข้อความท้าย/ลายเซ็น (ไม่ดึงค่าปัจจุบัน — แนวเดียวกับ U110)
 *
 * ฟิลด์บังคับตามกฎหมาย (`28` §6.2–6.3) **ปิดหรือซ่อนไม่ได้** — ไม่มีค่าตั้งใดในที่นี่ที่ทำให้ฟิลด์เหล่านั้นหายไปจาก PDF
 * **1 record ต่อ (organization, document_type)** ⇒ endpoint เป็น `GET`/`PATCH` (upsert) ไม่มี POST/DELETE
 */

export interface TaxDocTemplateValues {
  footerNote: string | null
  printSignature: boolean
}

export const TEMPLATE_DOCUMENT_TYPES: readonly TemplateDocumentType[] = ['billing_invoice', 'tax_invoice', 'handover_note']

export const TEMPLATE_DOCUMENT_TYPE_LABEL: Readonly<Record<TemplateDocumentType, string>> = {
  billing_invoice: 'ใบแจ้งหนี้ / ใบวางบิล',
  tax_invoice: 'ใบเสร็จรับเงิน / ใบกำกับภาษี',
  handover_note: 'ใบส่งมอบทรัพย์',
}

/** ช่องลายเซ็นที่พิมพ์รูปลายเซ็นผู้มีอำนาจ (ลำดับในแถวผู้เซ็นของเอกสารแต่ละชนิด — ฝั่งบริษัทเรา) */
export const TEMPLATE_SIGNATURE_SLOT: Readonly<Record<TemplateDocumentType, number>> = {
  /** "ผู้วางบิล / ผู้ให้บริการ" */
  billing_invoice: 0,
  /** "ผู้มีอำนาจลงนาม" (ช่องแรก = ผู้รับเงิน) */
  tax_invoice: 1,
  /** "ผู้ส่งมอบ" */
  handover_note: 0,
}

/** ชื่อช่องลายเซ็นที่รูปจะไปอยู่ — แสดงในหน้าตั้งค่า */
export const TEMPLATE_SIGNATURE_SLOT_LABEL: Readonly<Record<TemplateDocumentType, string>> = {
  billing_invoice: 'ผู้วางบิล / ผู้ให้บริการ',
  tax_invoice: 'ผู้มีอำนาจลงนาม',
  handover_note: 'ผู้ส่งมอบ',
}

/** ตัวอย่าง PDF ของแต่ละชนิด (ระบบตัวอย่างเอกสารที่มีอยู่) */
export const TEMPLATE_DOCUMENT_SAMPLE: Readonly<Record<TemplateDocumentType, DocumentSampleType>> = {
  billing_invoice: 'billing-invoice',
  tax_invoice: 'receipt-tax-invoice',
  handover_note: 'handover-note',
}

/** ค่าเริ่มต้นเมื่อยังไม่เคยตั้งค่า — ตรงกับ `@default` ใน `schema.prisma` */
export const DEFAULT_TAX_DOC_TEMPLATE: TaxDocTemplateValues = {
  footerNote: null,
  printSignature: false,
}

export const MAX_FOOTER_NOTE_LENGTH = 500

/**
 * ฟิลด์ที่กฎหมายบังคับให้มีบนเอกสาร — ส่งออกให้ FE แสดงเป็นรายการ "ปิดไม่ได้" (`13` §6.13)
 * ไม่ใช่ค่าตั้งค่า: อยู่ที่นี่เพื่อให้หน้าจอกับตัว render PDF อ้างรายการชุดเดียวกัน
 */
export const LEGALLY_REQUIRED_DOCUMENT_FIELDS: readonly string[] = [
  'ชื่อ/ที่อยู่/เลขประจำตัวผู้เสียภาษีของผู้ขาย',
  'ชื่อ/ที่อยู่/เลขประจำตัวผู้เสียภาษีของผู้ซื้อ',
  'เลขที่เอกสาร',
  'วันที่ออกเอกสาร',
  'รายการสินค้า/บริการ',
  'ยอดเงิน',
  'ภาษีมูลค่าเพิ่ม / ภาษีหัก ณ ที่จ่าย แยกบรรทัดชัดเจน',
]

const trimOrNull = (value: string | null): string | null => {
  const trimmed = value?.trim() ?? ''
  return trimmed === '' ? null : trimmed
}

export function normalizeTaxDocTemplateValues(input: TaxDocTemplateValues): TaxDocTemplateValues {
  return { footerNote: trimOrNull(input.footerNote), printSignature: input.printSignature }
}

/** payload ที่ลง audit — ชื่อคอลัมน์ snake_case ตามตารางจริง (`90` §13 — เอกสารภาษี = ต้องมี reason) */
export function toTaxDocTemplateAuditPayload(
  documentType: TemplateDocumentType,
  values: TaxDocTemplateValues,
): Record<string, unknown> {
  return {
    document_type: documentType,
    footer_note: values.footerNote,
    print_signature: values.printSignature,
  }
}

// ── snapshot ลงเอกสารตอนออก (มติ PO U122 — แนว U110/U111) ─────────────────────

/** ค่าเทมเพลตที่เอกสารฉบับหนึ่งใช้ — `signaturePath` = `null` เมื่อปิดสวิตช์หรือยังไม่มีรูปลายเซ็น */
export interface DocumentTemplateSnapshot {
  footerNote: string | null
  signaturePath: string | null
  /** SHA-256 ของไฟล์ลายเซ็น ณ ตอนออก — พิมพ์ซ้ำแล้วไฟล์ไม่ตรง hash = เว้นช่องเซ็นมือ */
  signatureSha256: string | null
  /**
   * ชื่อ/ตำแหน่งผู้มีอำนาจลงนามขององค์กร ณ ตอนออก (มติ PO U151) — พิมพ์ใต้ช่องลายเซ็นฝั่งบริษัท
   * **ไม่ขึ้นกับสวิตช์รูปลายเซ็น** · `null` = ไม่ได้กรอก/snapshot ก่อน U151 ⇒ เว้นจุดให้เขียนเอง
   */
  signerName: string | null
  signerTitle: string | null
  /**
   * ชื่อผู้ลงนามฝั่งคู่ค้า (มติ PO U151) — ใช้กับใบส่งมอบเท่านั้น: ผู้ลงนามของบริษัทไฟแนนซ์ ณ ตอนยืนยันล็อต
   * พิมพ์ช่อง "ผู้รับมอบ" · เอกสารชนิดอื่น = `null`
   */
  counterpartySignerName: string | null
}

/** ผู้มีอำนาจลงนาม + รูปลายเซ็นขององค์กร — คอลัมน์ที่ snapshot ต้องอ่าน */
export interface DocumentSignerSource {
  signaturePath: string | null
  signatureSha256: string | null
  authorizedSignerName: string | null
  authorizedSignerTitle: string | null
}

/** ค่าตั้งปัจจุบัน + รูปลายเซ็น/ผู้ลงนามขององค์กร → ชุดที่ snapshot ลงเอกสาร (ใช้ตอน**ออก**เอกสารเท่านั้น) */
export function documentTemplateSnapshotOf(
  template: TaxDocTemplateValues | null,
  organization: DocumentSignerSource,
  counterpartySignerName: string | null = null,
): DocumentTemplateSnapshot {
  const values = template ?? DEFAULT_TAX_DOC_TEMPLATE
  const withSignature = values.printSignature && organization.signaturePath !== null
  return {
    footerNote: trimOrNull(values.footerNote),
    signaturePath: withSignature ? organization.signaturePath : null,
    signatureSha256: withSignature ? organization.signatureSha256 : null,
    signerName: trimOrNull(organization.authorizedSignerName),
    signerTitle: trimOrNull(organization.authorizedSignerTitle),
    counterpartySignerName: trimOrNull(counterpartySignerName),
  }
}

/** snapshot → ค่า JSONB (คีย์ snake_case ตามธรรมเนียม DB) */
export function documentTemplateSnapshotJson(snapshot: DocumentTemplateSnapshot): {
  footer_note: string | null
  signature_path: string | null
  signature_sha256: string | null
  signer_name: string | null
  signer_title: string | null
  counterparty_signer_name: string | null
} {
  return {
    footer_note: snapshot.footerNote,
    signature_path: snapshot.signaturePath,
    signature_sha256: snapshot.signatureSha256,
    signer_name: snapshot.signerName,
    signer_title: snapshot.signerTitle,
    counterparty_signer_name: snapshot.counterpartySignerName,
  }
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/**
 * อ่าน JSONB กลับ — `null` = ไม่มี snapshot (เอกสารก่อน U122) · ค่าที่รูปไม่ตรงถือเป็นค่าว่างของช่องนั้น
 * · snapshot ก่อน U151 ไม่มีคีย์ผู้ลงนาม ⇒ `null` (ไม่พิมพ์ชื่อ — ห้ามดึงค่าปัจจุบัน)
 */
export function parseDocumentTemplateSnapshot(value: unknown): DocumentTemplateSnapshot | null {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const signaturePath = stringOrNull(record['signature_path'])
  const sha = record['signature_sha256']
  return {
    footerNote: stringOrNull(record['footer_note']),
    signaturePath,
    signatureSha256: signaturePath !== null && typeof sha === 'string' && /^[0-9a-f]{64}$/.test(sha) ? sha : null,
    signerName: stringOrNull(record['signer_name']),
    signerTitle: stringOrNull(record['signer_title']),
    counterpartySignerName: stringOrNull(record['counterparty_signer_name']),
  }
}

// ── ค่าที่ตัวพิมพ์ PDF ใช้ ─────────────────────────────────────────────────

/** ข้อความท้าย + รูปลายเซ็นที่โหลดแล้ว (ฝั่ง server) — component PDF แค่พิมพ์ */
export interface DocTemplateRender {
  footerNote: string | null
  /** รูปลายเซ็นที่ฝังลง PDF — `null` = เว้นช่องเซ็นมือ (ปิดสวิตช์/ไม่มีรูป/โหลดไม่ได้/ไฟล์ไม่ตรง hash) */
  signature: LetterheadLogo | null
  /** ลำดับช่องลายเซ็นที่พิมพ์รูป ({@link TEMPLATE_SIGNATURE_SLOT}) */
  signatureSlot: number
  /** ผู้มีอำนาจลงนาม (มติ PO U151) — พิมพ์ที่ช่อง `signatureSlot` · `null` = เว้นจุดให้เขียนเอง */
  signerName: string | null
  signerTitle: string | null
  /** ผู้ลงนามฝั่งคู่ค้า (ใบส่งมอบ: ผู้รับมอบ) ที่ช่อง {@link TEMPLATE_COUNTERPARTY_SLOT} */
  counterpartySignerName: string | null
}

/** ไม่พิมพ์อะไรเพิ่ม — เอกสารก่อน U122 / ตัวพิมพ์ที่ไม่ได้ส่งเทมเพลตมา */
export const NO_DOC_TEMPLATE: DocTemplateRender = {
  footerNote: null,
  signature: null,
  signatureSlot: 0,
  signerName: null,
  signerTitle: null,
  counterpartySignerName: null,
}

/** ช่องลายเซ็นฝั่งคู่ค้าที่พิมพ์ชื่อผู้ลงนามของบริษัทไฟแนนซ์ (มติ PO U151) — มีเฉพาะใบส่งมอบ ("ผู้รับมอบ") */
export const TEMPLATE_COUNTERPARTY_SLOT: Readonly<Partial<Record<TemplateDocumentType, number>>> = {
  handover_note: 1,
}

/** ชื่อผู้ลงนามเรียงตามช่อง — ช่องที่ไม่ทราบชื่อ = `null` (เว้นจุด) */
export function signerNamesOf(
  template: DocTemplateRender,
  slotCount: number,
  counterpartySlot: number | null = null,
): Array<string | null> {
  return Array.from({ length: slotCount }, (_, index) => {
    if (index === template.signatureSlot) return template.signerName
    if (counterpartySlot !== null && index === counterpartySlot) return template.counterpartySignerName
    return null
  })
}

/** ตำแหน่งผู้ลงนามเรียงตามช่อง — มีเฉพาะช่องของบริษัทเรา */
export function signerTitlesOf(template: DocTemplateRender, slotCount: number): Array<string | null> {
  return Array.from({ length: slotCount }, (_, index) => (index === template.signatureSlot ? template.signerTitle : null))
}

/** รูปลายเซ็นเรียงตามช่องผู้เซ็น — ช่องอื่นเป็น `null` (เซ็นมือ) */
export function signatureImagesOf(
  template: DocTemplateRender,
  slotCount: number,
): Array<LetterheadLogo | null> {
  return Array.from({ length: slotCount }, (_, index) =>
    index === template.signatureSlot ? template.signature : null,
  )
}
