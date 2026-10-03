import { describe, expect, it } from 'vitest'
import {
  assertValidTaxId,
  DEFAULT_CUSTOMER_WHT_PCT,
  DEFAULT_VAT_MODE,
  formatCustomerWhtPct,
  formatTaxId,
  isValidTaxId,
  normalizeCompanyValues,
  normalizeTaxId,
  resolveSuspendedReason,
  toCompanyAuditPayload,
  VAT_MODE_OPTIONS,
  vatModeLabel,
  type FinanceCompanyValues,
} from '@/lib/finance-companies/company'
import { isFinanceCompanyError } from '@/lib/finance-companies/errors'

/** เทสต์ pure logic ของบริษัทไฟแนนซ์ (`10` §16) — ไม่มีการแตะ DB ในไฟล์นี้ */

const baseValues: FinanceCompanyValues = {
  name: '  บริษัท สยามไฟแนนซ์ จำกัด  ',
  shortName: ' SF ',
  taxId: '0-1055-12345-67-8',
  address: ' 123 ถนนสีลม ',
  phone: '021234567',
  email: '  ar@siamfinance.co.th ',
  contactName: ' คุณสมชาย ',
  contactPhone: '0812345678',
  signerName: ' คุณสมหญิง ',
  serviceFeeTemplateId: 'tpl-1',
  vatRegistered: true,
  vatMode: 'include_vat',
  whtWithheldByCustomerPct: 3,
  defaultInvoiceDeliveryFormat: 'e_tax_invoice',
  billingDay: 5,
  paymentDueDays: 30,
}

function codeOf(fn: () => unknown): string {
  try {
    fn()
  } catch (error) {
    if (isFinanceCompanyError(error)) return error.code
    throw error
  }
  return 'NO_ERROR'
}

describe('tax_id (`10` §7.1 — format-only 13 หลัก ไม่มี checksum)', () => {
  it('ตัด - และช่องว่างก่อนตรวจ/บันทึก', () => {
    expect(normalizeTaxId('0-1055-12345-67-8')).toBe('0105512345678')
    expect(normalizeTaxId('0105 5123 45678')).toBe('0105512345678')
    expect(isValidTaxId('0-1055-12345-67-8')).toBe(true)
  })

  it('ปฏิเสธเมื่อไม่ใช่ตัวเลข 13 หลักพอดี', () => {
    expect(isValidTaxId('010551234567')).toBe(false) // 12 หลัก
    expect(isValidTaxId('01055123456789')).toBe(false) // 14 หลัก
    expect(isValidTaxId('01055abc45678')).toBe(false)
    expect(codeOf(() => assertValidTaxId('010551234567'))).toBe('INVALID_TAX_ID_FORMAT')
    expect(assertValidTaxId('0-1055-12345-67-8')).toBe('0105512345678')
  })

  it('formatTaxId ใช้แสดงผลเท่านั้น และคืนค่าเดิมถ้ารูปแบบไม่ถูก', () => {
    expect(formatTaxId('0105512345678')).toBe('0-1055-12345-67-8')
    expect(formatTaxId('123')).toBe('123')
  })
})

describe('normalizeCompanyValues', () => {
  it('ตัดช่องว่างทุกช่อง และแปลงค่าว่างเป็น null (ไม่เก็บสตริงว่างใน DB)', () => {
    const result = normalizeCompanyValues({ ...baseValues, address: '   ', signerName: '' })
    expect(result.name).toBe('บริษัท สยามไฟแนนซ์ จำกัด')
    expect(result.shortName).toBe('SF')
    expect(result.taxId).toBe('0105512345678')
    expect(result.address).toBeNull()
    expect(result.signerName).toBeNull()
    expect(result.email).toBe('ar@siamfinance.co.th')
  })
})

describe('resolveSuspendedReason (`10` §9.3/§11)', () => {
  it('ระงับโดยไม่ระบุเหตุผล → SUSPEND_REASON_REQUIRED', () => {
    expect(codeOf(() => resolveSuspendedReason('suspended', null))).toBe('SUSPEND_REASON_REQUIRED')
    expect(codeOf(() => resolveSuspendedReason('suspended', '   '))).toBe('SUSPEND_REASON_REQUIRED')
  })

  it('ระงับพร้อมเหตุผล → เก็บเหตุผลที่ trim แล้ว', () => {
    expect(resolveSuspendedReason('suspended', '  ค้างชำระเกิน 90 วัน  ')).toBe('ค้างชำระเกิน 90 วัน')
  })

  it('เปิดใช้งานกลับ → ล้างเหตุผลเดิมเสมอ (ไม่มีเงื่อนไขพิเศษ)', () => {
    expect(resolveSuspendedReason('active', 'เปิดใช้งานหลังเคลียร์ยอด')).toBeNull()
  })
})

describe('toCompanyAuditPayload', () => {
  it('ใช้ชื่อคอลัมน์ snake_case ครบทุกฟิลด์ที่ `10` §13 บังคับให้ trace', () => {
    const payload = toCompanyAuditPayload(baseValues, { status: 'suspended', suspendedReason: 'ค้างชำระ' })
    expect(payload).toMatchObject({
      name: 'บริษัท สยามไฟแนนซ์ จำกัด',
      short_name: 'SF',
      tax_id: '0105512345678',
      signer_name: 'คุณสมหญิง',
      service_fee_template_id: 'tpl-1',
      vat_registered: true,
      default_invoice_delivery_format: 'e_tax_invoice',
      vat_mode: 'include_vat',
      wht_withheld_by_customer_pct: 3,
      status: 'suspended',
      suspended_reason: 'ค้างชำระ',
    })
  })

  it('ลูกค้าไม่หักภาษี (null) ต้องลง audit เป็น null จริง ไม่ใช่ 0 หรือหายไป (UAT BUG-001)', () => {
    const payload = toCompanyAuditPayload(
      { ...baseValues, whtWithheldByCustomerPct: null, vatMode: 'no_vat' },
      { status: 'active', suspendedReason: null },
    )
    expect(payload).toHaveProperty('wht_withheld_by_customer_pct', null)
    expect(payload.vat_mode).toBe('no_vat')
  })
})

describe('ค่า default ของรูปแบบ VAT / WHT ที่ลูกค้าหัก (ต้องตรงกับ default ของ DB — `02` §5)', () => {
  it('vat_mode = exclude_vat · wht_withheld_by_customer_pct = 3.00', () => {
    expect(DEFAULT_VAT_MODE).toBe('exclude_vat')
    expect(DEFAULT_CUSTOMER_WHT_PCT).toBe(3)
  })

  it('ตัวเลือก VAT ครบ 3 ค่าตาม enum `vat_mode` (`02` §3) และมีป้ายภาษาไทย', () => {
    expect(VAT_MODE_OPTIONS.map((option) => option.value).sort()).toEqual(['exclude_vat', 'include_vat', 'no_vat'])
    expect(vatModeLabel('no_vat')).toBe('ไม่มี VAT')
  })

  it('แสดงอัตราที่ลูกค้าหัก — null = ไม่หัก', () => {
    expect(formatCustomerWhtPct(null)).toBe('ไม่หัก')
    expect(formatCustomerWhtPct(3)).toBe('3.00%')
    expect(formatCustomerWhtPct(1.5)).toBe('1.50%')
  })
})
