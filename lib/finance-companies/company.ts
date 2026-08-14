import { FinanceCompanyError } from '@/lib/finance-companies/errors'

/**
 * Logic ล้วนของบริษัทไฟแนนซ์ (ไฟล์ 10) — **ห้าม import อะไรที่แตะ Prisma/DB ในไฟล์นี้**
 * (กับดักใน REUSE_INDEX: ไฟล์ที่ import `lib/prisma` เทสต์ไม่ได้ถ้าไม่มี DB)
 *
 * ขอบเขต: normalize ค่าฟอร์ม · ตรวจรูปแบบ `tax_id` · กติกาของการระงับ/เปิดใช้งาน (§9.3)
 *
 * ⚠️ **ไม่มีสูตรเงินในไฟล์นี้** — ค่าบริการคำนวณจาก snapshot บนเคสตาม `22` §6.5–6.7 (Phase 3.1)
 * และ snapshot เกิดตอนเคส `approved` เท่านั้น (`10` §9.2 — Phase 2.3) ไม่ใช่ที่นี่
 */

export type CompanyStatus = 'active' | 'suspended'
export type InvoiceDeliveryFormat = 'e_tax_invoice' | 'paper_pdf'

/** ค่าที่ผู้ใช้ตั้งได้ต่อบริษัท — ตรงกับคอลัมน์ `finance_companies` (`02` §5) */
export interface FinanceCompanyValues {
  name: string
  shortName: string
  taxId: string
  address: string | null
  phone: string | null
  email: string | null
  contactName: string | null
  contactPhone: string | null
  /**
   * ผู้มีอำนาจลงนาม — `10` §7.1 มี `signer_phone` ด้วย แต่ `02` §5 ไม่มีคอลัมน์นั้น
   * และมติ PO 14/08/2569 อนุมัติเพิ่มเฉพาะ `suspended_reason` + `default_invoice_delivery_format`
   * จึงยังไม่เก็บเบอร์ผู้ลงนาม (บันทึกไว้ที่ `02_OPEN_DECISIONS` — รอเคาะรอบถัดไป)
   */
  signerName: string | null
  /** **บังคับเสมอตอนสร้าง** — ทุกบริษัทต้องผูกเทมเพลตค่าบริการ (`10` §9.1) */
  serviceFeeTemplateId: string
  vatRegistered: boolean
  defaultInvoiceDeliveryFormat: InvoiceDeliveryFormat
  billingDay: number
  paymentDueDays: number
}

/**
 * เลขประจำตัวผู้เสียภาษีนิติบุคคล = **ตัวเลข 13 หลักเท่านั้น** (`10` §7.1 🔶)
 * ไม่ทำ checksum เพราะกรมสรรพากรไม่มี algorithm สาธารณะ — ตรวจแค่รูปแบบตามที่ spec ระบุ
 */
const TAX_ID_PATTERN = /^\d{13}$/

/** ลบ `-` และช่องว่างที่ผู้ใช้พิมพ์คั่นออกก่อนตรวจ/บันทึก (เก็บใน DB เป็นตัวเลขล้วน 13 หลัก) */
export function normalizeTaxId(value: string): string {
  return value.replace(/[\s-]/g, '')
}

export function isValidTaxId(value: string): boolean {
  return TAX_ID_PATTERN.test(normalizeTaxId(value))
}

export function assertValidTaxId(value: string): string {
  const normalized = normalizeTaxId(value)
  if (!TAX_ID_PATTERN.test(normalized)) {
    throw new FinanceCompanyError('INVALID_TAX_ID_FORMAT', { detail: `tax_id=${value}` })
  }
  return normalized
}

/** แสดงผลแบบอ่านง่าย `x-xxxx-xxxxx-xx-x` (มาตรฐานเลขนิติบุคคลไทย) — display เท่านั้น */
export function formatTaxId(value: string): string {
  const normalized = normalizeTaxId(value)
  if (!TAX_ID_PATTERN.test(normalized)) return value
  return [
    normalized.slice(0, 1),
    normalized.slice(1, 5),
    normalized.slice(5, 10),
    normalized.slice(10, 12),
    normalized.slice(12),
  ].join('-')
}

function trimOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

export function normalizeCompanyValues(values: FinanceCompanyValues): FinanceCompanyValues {
  return {
    ...values,
    name: values.name.trim(),
    shortName: values.shortName.trim(),
    taxId: normalizeTaxId(values.taxId),
    address: trimOrNull(values.address),
    phone: trimOrNull(values.phone),
    email: trimOrNull(values.email),
    contactName: trimOrNull(values.contactName),
    contactPhone: trimOrNull(values.contactPhone),
    signerName: trimOrNull(values.signerName),
  }
}

/**
 * เปลี่ยนสถานะบริษัท (`10` §9.3): `active → suspended` ต้องมีเหตุผลเสมอ ·
 * `suspended → active` เปิดกลับได้ตลอด ไม่มีเงื่อนไขพิเศษ และต้องล้างเหตุผลเดิมทิ้ง
 *
 * คืนค่า `suspended_reason` ที่ควรบันทึกลง record — ไม่ใช่แค่ throw/ผ่าน
 */
export function resolveSuspendedReason(
  nextStatus: CompanyStatus,
  reason: string | null | undefined,
): string | null {
  if (nextStatus === 'active') return null
  const trimmed = trimOrNull(reason ?? null)
  if (trimmed === null) throw new FinanceCompanyError('SUSPEND_REASON_REQUIRED')
  return trimmed
}

/** ค่าที่บันทึกลง audit — ชื่อคอลัมน์ snake_case ตามตารางจริง (`90` §6.1) */
export function toCompanyAuditPayload(
  values: FinanceCompanyValues,
  state: { status: CompanyStatus; suspendedReason: string | null },
): Record<string, unknown> {
  const normalized = normalizeCompanyValues(values)
  return {
    name: normalized.name,
    short_name: normalized.shortName,
    tax_id: normalized.taxId,
    address: normalized.address,
    phone: normalized.phone,
    email: normalized.email,
    contact_name: normalized.contactName,
    contact_phone: normalized.contactPhone,
    signer_name: normalized.signerName,
    service_fee_template_id: normalized.serviceFeeTemplateId,
    vat_registered: normalized.vatRegistered,
    default_invoice_delivery_format: normalized.defaultInvoiceDeliveryFormat,
    billing_day: normalized.billingDay,
    payment_due_days: normalized.paymentDueDays,
    status: state.status,
    suspended_reason: state.suspendedReason,
  }
}
