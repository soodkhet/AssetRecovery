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
    // มติ PO U146 — ไม่มีวันตัดรอบ/เครดิตเทอมที่บริษัทแล้ว · รอบบิลที่ใช้ไม่ระบุ = null
    expect(parsed.billingCycleId).toBeNull()
    expect(parsed).not.toHaveProperty('billingDay')
  })

  it('ไม่ส่งรูปแบบ VAT / อัตราที่ลูกค้าหักมา → ใช้ default ของ DB (exclude_vat · 3.00) ไม่เปลี่ยนพฤติกรรมเดิม', () => {
    const parsed = financeCompanyCreateSchema.parse(validInput)
    expect(parsed.vatMode).toBe('exclude_vat')
    expect(parsed.whtWithheldByCustomerPct).toBe(3)
  })

  it('รับ vat_mode ได้ครบ 3 ค่าตาม enum `02` §3 และปฏิเสธค่าที่ไม่มีจริง', () => {
    for (const vatMode of ['include_vat', 'exclude_vat', 'no_vat'] as const) {
      expect(financeCompanyCreateSchema.parse({ ...validInput, vatMode }).vatMode).toBe(vatMode)
    }
    expect(fieldsOf({ ...validInput, vatMode: 'vat_7' })).toContain('vatMode')
  })

  it('ลูกค้าไม่หักภาษี ณ ที่จ่าย → ส่ง null แล้วต้องคงเป็น null (ไม่ถูกเติม 3% ทับ — UAT BUG-001)', () => {
    expect(financeCompanyCreateSchema.parse({ ...validInput, whtWithheldByCustomerPct: null }).whtWithheldByCustomerPct).toBeNull()
  })

  it('อัตราที่ลูกค้าหัก: 0–100 ทศนิยมไม่เกิน 2 ตำแหน่ง', () => {
    expect(financeCompanyCreateSchema.parse({ ...validInput, whtWithheldByCustomerPct: 0 }).whtWithheldByCustomerPct).toBe(0)
    expect(financeCompanyCreateSchema.parse({ ...validInput, whtWithheldByCustomerPct: 100 }).whtWithheldByCustomerPct).toBe(100)
    expect(financeCompanyCreateSchema.parse({ ...validInput, whtWithheldByCustomerPct: 1.5 }).whtWithheldByCustomerPct).toBe(1.5)
    expect(financeCompanyCreateSchema.parse({ ...validInput, whtWithheldByCustomerPct: 2.75 }).whtWithheldByCustomerPct).toBe(2.75)
    expect(fieldsOf({ ...validInput, whtWithheldByCustomerPct: -0.01 })).toContain('whtWithheldByCustomerPct')
    expect(fieldsOf({ ...validInput, whtWithheldByCustomerPct: 100.01 })).toContain('whtWithheldByCustomerPct')
    expect(fieldsOf({ ...validInput, whtWithheldByCustomerPct: 3.125 })).toContain('whtWithheldByCustomerPct')
    expect(fieldsOf({ ...validInput, whtWithheldByCustomerPct: '3' })).toContain('whtWithheldByCustomerPct')
    expect(fieldsOf({ ...validInput, whtWithheldByCustomerPct: Number.NaN })).toContain('whtWithheldByCustomerPct')
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

  it('รอบบิลที่ใช้ต้องเป็น id รอบ (ค่าว่างจากฟอร์ม = ยังไม่เลือก)', () => {
    expect(fieldsOf({ ...validInput, billingCycleId: 'abc' })).toContain('billingCycleId')
    expect(financeCompanyCreateSchema.parse({ ...validInput, billingCycleId: '' }).billingCycleId).toBeNull()
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

describe('มติ PO U77 — branchCode (สำนักงานใหญ่/สาขา)', () => {
  it('ไม่ส่งมา = สำนักงานใหญ่ 00000', () => {
    expect(financeCompanyCreateSchema.parse(validInput).branchCode).toBe('00000')
  })

  it('สาขา 5 หลักผ่าน · ไม่ครบ/มีตัวอักษร → field error ที่ branchCode', () => {
    expect(financeCompanyCreateSchema.parse({ ...validInput, branchCode: '00001' }).branchCode).toBe('00001')
    expect(fieldsOf({ ...validInput, branchCode: '1' })).toEqual(['branchCode'])
    expect(fieldsOf({ ...validInput, branchCode: '0000A' })).toEqual(['branchCode'])
    expect(fieldsOf({ ...validInput, branchCode: '000001' })).toEqual(['branchCode'])
  })
})
