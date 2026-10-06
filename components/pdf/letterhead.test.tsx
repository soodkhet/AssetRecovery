import { describe, expect, it } from 'vitest'
import { renderBillingInvoice } from '@/components/pdf/billing-invoice'
import { extractPdfText } from '@/components/pdf/extract-text'
import { renderPackCover } from '@/components/pdf/pack-cover'
import { renderPaymentVouchers } from '@/components/pdf/payment-voucher'
import { renderPayoutBatchSummary } from '@/components/pdf/payout-batch-summary'
import { renderPayslips } from '@/components/pdf/payslip'
import { renderReportPdf } from '@/components/pdf/report-doc'
import { renderTaxInvoice } from '@/components/pdf/tax-invoice'
import { buildPackCoverDoc } from '@/lib/exports/pack'
import type { DocLetterhead } from '@/lib/organization/profile'
import { buildPaymentVoucherDocs, buildPayoutSummaryDoc, buildPayslipDocs } from '@/lib/payout/payout-doc'
import type { PayoutBatchDetailDto } from '@/lib/payout/types'
import type { ReportPayload } from '@/lib/reports/payload'
import { buildBillingInvoiceDoc } from '@/lib/revenue/billing-invoice'
import { buildTaxInvoiceDoc } from '@/lib/sales/sales'
import { testLetterhead, testLetterheadWithLogo } from '@/tests/helpers/letterhead'

/**
 * หัวเอกสารกลาง (มติ PO U99) — PDF ทุกตัวใน `components/pdf/` (ยกเว้นแบบ 50 ทวิ) พิมพ์หัวเอกสารเดียวกัน
 * ทั้งกรณีมีโลโก้ (ฝังรูปจริง) และไม่มีโลโก้ (ไม่มีรูป/กล่องว่าง) · ใบส่งมอบทดสอบที่ `lib/warehouse/handover-doc.test.ts`
 */

const PARTY = { name: 'บริษัท สยามไฟแนนซ์ จำกัด', taxId: '0105512420001', address: '1 ถนนสีลม กรุงเทพฯ', phone: null }

const BATCH: PayoutBatchDetailDto = {
  id: '0f8f3d1e-1111-2222-3333-444455556666',
  name: 'รอบจ่ายทดสอบหัวเอกสาร',
  side: 'outsource',
  status: 'file_generated',
  grossSatang: 850_000,
  whtSatang: 25_500,
  netSatang: 824_500,
  advanceOffsetSatang: 0,
  transferSatang: 824_500,
  itemCount: 1,
  bankAccountId: 'acc-1',
  bankAccountLabel: 'ธนาคารกสิกรไทย xxx-x-x9876-x',
  idempotencyKey: 'PB-OUT-25690705-ABCDEF',
  paymentFileUrl: null,
  paymentFileGeneratedAt: '2026-07-05T00:00:00.000Z',
  whtPolicy: null,
  createdAt: '2026-06-30T02:00:00.000Z',
  createdByName: 'การเงิน ทดสอบ',
  updatedAt: '2026-07-05T00:00:00.000Z',
  cancelledAt: null,
  cancelledByName: null,
  cancelReason: null,
  items: [
    {
      id: 'item-1',
      source: 'expense',
      sourceId: 'exp-1',
      payeeId: 'payee-1',
      payeeName: 'ประยุทธ์ บุญมี',
      teamName: 'ทีมรับเหมาเหนือ',
      description: 'ค่าคอมมิชชั่น',
      caseRef: 'CT-0001',
      trackingRound: 1,
      grossSatang: 850_000,
      whtSatang: 25_500,
      netSatang: 824_500,
      taxProfileId: 'tax-1',
      taxProfileName: 'บุคคลธรรมดา 3%',
      whtPctSnapshot: 3,
      whtBaseIncluded: true,
      whtIncomeCategory: 'sec_40_8',
      advanceOffsetSatang: 0,
      transferSatang: 824_500,
      advanceOffsets: [],
      bankName: 'ธนาคารกสิกรไทย',
      accountNumberMasked: 'xxx-x-x1234-x',
      voucherNumber: 'PV-2569-0001',
    },
  ],
}

const ISSUER = { name: 'บริษัท ใจดี โมบาย จำกัด', address: 'กรุงเทพฯ', taxId: '0105560123456', phone: null }

const REPORT: ReportPayload = {
  report: { code: 'F1', id: 'gross-profit', title: 'กำไรขั้นต้น', category: 'F' },
  range: { preset: 'this_month', label: 'ตุลาคม 2569', from: '2026-10-01', to: '2026-10-31' },
  columns: [{ key: 'company', header: 'บริษัท', type: 'text' }],
  rows: [{ company: 'ก' }],
  kpis: [],
  totalRow: null,
  note: null,
  reconciliation: null,
  cache: {
    mode: 'realtime',
    computedAt: '2026-10-04T03:00:00Z',
    fromCache: false,
    stale: false,
    expiresAt: null,
    refreshAvailableAt: null,
    refreshThrottled: false,
  },
}

