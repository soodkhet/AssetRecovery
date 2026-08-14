import { describe, expect, it } from 'vitest'
import {
  financeCompanyCreateSchema,
  financeCompanyListQuerySchema,
  financeCompanyStatusSchema,
} from '@/lib/finance-companies/schemas'

/** เทสต์ validation ของฟอร์มบริษัทไฟแนนซ์ (`10` §11 · DoD "tax_id ซ้ำ/ผิดรูปแบบ → reject") */

const TEMPLATE_ID = '33333333-3333-4333-8333-333333333333'

const validInput = {
  name: 'บริษัท สยามไฟแนนซ์ จำกัด',
  shortName: 'SF',
  taxId: '0-1055-12345-67-8',
  address: '123 ถนนสีลม กรุงเทพฯ',
  phone: '021234567',
  email: 'ar@siamfinance.co.th',
  contactName: 'คุณสมชาย',
  contactPhone: '0812345678',
  signerName: 'คุณสมหญิง',
  serviceFeeTemplateId: TEMPLATE_ID,
  reason: 'เพิ่มบริษัทคู่ค้าใหม่ตามสัญญาปี 2569',
}

function fieldsOf(input: unknown): string[] {
  const parsed = financeCompanyCreateSchema.safeParse(input)
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.path.join('.'))
}

describe('financeCompanyCreateSchema', () => {
  it('normalize tax_id เป็นตัวเลขล้วน และเติม default ของ VAT/รูปแบบส่งเอกสาร/รอบบิล', () => {
    const parsed = financeCompanyCreateSchema.parse(validInput)
    expect(parsed.taxId).toBe('0105512345678')
    expect(parsed.vatRegistered).toBe(true)
    expect(parsed.defaultInvoiceDeliveryFormat).toBe('paper_pdf')
    expect(parsed.billingDay).toBe(1)
    expect(parsed.paymentDueDays).toBe(30)
  })

  it('tax_id ผิดรูปแบบ → reject (13 หลักเท่านั้น)', () => {
    expect(fieldsOf({ ...validInput, taxId: '010551234567' })).toContain('taxId')
    expect(fieldsOf({ ...validInput, taxId: 'ABCDEFGHIJKLM' })).toContain('taxId')
  })

  it('ต้องผูกเทมเพลตค่าบริการเสมอ (`10` §9.1)', () => {
    const { serviceFeeTemplateId: _omitted, ...withoutTemplate } = validInput
    expect(fieldsOf(withoutTemplate)).toContain('serviceFeeTemplateId')
  })

  it('ช่องที่ไม่บังคับส่งค่าว่างมาได้ → เก็บเป็น null', () => {
    const parsed = financeCompanyCreateSchema.parse({ ...validInput, address: '', signerName: null, email: '' })
    expect(parsed.address).toBeNull()
    expect(parsed.signerName).toBeNull()
    expect(parsed.email).toBeNull()
  })

  it('reason บังคับทุก mutation (`10` §13 — หมวดเงิน)', () => {
    const { reason: _omitted, ...withoutReason } = validInput
    expect(fieldsOf(withoutReason)).toContain('reason')
  })

  it('วันตัดรอบบิลต้องอยู่ในช่วง 1-31', () => {
    expect(fieldsOf({ ...validInput, billingDay: 0 })).toContain('billingDay')
    expect(fieldsOf({ ...validInput, billingDay: 32 })).toContain('billingDay')
  })
})

describe('financeCompanyStatusSchema (`10` §9.3)', () => {
  it('ระงับ/เปิดใช้งานต้องมี reason เสมอ', () => {
    expect(financeCompanyStatusSchema.safeParse({ status: 'suspended' }).success).toBe(false)
    expect(
      financeCompanyStatusSchema.safeParse({ status: 'suspended', reason: 'ค้างชำระเกิน 90 วัน' }).success,
    ).toBe(true)
  })

  it('รับได้เฉพาะ active/suspended (ไม่มี inactive แบบทีม)', () => {
    expect(financeCompanyStatusSchema.safeParse({ status: 'inactive', reason: 'ทดสอบค่าที่ไม่มีจริง' }).success).toBe(false)
  })
})

describe('financeCompanyListQuerySchema', () => {
  it('default = ทุกสถานะ (การ์ดเรียง active ก่อน suspended)', () => {
    expect(financeCompanyListQuerySchema.parse({}).status).toBe('all')
    expect(financeCompanyListQuerySchema.parse({ status: 'suspended', search: 'สยาม' }).search).toBe('สยาม')
  })
})
