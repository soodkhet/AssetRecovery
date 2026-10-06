import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderDocumentSample } from '@/components/pdf/document-samples'
import { extractPdfText } from '@/components/pdf/extract-text'
import { renderBillingInvoice } from '@/components/pdf/billing-invoice'
import { SAMPLE_DOC_LABEL } from '@/components/pdf/sample-stamp'
import { DOCUMENT_SAMPLES, DOCUMENT_SAMPLE_TYPES, isDocumentSampleType } from '@/lib/documents/samples/catalog'
import { sampleBillingSource, type DocumentSampleContext } from '@/lib/documents/samples/fixtures'
import { DOCUMENT_NUMBER_DEFAULTS, DOCUMENT_NUMBER_TYPES, formatDocumentNumber } from '@/lib/document-numbering/format'
import type { DocumentNumberType } from '@/lib/generated/prisma/enums'
import { buildBillingInvoiceDoc } from '@/lib/revenue/billing-invoice'
import { testLetterheadWithLogo } from '@/tests/helpers/letterhead'

/**
 * ตัวอย่างเอกสารทั้งหมด (มติ PO U104) — เรนเดอร์ด้วย renderer จริงทุกชนิด · ป้าย "ตัวอย่าง" ทุกหน้า ·
 * หัวเอกสาร = ข้อมูลองค์กรที่ส่งเข้ามา · เลขที่ = เลขตัวอย่างที่ส่งเข้ามา · เอกสารจริงไม่มีป้าย
 *
 * ตั้ง `PDF_SAMPLE_DIR=<โฟลเดอร์>` ตอนรัน ⇒ เขียนไฟล์ไว้ตรวจด้วยตา (ไม่ commit)
 */

const LETTERHEAD = testLetterheadWithLogo({ nameTh: 'บริษัท หัวเอกสารองค์กร จำกัด', taxId: '0105561234567' })
const AS_OF = new Date('2026-10-06T03:00:00Z')

const NUMBERS = Object.fromEntries(
  DOCUMENT_NUMBER_TYPES.map((type) => [type, formatDocumentNumber(DOCUMENT_NUMBER_DEFAULTS[type], 7, 2569)]),
) as Record<DocumentNumberType, string>

const CONTEXT: DocumentSampleContext = { letterhead: LETTERHEAD, numbers: NUMBERS, asOf: AS_OF }

function textOf(pdf: Buffer): string {
  return extractPdfText(new Uint8Array(pdf)).replace(/\n/g, '')
}

function pageCount(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length
}

function count(text: string, needle: string): number {
  return text.split(needle).length - 1
}

function save(name: string, pdf: Buffer): void {
  const dir = process.env.PDF_SAMPLE_DIR
  if (dir === undefined || dir === '') return
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${name}.pdf`), pdf)
}

describe('ทะเบียนตัวอย่างเอกสาร', () => {
  it('ครบทุกชนิดที่มติกำหนด · ชนิดไม่ซ้ำ · คำอธิบายครบทุกช่อง · ไม่มีเลขอ้างอิงสเปค', () => {
    expect([...DOCUMENT_SAMPLES.map((each) => each.type)].sort()).toEqual([...DOCUMENT_SAMPLE_TYPES].sort())
    expect(new Set(DOCUMENT_SAMPLES.map((each) => each.type)).size).toBe(DOCUMENT_SAMPLE_TYPES.length)
    expect(DOCUMENT_SAMPLES).toHaveLength(13)
    for (const info of DOCUMENT_SAMPLES) {
      for (const value of [info.title, info.recipients, info.issuedWhen, info.copies, info.signers]) {
        expect(value.trim()).not.toBe('')
        expect(value).not.toMatch(/§|`\d{2}`|ไฟล์ \d{2}/)
      }
    }
    expect(isDocumentSampleType('pack-cover')).toBe(true)
    expect(isDocumentSampleType('tax-invoice-real')).toBe(false)
  })
})

describe('เรนเดอร์ตัวอย่างทุกชนิด — renderer จริง + ป้ายตัวอย่างทุกหน้า', () => {
  it.each(DOCUMENT_SAMPLE_TYPES)('%s', async (type) => {
    const pdf = await renderDocumentSample(type, CONTEXT)
    save(`sample-${type}`, pdf)
    const text = textOf(pdf)
    const pages = pageCount(pdf)
    expect(pages).toBeGreaterThanOrEqual(1)
    // ป้ายบนสุด + ลายน้ำ ทุกหน้า
    expect(count(text, SAMPLE_DOC_LABEL)).toBe(pages)
    // หัวเอกสาร/ผู้ออก = ข้อมูลองค์กร
    expect(text).toContain('บริษัท หัวเอกสารองค์กร จำกัด')
  }, 30_000)

  it('เลขที่เอกสารตัวอย่างมาจากชุดเลขที่ส่งเข้ามา', async () => {
    const cases: ReadonlyArray<readonly [(typeof DOCUMENT_SAMPLE_TYPES)[number], string]> = [
      ['billing-invoice', NUMBERS.billing_batch],
      ['receipt-tax-invoice', NUMBERS.tax_invoice],
      ['handover-note', NUMBERS.delivery_note],
      ['payment-voucher', NUMBERS.payment_voucher],
      ['advance-request', NUMBERS.advance],
      ['advance-return', NUMBERS.advance_return],
      ['substitute-receipt', NUMBERS.substitute_receipt],
      ['wht-certificate', NUMBERS.wht_certificate],
    ]
    for (const [type, number] of cases) {
      expect(textOf(await renderDocumentSample(type, CONTEXT)), type).toContain(number)
    }
  }, 60_000)

  it('ตัวอย่างย่อยของใบเสร็จรับเงิน/ใบกำกับภาษี — ฉบับออกแทน / รับบางส่วน', async () => {
    expect(textOf(await renderDocumentSample('receipt-tax-invoice-replacement', CONTEXT))).toContain('ออกแทนฉบับเลขที่')
    const partial = textOf(await renderDocumentSample('receipt-tax-invoice-partial', CONTEXT))
    expect(partial).toContain('รับชำระบางส่วนครั้งที่ 1')
    expect(partial).toContain('ยอดคงค้างตามใบแจ้งหนี้')
  }, 30_000)

  it('เอกสารจริง (ไม่ห่อโหมดตัวอย่าง) ไม่มีป้าย/ลายน้ำตัวอย่าง', async () => {
    const pdf = await renderBillingInvoice(buildBillingInvoiceDoc(sampleBillingSource(CONTEXT)), LETTERHEAD)
    expect(textOf(pdf)).not.toContain(SAMPLE_DOC_LABEL)
  }, 30_000)
})
