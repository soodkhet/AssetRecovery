import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TAX_DOC_TEMPLATE,
  LEGALLY_REQUIRED_DOCUMENT_FIELDS,
  TAX_DOCUMENT_TYPES,
  TAX_DOCUMENT_TYPE_LABEL,
  normalizeTaxDocTemplateValues,
  toTaxDocTemplateAuditPayload,
} from '@/lib/settings/tax-doc-template'

/** `13` §6.13 — ปรับได้แค่ภาพลักษณ์ ฟิลด์บังคับตามกฎหมายปิด/ซ่อนไม่ได้ */

describe('ค่าตั้งต้น', () => {
  it('ค่าเริ่มต้น A4 + ภาษาไทย (`13` §6.13)', () => {
    expect(DEFAULT_TAX_DOC_TEMPLATE.paperSize).toBe('A4')
    expect(DEFAULT_TAX_DOC_TEMPLATE.language).toBe('th')
  })

  it('เอกสารภาษี 2 ชนิดพร้อม label ครบ', () => {
    expect([...TAX_DOCUMENT_TYPES]).toEqual(['tax_invoice', 'wht_certificate'])
    for (const type of TAX_DOCUMENT_TYPES) {
      expect(TAX_DOCUMENT_TYPE_LABEL[type].length).toBeGreaterThan(0)
    }
  })

  it('มีรายการฟิลด์บังคับตามกฎหมายไว้ให้ FE แสดงว่าปิดไม่ได้', () => {
    expect(LEGALLY_REQUIRED_DOCUMENT_FIELDS.length).toBeGreaterThanOrEqual(7)
    expect(LEGALLY_REQUIRED_DOCUMENT_FIELDS.join(' ')).toContain('เลขประจำตัวผู้เสียภาษี')
  })
})

describe('normalizeTaxDocTemplateValues', () => {
  it('ข้อความว่างกลายเป็น null (ฟอร์มส่ง `` มาเสมอ)', () => {
    const values = normalizeTaxDocTemplateValues({
      logoUrl: '   ',
      footerNote: '',
      signatureImageUrl: null,
      paperSize: 'A5',
      language: 'th_en_bilingual',
    })
    expect(values.logoUrl).toBeNull()
    expect(values.footerNote).toBeNull()
    expect(values.signatureImageUrl).toBeNull()
  })

  it('ตัดช่องว่างหัวท้ายของค่าที่มีจริง', () => {
    const values = normalizeTaxDocTemplateValues({
      ...DEFAULT_TAX_DOC_TEMPLATE,
      logoUrl: ' https://example.com/logo.png ',
      footerNote: ' ชำระภายใน 30 วัน ',
    })
    expect(values.logoUrl).toBe('https://example.com/logo.png')
    expect(values.footerNote).toBe('ชำระภายใน 30 วัน')
  })
})

describe('toTaxDocTemplateAuditPayload', () => {
  it('ใช้ชื่อคอลัมน์ snake_case + มี document_type กำกับว่าแก้เอกสารชนิดไหน', () => {
    expect(toTaxDocTemplateAuditPayload('wht_certificate', DEFAULT_TAX_DOC_TEMPLATE)).toEqual({
      document_type: 'wht_certificate',
      logo_url: null,
      footer_note: null,
      signature_image_url: null,
      paper_size: 'A4',
      language: 'th',
    })
  })
})
