import type { TaxDocLanguage, TaxDocPaperSize, TaxDocumentType } from '@/lib/generated/prisma/enums'

/**
 * รูปแบบเอกสารภาษีทางการ (`13` §6.13) — **pure ล้วน ใช้ร่วม FE/BE**
 *
 * ปรับได้แค่ **ภาพลักษณ์** (โลโก้ / footer / ลายเซ็น / ขนาดกระดาษ / ภาษา) —
 * ฟิลด์บังคับตามกฎหมาย (`13` §6.13 ท้ายหัวข้อ · `28` §6.2–6.3) **ปิดหรือซ่อนไม่ได้**
 * จึงไม่มีค่าตั้งใดในที่นี่ที่ทำให้ฟิลด์เหล่านั้นหายไปจาก PDF ได้เลย (Phase 4.3/4.5 เป็นตัว render)
 *
 * **1 record ต่อ (organization, document_type)** — UNIQUE ที่ `02` §5 ⇒ endpoint เป็น `GET`/`PATCH`
 * (upsert) ไม่มี POST/DELETE
 */

export interface TaxDocTemplateValues {
  logoUrl: string | null
  footerNote: string | null
  signatureImageUrl: string | null
  paperSize: TaxDocPaperSize
  language: TaxDocLanguage
}

export const TAX_DOCUMENT_TYPES: readonly TaxDocumentType[] = ['tax_invoice', 'wht_certificate']

export const TAX_DOCUMENT_TYPE_LABEL: Readonly<Record<TaxDocumentType, string>> = {
  tax_invoice: 'ใบกำกับภาษี (ไฟล์ 31)',
  wht_certificate: 'หนังสือรับรองหัก ณ ที่จ่าย 50 ทวิ (ไฟล์ 33)',
}

/** ค่าเริ่มต้นเมื่อยังไม่เคยตั้งค่า — ตรงกับ `@default` ใน `schema.prisma` */
export const DEFAULT_TAX_DOC_TEMPLATE: TaxDocTemplateValues = {
  logoUrl: null,
  footerNote: null,
  signatureImageUrl: null,
  paperSize: 'A4',
  language: 'th',
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
  return {
    logoUrl: trimOrNull(input.logoUrl),
    footerNote: trimOrNull(input.footerNote),
    signatureImageUrl: trimOrNull(input.signatureImageUrl),
    paperSize: input.paperSize,
    language: input.language,
  }
}

/** payload ที่ลง audit — ชื่อคอลัมน์ snake_case ตามตารางจริง (`90` §13 — ภาษี = ต้องมี reason) */
export function toTaxDocTemplateAuditPayload(
  documentType: TaxDocumentType,
  values: TaxDocTemplateValues,
): Record<string, unknown> {
  return {
    document_type: documentType,
    logo_url: values.logoUrl,
    footer_note: values.footerNote,
    signature_image_url: values.signatureImageUrl,
    paper_size: values.paperSize,
    language: values.language,
  }
}