/** เอกสารทุกตัวที่ใช้หัวเอกสารกลาง — คืน PDF ตามหัวเอกสารที่ส่งเข้าไป */
const DOCUMENTS: ReadonlyArray<{ name: string; render: (letterhead: DocLetterhead) => Promise<Buffer> }> = [
  {
    name: 'ใบเสร็จรับเงิน/ใบกำกับภาษี',
    render: (letterhead) =>
      renderTaxInvoice(
        buildTaxInvoiceDoc({
          docKind: 'receipt_tax_invoice',
          replacementNote: null,
          billingBatchNumber: 'BL-2569-001',
          receivedDate: new Date('2026-06-28T00:00:00Z'),
          sellerProfile: null,
          invoiceNumber: 'INV-0006',
          invoiceDate: new Date('2026-06-28T03:00:00Z'),
          status: 'active',
          cancelReason: null,
          cancelledAt: null,
          deliveryFormat: 'paper_pdf',
          seller: { name: letterhead.nameTh, taxId: letterhead.taxId, address: letterhead.address, phone: letterhead.phone },
          buyer: PARTY,
          buyerBranchCode: '00000',
          sellerBranchCode: '00000',
          description: 'ค่าบริการติดตามทรัพย์',
          periodLabel: 'มิถุนายน 2569',
          amounts: { totalBeforeVatSatang: 1_200_000, vatSatang: 84_000, totalSatang: 1_284_000 },
          vatRatesPct: ['7.00'],
        }),
        letterhead,
      ),
  },
  {
    name: 'ใบแจ้งหนี้/ใบวางบิล',
    render: (letterhead) =>
      renderBillingInvoice(
        buildBillingInvoiceDoc({
          batchNumber: 'BL-2569-007',
          period: 'กันยายน 2569',
          sentAt: new Date('2026-10-01T03:00:00Z'),
          dueDate: new Date('2026-10-31T00:00:00Z'),
          seller: { name: letterhead.nameTh, taxId: letterhead.taxId, address: letterhead.address, phone: null, branchCode: '00000' },
          buyer: { ...PARTY, branchCode: '00000' },
          sellerProfile: null,
          lines: [
            { caseRef: 'C-1', revenueDate: new Date('2026-09-10T00:00:00Z'), grossSatang: 100_000, vatSatang: 7_000, totalSatang: 107_000, vatRatePct: '7.00' },
          ],
        }),
        letterhead,
      ),
  },
  { name: 'ใบสำคัญจ่าย', render: (letterhead) => renderPaymentVouchers(buildPaymentVoucherDocs(BATCH, ISSUER), letterhead) },
  { name: 'สลิปค่าตอบแทน', render: (letterhead) => renderPayslips(buildPayslipDocs(BATCH, ISSUER), letterhead) },
  { name: 'สรุปรอบจ่าย', render: (letterhead) => renderPayoutBatchSummary(buildPayoutSummaryDoc(BATCH, ISSUER), letterhead) },
  {
    name: 'หน้าปกชุดเอกสารบัญชี',
    render: (letterhead) =>
      renderPackCover(
        buildPackCoverDoc({
          organizationName: letterhead.nameTh,
          periodLabel: 'มิถุนายน 2569',
          version: 1,
          generatedByName: 'บัญชี',
          generatedAt: new Date('2026-07-03T03:30:00Z'),
          contentDigest: 'abc',
          checks: [],
        }),
        letterhead,
      ),
  },
  {
    name: 'รายงาน',
    render: (letterhead) =>
      renderReportPdf({ payload: REPORT, generatedAt: new Date('2026-10-04T03:00:00Z'), generatedByName: 'บริหาร', letterhead }),
  },
]

/** PDF มีรูปฝังไหม — react-pdf เขียน XObject ของรูปเป็น `/Subtype /Image` */
function hasEmbeddedImage(pdf: Buffer): boolean {
  return pdf.toString('latin1').includes('/Subtype /Image')
}

describe('หัวเอกสารกลาง (มติ PO U99) — PDF ทุกตัว', () => {
  it.each(DOCUMENTS)('$name — มีโลโก้: ฝังรูป + พิมพ์ชื่อไทย/อังกฤษ/ที่อยู่/ติดต่อ/เลขผู้เสียภาษี+สาขา', async ({ render }) => {
    const pdf = await render(testLetterheadWithLogo())
    const text = extractPdfText(new Uint8Array(pdf)).replace(/\n/g, '')
    expect(hasEmbeddedImage(pdf)).toBe(true)
    expect(text).toContain('บริษัท ใจดี โมบาย จำกัด')
    expect(text).toContain('Jaidee Mobile Co., Ltd.')
    expect(text).toContain('แขวงปทุมวัน เขตปทุมวัน กรุงเทพมหานคร 10330')
    expect(text).toContain('โทร. 02-000-1234 · อีเมล accounting@jaidee.co.th · เว็บไซต์ www.jaidee.co.th')
    expect(text).toContain('เลขประจำตัวผู้เสียภาษี 0105560123456 · สำนักงานใหญ่')
    expect(text).not.toContain('LOGO')
  })

  it.each(DOCUMENTS)('$name — ไม่มีโลโก้/ไม่มีช่องติดต่อ: ไม่มีรูป ไม่มีกล่อง LOGO ไม่พิมพ์บรรทัดว่าง', async ({ render }) => {
    const pdf = await render(testLetterhead({ nameEn: null, phone: null, email: null, website: null, branchLabel: 'สาขาที่ 00002' }))
    const text = extractPdfText(new Uint8Array(pdf)).replace(/\n/g, '')
    expect(hasEmbeddedImage(pdf)).toBe(false)
    expect(text).toContain('บริษัท ใจดี โมบาย จำกัด')
    expect(text).toContain('เลขประจำตัวผู้เสียภาษี 0105560123456 · สาขาที่ 00002')
    expect(text).not.toContain('Jaidee')
    expect(text).not.toContain('accounting@jaidee.co.th')
    expect(text).not.toContain('โทร. 02-000-1234')
    expect(text).not.toContain('LOGO')
  })
})
