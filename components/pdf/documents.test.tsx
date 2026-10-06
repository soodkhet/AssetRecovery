import { mkdirSync, writeFileSync } from 'node:fs'
import { sumPayoutTaxSplit } from '@/lib/finance/wht-calc'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderBillingInvoice } from '@/components/pdf/billing-invoice'
import { extractPdfText } from '@/components/pdf/extract-text'
import { renderHandoverNote } from '@/components/pdf/handover-note'
import { renderPackCover } from '@/components/pdf/pack-cover'
import { renderPaymentVouchers } from '@/components/pdf/payment-voucher'
import { renderPayoutBatchSummary } from '@/components/pdf/payout-batch-summary'
import { renderPayslips } from '@/components/pdf/payslip'
import { renderReportPdf } from '@/components/pdf/report-doc'
import { renderTaxInvoice } from '@/components/pdf/tax-invoice'
import { buildPackCoverDoc } from '@/lib/exports/pack'
import {
  buildPaymentVoucherDocs,
  buildPayoutSummaryDoc,
  buildPayslipDocs,
  type PayoutPayeeDocInfo,
} from '@/lib/payout/payout-doc'
import type { PayoutBatchDetailDto, PayoutBatchItemDto } from '@/lib/payout/types'
import type { ReportPayload } from '@/lib/reports/payload'
import { buildBillingInvoiceDoc, type BillingInvoiceSource } from '@/lib/revenue/billing-invoice'
import { buildTaxInvoiceDoc, type TaxInvoiceDocSource } from '@/lib/sales/sales'
import { buildHandoverDoc } from '@/lib/warehouse/handover-doc'
import type { AssetListItemDto, LotDetailDto } from '@/lib/warehouse/types'
import { TINY_PNG, testLetterhead, testLetterheadWithLogo } from '@/tests/helpers/letterhead'
import { NO_DOC_TEMPLATE, TEMPLATE_SIGNATURE_SLOT, type DocTemplateRender } from '@/lib/settings/tax-doc-template'
import { renderWhtCertificate } from '@/components/pdf/wht-certificate'
import { buildWhtCertificateDoc, type WhtCertificateDocSource } from '@/lib/wht/wht'

/**
 * เอกสาร PDF ตามแบบที่อนุมัติ (มติ PO U100/U101 · `reference/documents.html`) — จำนวนฉบับ/หน้า · ป้ายฉบับ ·
 * ข้อความหลัก · ยอดเงิน + ตัวอักษร · ผู้เซ็น · รายการยาวขึ้นหน้าใหม่พร้อมหัวตารางซ้ำ + "หน้า x/y"
 *
 * ตั้ง `PDF_SAMPLE_DIR=<โฟลเดอร์>` ตอนรัน ⇒ เขียนไฟล์ตัวอย่างไว้ตรวจด้วยตา (ไม่ commit)
 */

const LETTERHEAD = testLetterheadWithLogo()

function save(name: string, pdf: Buffer): void {
  const dir = process.env.PDF_SAMPLE_DIR
  if (dir === undefined || dir === '') return
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${name}.pdf`), pdf)
}

function textOf(pdf: Buffer): string {
  return extractPdfText(new Uint8Array(pdf)).replace(/\n/g, '')
}

/** จำนวนหน้าจริงของ PDF — react-pdf เขียนทุกหน้าเป็น `/Type /Page` */
function pageCount(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length
}

function count(text: string, needle: string): number {
  return text.split(needle).length - 1
}

// ── ใบแจ้งหนี้/ใบวางบิล ──────────────────────────────────────────────────

const CUSTOMER = {
  name: 'บริษัท ยูเอที ลิสซิ่ง จำกัด',
  taxId: '0105561000011',
  address: '99 ถนนสาทร แขวงยานนาวา เขตสาทร กรุงเทพมหานคร 10120',
  phone: '02-100-0001',
  branchCode: '00000',
}

function billingSource(overrides: Partial<BillingInvoiceSource> = {}, lineCount = 4): BillingInvoiceSource {
  return {
    batchNumber: 'BL-2569-005',
    period: 'ตุลาคม 2569',
    sentAt: new Date('2026-10-25T03:00:00Z'),
    dueDate: new Date('2026-11-24T00:00:00Z'),
    seller: { name: LETTERHEAD.nameTh, taxId: LETTERHEAD.taxId, address: LETTERHEAD.address, phone: null, branchCode: '00000' },
    buyer: CUSTOMER,
    sellerProfile: null,
    templateSnapshot: null,
    lines: Array.from({ length: lineCount }, (_, index) => ({
      caseRef: `UAT-CO1-${String(index + 1).padStart(3, '0')}`,
      revenueDate: new Date('2026-10-10T00:00:00Z'),
      grossSatang: 150_000,
      vatSatang: 10_500,
      totalSatang: 160_500,
      vatRatePct: '7.00',
      assetDescription: 'Samsung Galaxy A15',
      handoverDocRef: 'DLV-2569-007',
    })),
    customerWhtPct: 3,
    recordedCustomerWhtSatang: 0,
    receivingAccount: { bankName: 'ธนาคารกสิกรไทย', accountNumber: '123-4-56789-0', accountName: 'บริษัท ใจดี โมบาย จำกัด' },
    ...overrides,
  }
}

describe('ใบแจ้งหนี้/ใบวางบิล — ตามแบบ (มติ PO U100/U101)', () => {
  it('ต้นฉบับ + สำเนา 2 หน้า · ไม่ใช่ใบกำกับภาษี · ภาษีลูกค้าหักโดยประมาณ + ยอดคาดรับ · บัญชีรับโอน · ตัวอักษร · ผู้เซ็น', async () => {
    const pdf = await renderBillingInvoice(buildBillingInvoiceDoc(billingSource()), LETTERHEAD)
    save('01-billing-invoice', pdf)
    const text = textOf(pdf)
    expect(pageCount(pdf)).toBe(2)
    expect(text).toContain('ใบแจ้งหนี้ / ใบวางบิล')
    expect(text).toContain('(ต้นฉบับ / Original)')
    expect(text).toContain('(สำเนา / Copy)')
    expect(count(text, 'หน้า 1/1')).toBe(2)
    expect(text).toContain('เอกสารนี้ไม่ใช่ใบกำกับภาษี')
    expect(text).toContain('BL-2569-005')
    expect(text).toContain('เรียกเก็บจาก :')
    expect(text).toContain('ผู้เรียกเก็บ :')
    expect(text).toContain('เลขประจำตัวผู้เสียภาษี 0105561000011 · สำนักงานใหญ่')
    expect(text).toContain('Samsung Galaxy A15 · ใบส่งมอบ DLV-2569-007')
    // 4 × 1,500.00 = 6,000.00 · VAT 420.00 · รวม 6,420.00 · หัก 3% ของ 6,000.00 = 180.00 · คาดรับ 6,240.00
    expect(text).toContain('6,000.00')
    expect(text).toContain('6,420.00')
    expect(text).toContain('หัก ภาษีเงินได้หัก ณ ที่จ่าย 3% ที่ลูกค้าจะหัก (ประมาณการ)')
    expect(text).toContain('(180.00)')
    expect(text).toContain('ยอดที่คาดว่าจะได้รับโอน')
    expect(text).toContain('6,240.00')
    expect(text).toContain('โอนเข้าบัญชี ธนาคารกสิกรไทย · เลขที่บัญชี 123-4-56789-0')
    expect(text).toContain('จำนวนเงิน: -หกพันสี่ร้อยยี่สิบบาทถ้วน-')
    expect(text).toContain('ผู้วางบิล / ผู้ให้บริการ')
    expect(text).toContain('ผู้รับวางบิล / ลูกค้า')
  })

  it('ไม่มีบัญชีรับเงิน = ซ่อนแถวช่องทาง · บริษัทไม่หักภาษี = ไม่มีแถวหัก', async () => {
    const pdf = await renderBillingInvoice(
      buildBillingInvoiceDoc(billingSource({ receivingAccount: null, customerWhtPct: null })),
      testLetterhead(),
    )
    const text = textOf(pdf)
    expect(text).not.toContain('ช่องทางการชำระเงิน')
    expect(text).not.toContain('ที่ลูกค้าจะหัก')
    expect(text).not.toContain('ยอดที่คาดว่าจะได้รับโอน')
  })

  it('รายการยาว — ขึ้นหน้าใหม่ หัวตารางซ้ำทุกหน้า เลขหน้านับต่อฉบับ', async () => {
    const pdf = await renderBillingInvoice(buildBillingInvoiceDoc(billingSource({}, 60)), LETTERHEAD)
    save('01b-billing-invoice-long', pdf)
    const text = textOf(pdf)
    const pages = pageCount(pdf)
    expect(pages).toBeGreaterThanOrEqual(4)
    expect(pages % 2).toBe(0)
    const perCopy = pages / 2
    expect(count(text, `หน้า ${perCopy}/${perCopy}`)).toBe(2)
    expect(count(text, 'รายการ (Descriptions)')).toBe(pages)
    expect(text).toContain('UAT-CO1-060')
  })
})

// ── ใบเสร็จรับเงิน/ใบกำกับภาษี ──────────────────────────────────────────

function taxSource(overrides: Partial<TaxInvoiceDocSource> = {}): TaxInvoiceDocSource {
  return {
    docKind: 'receipt_tax_invoice',
    invoiceNumber: 'INV-0005',
    invoiceDate: new Date('2026-11-20T00:00:00Z'),
    status: 'active',
    cancelReason: null,
    cancelledAt: null,
    deliveryFormat: 'paper_pdf',
    seller: { name: LETTERHEAD.nameTh, taxId: LETTERHEAD.taxId, address: LETTERHEAD.address, phone: LETTERHEAD.phone },
    buyer: { name: CUSTOMER.name, taxId: CUSTOMER.taxId, address: CUSTOMER.address, phone: CUSTOMER.phone },
    buyerBranchCode: '00001',
    sellerBranchCode: '00000',
    sellerProfile: null,
    templateSnapshot: null,
    description: 'ค่าบริการติดตามทรัพย์ รอบเดือน ตุลาคม 2569 (ใบแจ้งหนี้ BL-2569-005)',
    periodLabel: 'พฤศจิกายน 2569',
    amounts: { totalBeforeVatSatang: 600_000, vatSatang: 42_000, totalSatang: 642_000 },
    vatRatesPct: ['7.00'],
    replacementNote: null,
    billingBatchNumber: 'BL-2569-005',
    receivedDate: new Date('2026-11-20T00:00:00Z'),
    receipt: {
      cashSatang: 624_000,
      customerWhtSatang: 18_000,
      receivedDate: new Date('2026-11-20T00:00:00Z'),
      bankAccount: { bankName: 'ธนาคารกสิกรไทย', accountNumber: '123-4-56789-0', accountName: null },
    },
    installment: null,
    ...overrides,
  }
}

describe('ใบเสร็จรับเงิน/ใบกำกับภาษี — ตามแบบ (มติ PO U100/U101)', () => {
  it('ต้นฉบับ + สำเนา · ม.86/4 ครบสองฝ่าย (เลขผู้เสียภาษี + สาขา) · อ้างอิง BL · ภาษีลูกค้าหัก · ยอดรับจริง · ช่องทาง · ผู้เซ็น', async () => {
    const pdf = await renderTaxInvoice(buildTaxInvoiceDoc(taxSource()), LETTERHEAD)
    save('02-receipt-tax-invoice', pdf)
    const text = textOf(pdf)
    expect(pageCount(pdf)).toBe(2)
    expect(text).toContain('ใบเสร็จรับเงิน / ใบกำกับภาษี')
    expect(text).toContain('Receipt / Tax Invoice')
    expect(text).toContain('(ต้นฉบับ / Original)')
    expect(text).toContain('(สำเนา / Copy)')
    expect(text).toContain('INV-0005')
    expect(text).toContain('อ้างอิงใบแจ้งหนี้: BL-2569-005')
    expect(text).toContain('ชำระโดย :')
    expect(text).toContain('ชำระให้ :')
    expect(text).toContain('เลขประจำตัวผู้เสียภาษี 0105561000011 · สาขาที่ 00001')
    expect(text).toContain('เลขประจำตัวผู้เสียภาษี 0105560123456 · สำนักงานใหญ่')
    expect(text).toContain('ภาษีมูลค่าเพิ่ม 7%')
    expect(text).toContain('6,420.00')
    expect(text).toContain('หัก ภาษีเงินได้หัก ณ ที่จ่าย (ผู้ชำระหัก)')
    expect(text).toContain('(180.00)')
    expect(text).toContain('ยอดรับชำระจริง')
    expect(text).toContain('6,240.00')
    expect(text).toContain('โอนเข้าบัญชี ธนาคารกสิกรไทย · เลขที่บัญชี 123-4-56789-0 เมื่อ 20/11/2569')
    expect(text).toContain('จำนวนเงิน: -หกพันสี่ร้อยยี่สิบบาทถ้วน-')
    expect(text).toContain('ผู้รับเงิน')
    expect(text).toContain('ผู้มีอำนาจลงนาม')
    expect(text).not.toContain('รับชำระบางส่วน')
  })

  it('ใบแทน + รับบางส่วน — แถบข้อความออกแทน / ครั้งที่ + ยอดคงค้างตามใบแจ้งหนี้', async () => {
    const pdf = await renderTaxInvoice(
      buildTaxInvoiceDoc(
        taxSource({
          replacementNote: 'ออกแทนฉบับเลขที่ INV-0004 ลงวันที่ 19/11/2569 เนื่องจาก ที่อยู่ผู้ซื้อไม่ถูกต้อง',
          installment: { sequence: 1, outstandingSatang: 749_000 },
        }),
      ),
      LETTERHEAD,
    )
    save('02b-receipt-tax-invoice-partial', pdf)
    const text = textOf(pdf)
    expect(text).toContain('ออกแทนฉบับเลขที่ INV-0004')
    expect(text).toContain('รับชำระบางส่วนครั้งที่ 1 ของใบแจ้งหนี้เลขที่ BL-2569-005')
    expect(text).toContain('ยอดคงค้างตามใบแจ้งหนี้ (รวมภาษีมูลค่าเพิ่ม)')
    expect(text).toContain('7,490.00')
  })

  it('ใบกำกับภาษีแบบเดิม — เลย์เอาต์เดียวกัน ชื่อ "ใบกำกับภาษี" · ไม่มีแถวรับเงิน · ใบยกเลิกขึ้นแถบ', async () => {
    const pdf = await renderTaxInvoice(
      buildTaxInvoiceDoc(
        taxSource({
          docKind: 'tax_invoice',
          receivedDate: null,
          receipt: null,
          status: 'cancelled',
          cancelReason: 'ออกผิดรอบ',
          cancelledAt: new Date('2026-11-21T03:00:00Z'),
        }),
      ),
      LETTERHEAD,
    )
    const text = textOf(pdf)
    expect(pageCount(pdf)).toBe(2)
    expect(text).toContain('ใบกำกับภาษี')
    expect(text).not.toContain('ใบเสร็จรับเงิน')
    expect(text).toContain('ผู้ซื้อ :')
    expect(text).toContain('ผู้ขาย :')
    expect(text).toContain('เอกสารนี้ถูกยกเลิก')
    expect(text).not.toContain('ยอดรับชำระจริง')
    expect(text).not.toContain('ช่องทางการชำระเงิน')
  })
})

// ── ใบส่งมอบทรัพย์ ─────────────────────────────────────────────────────

function asset(index: number): AssetListItemDto {
  return {
    id: `asset-${index}`,
    caseId: `case-${index}`,
    caseRef: `HP-UAT-${String(800 + index).padStart(5, '0')}`,
    debtorName: 'สมชาย ใจดี',
    deviceDesc: 'Samsung Galaxy A15',
    imeiContract: `3567891000000${String(index).padStart(2, '0')}`,
    imeiActual: `3567891000000${String(index).padStart(2, '0')}`,
    serialContract: null,
    serialActual: null,
    assetStatus: 'handover_pending',
    condition: 'normal',
    conditionNote: null,
    companyId: 'company-1',
    companyName: CUSTOMER.name,
    teamId: null,
    teamName: null,
    agentId: null,
    agentName: null,
    closedAt: '2026-10-01T03:00:00.000Z',
    receivedAt: '2026-10-02T03:00:00.000Z',
    rejectReason: null,
    rejectedAt: null,
    lotId: 'lot-1',
    lotNumber: 'LOT-2569-012',
    photoCount: 7,
  }
}

function lot(assetCount: number): LotDetailDto {
  return {
    id: 'lot-1',
    lotNumber: 'LOT-2569-012',
    docRef: 'DLV-2569-007',
    type: 'finance_pickup',
    status: 'pending_attach',
    companyId: 'company-1',
    companyName: CUSTOMER.name,
    scheduledAt: '2026-10-08T03:00:00.000Z',
    deliveredAt: null,
    confirmedAt: null,
    assetCount,
    tab: 'pending_handover',
    contactPerson: 'คุณมาลี ลิสซิ่ง 081-000-0012',
    deliveryAddr: null,
    trackingNo: null,
    signedDocUrl: null,
    deliveryProofUrl: null,
    note: null,
    confirmedByName: null,
    createdAt: '2026-10-05T03:00:00.000Z',
    assets: Array.from({ length: assetCount }, (_, index) => asset(index + 1)),
  }
}

const HANDOVER_ISSUER = { name: LETTERHEAD.nameTh, address: LETTERHEAD.address, taxId: LETTERHEAD.taxId, phone: null }
const HANDOVER_RECIPIENT = { name: CUSTOMER.name, address: CUSTOMER.address, taxId: CUSTOMER.taxId, phone: null, branchCode: '00000' }

describe('ใบส่งมอบทรัพย์ — ตามแบบ (มติ PO U100/U101)', () => {
  it('2 ฉบับ (ต้นฉบับ/สำเนา) · ผู้ส่งมอบ/ผู้รับมอบ + สาขา · IMEI · จำนวนรวม · เซ็นทั้งสองฝ่าย', async () => {
    const pdf = await renderHandoverNote(buildHandoverDoc(lot(5), HANDOVER_ISSUER, HANDOVER_RECIPIENT), LETTERHEAD)
    save('03-handover-note', pdf)
    const text = textOf(pdf)
    expect(pageCount(pdf)).toBe(2)
    expect(text).toContain('(ต้นฉบับ / Original)')
    expect(text).toContain('(สำเนา / Copy)')
    expect(text).toContain('DLV-2569-007')
    expect(text).toContain('LOT-2569-012')
    expect(text).toContain('ผู้ส่งมอบ :')
    expect(text).toContain('ผู้รับมอบ :')
    expect(text).toContain('เลขประจำตัวผู้เสียภาษี 0105561000011 · สำนักงานใหญ่')
    expect(text).toContain('ผู้ประสานงาน: คุณมาลี ลิสซิ่ง 081-000-0012')
    expect(text).toContain('356789100000005')
    expect(text).toContain('5 เครื่อง')
    expect(count(text, 'ผู้ส่งมอบ')).toBeGreaterThanOrEqual(4)
  })

  it('รายการยาว — ขึ้นหน้าใหม่ หัวตารางซ้ำ "หน้า x/y" ต่อฉบับ', async () => {
    const pdf = await renderHandoverNote(buildHandoverDoc(lot(45), HANDOVER_ISSUER, HANDOVER_RECIPIENT), LETTERHEAD)
    save('03b-handover-note-long', pdf)
    const text = textOf(pdf)
    const pages = pageCount(pdf)
    expect(pages).toBeGreaterThanOrEqual(4)
    const perCopy = pages / 2
    expect(count(text, `หน้า 1/${perCopy}`)).toBe(2)
    expect(count(text, 'IMEI / Serial')).toBe(pages)
    expect(text).toContain('45 เครื่อง')
  })
})

// ── ใบสำคัญจ่าย / สลิป / สรุปรอบจ่าย ───────────────────────────────────

function item(overrides: Partial<PayoutBatchItemDto>): PayoutBatchItemDto {
  return {
    id: 'item-1',
    source: 'expense',
    sourceId: 'exp-1',
    payeeId: 'payee-1',
    payeeName: 'ทดสอบ ภาคสนาม',
    teamName: 'ทีม A',
    description: 'ค่าคอมมิชชั่น',
    caseRef: 'UAT-CO1-001',
    trackingRound: 1,
    grossSatang: 80_000,
    whtSatang: 2_400,
    netSatang: 77_600,
    taxProfileId: 'tax-1',
    taxProfileName: 'บุคคลธรรมดา 3%',
    whtPctSnapshot: 3,
    whtBaseIncluded: true,
    whtIncomeCategory: 'sec_40_8',
    whtCondition: 'withhold',
    advanceOffsetSatang: 0,
    transferSatang: 77_600,
    advanceOffsets: [],
    bankName: 'ธนาคารกรุงไทย',
    accountNumberMasked: 'xxx-x-x4321-x',
    voucherNumber: 'PV-2569-0031',
    ...overrides,
  }
}

function batch(items: PayoutBatchItemDto[]): PayoutBatchDetailDto {
  const sum = (key: 'grossSatang' | 'whtSatang' | 'netSatang' | 'advanceOffsetSatang' | 'transferSatang'): number =>
    items.reduce((total, row) => total + row[key], 0)
  return {
    id: '0f8f3d1e-1111-2222-3333-444455556666',
    name: 'ค่าตอบแทน ต.ค. 2569 รอบ 2',
    side: 'inhouse',
    status: 'completed',
    grossSatang: sum('grossSatang'),
    whtSatang: sum('whtSatang'),
    netSatang: sum('netSatang'),
    advanceOffsetSatang: sum('advanceOffsetSatang'),
    transferSatang: sum('transferSatang'),
    ...sumPayoutTaxSplit(items),
    itemCount: items.length,
    bankAccountId: 'acc-1',
    bankAccountLabel: 'ธนาคารกสิกรไทย xxx-x-x6789-x',
    idempotencyKey: 'PB-IN-25691031-ABCDEF',
    paymentFileUrl: null,
    paymentFileGeneratedAt: '2026-10-31T03:00:00.000Z',
    whtPolicy: null,
    createdAt: '2026-10-30T02:00:00.000Z',
    cycleName: null,
    cycleDueRule: null,
    payDueDate: null,
    createdByName: 'การเงิน ทดสอบ',
    updatedAt: '2026-10-31T03:00:00.000Z',
    cancelledAt: null,
    cancelledByName: null,
    cancelReason: null,
    items,
  }
}

/** คอมมิชชัน 6 เคส (อยู่ในฐาน) + ค่าที่พัก 2 คืน (ใบเสร็จนามบริษัท — นอกฐาน U3) + หักคืนเงินทดรอง 500.00 */
function payoutItems(commissionCount = 6): PayoutBatchItemDto[] {
  const commissions = Array.from({ length: commissionCount }, (_, index) =>
    item({ id: `c-${index}`, sourceId: `exp-c-${index}`, caseRef: `UAT-CO1-${String(index + 1).padStart(3, '0')}` }),
  )
  const hotel = item({
    id: 'h-1',
    sourceId: 'exp-h-1',
    description: 'ค่าที่พัก',
    caseRef: null,
    grossSatang: 120_000,
    whtSatang: 0,
    netSatang: 120_000,
    whtBaseIncluded: false,
    transferSatang: 70_000,
    advanceOffsetSatang: 50_000,
    advanceOffsets: [{ advanceId: 'a1b2c3d4-0000-0000-0000-000000000000', advanceRef: 'ADV-A1B2C3D4', amountSatang: 50_000 }],
  })
  return [...commissions, hotel]
}

const PAYEE_INFO: PayoutPayeeDocInfo = {
  displayName: 'นายทดสอบ ภาคสนาม',
  taxId: '1103700000992',
  isCorporate: false,
  address: '123 หมู่ 4 ตำบลทดสอบ อำเภอเมืองชลบุรี จังหวัดชลบุรี 20000',
  branchLabel: null,
  stats: { successCases: 6, fieldDays: 5, hotelNights: 2 },
}
const PAYEES = new Map([['payee-1', PAYEE_INFO]])
const ISSUER = { name: LETTERHEAD.nameTh, address: LETTERHEAD.address, taxId: LETTERHEAD.taxId, phone: null }

describe('ใบสำคัญจ่าย — ตามแบบ (มติ PO U100/U101)', () => {
  it('ต้นฉบับเดียว · จ่ายโดย/จ่ายให้ (ที่อยู่ + เลขประจำตัวประชาชน) · WHT ตามที่ระบบคิด (ฐานไม่รวมค่าที่พัก) · หักคืนเงินทดรอง · ยอดโอนสุทธิ · ผู้เซ็น 3 ช่อง', async () => {
    const pdf = await renderPaymentVouchers(buildPaymentVoucherDocs(batch(payoutItems()), ISSUER, PAYEES), LETTERHEAD)
    save('04-payment-voucher', pdf)
    const text = textOf(pdf)
    expect(pageCount(pdf)).toBe(1)
    expect(text).toContain('ใบสำคัญจ่าย')
    expect(text).toContain('(ต้นฉบับ / Original)')
    expect(text).not.toContain('(สำเนา / Copy)')
    expect(text).toContain('PV-2569-0031')
    expect(text).toContain('จ่ายโดย :')
    expect(text).toContain('จ่ายให้ :')
    expect(text).toContain('นายทดสอบ ภาคสนาม')
    expect(text).toContain('เลขประจำตัวประชาชน 1103700000992')
    expect(text).toContain('จังหวัดชลบุรี 20000')
    expect(text).toContain('ค่าคอมมิชชั่น')
    expect(text).toContain('6 รายการ')
    expect(text).toContain('ไม่อยู่ในฐานภาษีหัก ณ ที่จ่าย')
    // 6 × 800.00 = 4,800.00 + ค่าที่พัก 1,200.00 = 6,000.00 · หัก 3% ตามฐาน 4,800.00 = 144.00 (snapshot)
    expect(text).toContain('6,000.00')
    expect(text).toContain('หัก ภาษี ณ ที่จ่าย 3% (ฐานภาษี 4,800.00)')
    expect(text).toContain('(144.00)')
    expect(text).toContain('หักคืนเงินทดรอง ADV-A1B2C3D4')
    expect(text).toContain('(500.00)')
    // 6,000.00 − 144.00 − 500.00 = 5,356.00
    expect(text).toContain('5,356.00')
    expect(text).toContain('จำนวนเงิน: -ห้าพันสามร้อยห้าสิบหกบาทถ้วน-')
    expect(text).toContain('ผู้จัดทำ')
    expect(text).toContain('ผู้อนุมัติ')
    expect(text).toContain('ผู้รับเงิน')
  })
})

describe('สลิปค่าตอบแทน — ตามแบบ (มติ PO U100/U101)', () => {
  it('ไม่มีป้ายฉบับ ไม่มีช่องเซ็น · สรุปเคส/วันทำงาน/คืนที่พัก · ออกโดยระบบ', async () => {
    const pdf = await renderPayslips(buildPayslipDocs(batch(payoutItems()), ISSUER, PAYEES), LETTERHEAD)
    save('05-payslip', pdf)
    const text = textOf(pdf)
    expect(pageCount(pdf)).toBe(1)
    expect(text).toContain('สลิปค่าตอบแทน')
    expect(text).not.toContain('(ต้นฉบับ')
    expect(text).not.toContain('(สำเนา')
    expect(text).not.toContain('( ....')
    expect(text).toContain('เคสสำเร็จ')
    expect(text).toContain('6 เคส')
    expect(text).toContain('5 วัน')
    expect(text).toContain('2 คืน')
    expect(text).toContain('5,356.00 บาท')
    expect(text).toContain('เอกสารนี้ออกโดยระบบ')
  })

  it('รายการยาว — ขึ้นหน้าใหม่ "หน้า x/y" ต่อคน', async () => {
    const pdf = await renderPayslips(buildPayslipDocs(batch(payoutItems(60)), ISSUER, PAYEES), LETTERHEAD)
    save('05b-payslip-long', pdf)
    const pages = pageCount(pdf)
    expect(pages).toBeGreaterThanOrEqual(2)
    expect(textOf(pdf)).toContain(`หน้า ${pages}/${pages}`)
  })
})

describe('เอกสารภายใน — แถบหัวตามแบบ (มติ PO U100 ข้อ 9)', () => {
  it('สรุปรอบจ่าย — ชื่อเอกสาร + รอบ + วันที่พิมพ์ · ป้ายเอกสารภายใน · ตารางยอดต่อผู้รับ', async () => {
    const doc = buildPayoutSummaryDoc(batch(payoutItems()), ISSUER, new Date('2026-10-31T09:45:00Z'))
    const pdf = await renderPayoutBatchSummary(doc, LETTERHEAD)
    save('09-payout-summary', pdf)
    const text = textOf(pdf)
    expect(text).toContain('เอกสารภายใน')
    expect(text).toContain('สรุปรอบจ่ายเงิน')
    expect(text).toContain('รอบ: ค่าตอบแทน ต.ค. 2569 รอบ 2')
    expect(text).toContain('พิมพ์เมื่อ: 31/10/2569 16:45')
    expect(text).toContain('1 ราย')
    expect(text).toContain('5,356.00')
    expect(text).toContain('ผู้อนุมัติโอนเงิน')
    expect(text).toContain('ค่าตอบแทน')
    expect(text).toContain('ภาษีที่บริษัทออกให้')
    // รอบที่หักตามปกติทั้งหมด ⇒ ไม่มีหมายเหตุภาษีที่บริษัทออกให้
    expect(text).not.toContain('ไม่หักจากผู้รับ')
  })

  it('สรุปรอบจ่าย (มติ PO U109) — ผู้รับ (1)/(2)/(3) ปนกัน: แยกคอลัมน์ค่าตอบแทน / ภาษีที่บริษัทออกให้ / หักผู้รับ', async () => {
    const base = { grossSatang: 1_000_000, whtSatang: 30_000, netSatang: 970_000, transferSatang: 970_000 }
    const mixed = [
      item({ id: 'm1', payeeId: 'p1', payeeName: 'ผู้รับหักปกติ', ...base, whtCondition: 'withhold' }),
      item({ id: 'm2', payeeId: 'p2', payeeName: 'ผู้รับออกให้ตลอดไป', grossSatang: 1_030_928, whtSatang: 30_928, netSatang: 1_000_000, transferSatang: 1_000_000, whtCondition: 'pay_always' }),
      item({ id: 'm3', payeeId: 'p3', payeeName: 'ผู้รับออกให้ครั้งเดียว', grossSatang: 1_030_000, whtSatang: 30_000, netSatang: 1_000_000, transferSatang: 1_000_000, whtCondition: 'pay_once' }),
    ]
    const pdf = await renderPayoutBatchSummary(buildPayoutSummaryDoc(batch(mixed), ISSUER), LETTERHEAD)
    save('09c-payout-summary-payer-tax', pdf)
    const text = textOf(pdf)
    expect(text).toContain('ภาษีที่บริษัทออกให้')
    expect(text).toContain('309.28')
    expect(text).toContain('609.28')
    expect(text).toContain('30,000.00')
    expect(text).toContain('29,700.00')
    // ยอดรวมภาษี (gross) ไม่โผล่บนสรุปรอบจ่ายแล้ว
    expect(text).not.toContain('10,309.28')
    expect(text).not.toContain('31,309.28')
    expect(text).toContain('ไม่หักจากผู้รับ')
  })

  it('หน้าปกชุดเอกสารบัญชี + รายงาน — แถบหัวเดียวกัน', async () => {
    const cover = await renderPackCover(
      buildPackCoverDoc({
        organizationName: LETTERHEAD.nameTh,
        periodLabel: 'ตุลาคม 2569',
        version: 2,
        generatedByName: 'บัญชี',
        generatedAt: new Date('2026-11-05T02:10:00Z'),
        contentDigest: 'abc',
        checks: [],
      }),
      LETTERHEAD,
    )
    save('09b-pack-cover', cover)
    const coverText = textOf(cover)
    expect(coverText).toContain('เอกสารภายใน')
    expect(coverText).toContain('งวดบัญชี: ตุลาคม 2569')

    const payload: ReportPayload = {
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
    const report = await renderReportPdf({
      payload,
      generatedAt: new Date('2026-10-04T03:00:00Z'),
      generatedByName: 'บริหาร',
      letterhead: LETTERHEAD,
    })
    save('09c-report', report)
    const reportText = textOf(report)
    expect(reportText).toContain('เอกสารภายใน')
    expect(reportText).toContain('ช่วงเวลา: ตุลาคม 2569')
    expect(reportText).toContain('พิมพ์เมื่อ: 04/10/2569 10:00')
  })
})

describe('มติ PO U122 — ข้อความท้าย + รูปลายเซ็นจากเทมเพลตเอกสาร', () => {
  const NO_LOGO = testLetterhead()
  const FOOTER = 'ข้อความท้ายทดสอบเทมเพลต'
  const withTemplate = (slot: number, signature = true): DocTemplateRender => ({
    ...NO_DOC_TEMPLATE,
    footerNote: FOOTER,
    signature: signature ? { data: Buffer.from(TINY_PNG), format: 'png' } : null,
    signatureSlot: slot,
  })
  const imageOf = (pdf: Buffer): boolean => pdf.toString('latin1').includes('/Subtype /Image')
  const textOf = (pdf: Buffer): string => extractPdfText(new Uint8Array(pdf)).replace(/\n/g, '')

  const renders: ReadonlyArray<readonly [string, (template: DocTemplateRender) => Promise<Buffer>, number]> = [
    ['ใบแจ้งหนี้', (t) => renderBillingInvoice(buildBillingInvoiceDoc(billingSource()), NO_LOGO, t), TEMPLATE_SIGNATURE_SLOT.billing_invoice],
    ['ใบเสร็จ/ใบกำกับภาษี', (t) => renderTaxInvoice(buildTaxInvoiceDoc(taxSource()), NO_LOGO, t), TEMPLATE_SIGNATURE_SLOT.tax_invoice],
    [
      'ใบส่งมอบ',
      (t) => renderHandoverNote(buildHandoverDoc(lot(2), HANDOVER_ISSUER, HANDOVER_RECIPIENT), NO_LOGO, t),
      TEMPLATE_SIGNATURE_SLOT.handover_note,
    ],
  ]

  it.each(renders)('%s: มีค่า ⇒ พิมพ์ข้อความท้าย + ฝังรูปลายเซ็น', async (_label, render, slot) => {
    const pdf = await render(withTemplate(slot))
    expect(textOf(pdf)).toContain(FOOTER)
    expect(imageOf(pdf)).toBe(true)
  })

  it.each(renders)('%s: ไม่มีเทมเพลต (เอกสารก่อน U122) ⇒ ไม่พิมพ์ข้อความท้าย ไม่มีรูป (เว้นช่องเซ็นมือ)', async (_label, render) => {
    const pdf = await render(NO_DOC_TEMPLATE)
    expect(textOf(pdf)).not.toContain(FOOTER)
    expect(imageOf(pdf)).toBe(false)
  })

  it.each(renders)('%s: ปิดลายเซ็น/โหลดรูปไม่ได้ ⇒ ข้อความท้ายยังพิมพ์ ไม่มีรูป', async (_label, render, slot) => {
    const pdf = await render(withTemplate(slot, false))
    expect(textOf(pdf)).toContain(FOOTER)
    expect(imageOf(pdf)).toBe(false)
  })
})

describe('มติ PO U151 — ชื่อ/ตำแหน่งผู้มีอำนาจลงนามบนเอกสารส่งออกนอก', () => {
  const NO_LOGO = testLetterhead()
  const SIGNER = 'นายผู้ลงนาม ทดสอบหนึ่ง'
  const TITLE = 'กรรมการผู้จัดการทดสอบ'
  const RECEIVER = 'นางสาวผู้รับมอบ ไฟแนนซ์'
  const textOf = (pdf: Buffer): string => extractPdfText(new Uint8Array(pdf)).replace(/\n/g, '')
  const withSigner = (slot: number): DocTemplateRender => ({
    ...NO_DOC_TEMPLATE,
    signatureSlot: slot,
    signerName: SIGNER,
    signerTitle: TITLE,
    counterpartySignerName: RECEIVER,
  })

  const renders: ReadonlyArray<readonly [string, (template: DocTemplateRender) => Promise<Buffer>, number]> = [
    ['ใบแจ้งหนี้', (t) => renderBillingInvoice(buildBillingInvoiceDoc(billingSource()), NO_LOGO, t), TEMPLATE_SIGNATURE_SLOT.billing_invoice],
    ['ใบเสร็จ/ใบกำกับภาษี', (t) => renderTaxInvoice(buildTaxInvoiceDoc(taxSource()), NO_LOGO, t), TEMPLATE_SIGNATURE_SLOT.tax_invoice],
    [
      'ใบส่งมอบ',
      (t) => renderHandoverNote(buildHandoverDoc(lot(2), HANDOVER_ISSUER, HANDOVER_RECIPIENT), NO_LOGO, t),
      TEMPLATE_SIGNATURE_SLOT.handover_note,
    ],
  ]

  it.each(renders)('%s: snapshot มีผู้ลงนาม ⇒ พิมพ์ชื่อ + ตำแหน่ง', async (_label, render, slot) => {
    const text = textOf(await render(withSigner(slot)))
    expect(text).toContain(SIGNER)
    expect(text).toContain(`ตำแหน่ง ${TITLE}`)
  })

  it.each(renders)('%s: เอกสารเก่าไม่มี snapshot ⇒ ไม่พิมพ์ชื่อ (เว้นจุด)', async (_label, render) => {
    const text = textOf(await render(NO_DOC_TEMPLATE))
    expect(text).not.toContain(SIGNER)
    expect(text).not.toContain('ตำแหน่ง')
  })

  it('ใบส่งมอบ: ผู้ลงนามบริษัทไฟแนนซ์พิมพ์ช่องผู้รับมอบ · ใบแจ้งหนี้/ใบกำกับไม่พิมพ์ชื่อคู่ค้า', async () => {
    const handover = textOf(
      await renderHandoverNote(
        buildHandoverDoc(lot(1), HANDOVER_ISSUER, HANDOVER_RECIPIENT),
        NO_LOGO,
        withSigner(TEMPLATE_SIGNATURE_SLOT.handover_note),
      ),
    )
    expect(handover).toContain(RECEIVER)
    const invoice = textOf(
      await renderBillingInvoice(
        buildBillingInvoiceDoc(billingSource()),
        NO_LOGO,
        withSigner(TEMPLATE_SIGNATURE_SLOT.billing_invoice),
      ),
    )
    expect(invoice).not.toContain(RECEIVER)
  })

  const whtSource: WhtCertificateDocSource = {
    certificateNumber: 'WHT-2569-151',
    status: 'active',
    cancelReason: null,
    cancelledAt: null,
    replacesCertificateNumber: null,
    deliveryFormat: 'paper',
    filingForm: 'PND3',
    incomeType: 'ค่าจ้างทำของ มาตรา 40(8)',
    paymentDate: new Date('2026-10-04T03:00:00Z'),
    grossSatang: 7_500,
    whtSatang: 225,
    issuedAt: new Date('2026-10-04T03:00:00Z'),
    payeeType: 'individual',
    incomeCategory: 'sec_40_8',
    whtCondition: 'withhold',
    filingSequence: 1,
    payer: { name: 'บริษัท ผู้จ่าย จำกัด', taxId: '0105560000000', address: 'กรุงเทพฯ', branchLabel: 'สำนักงานใหญ่' },
    payee: { name: 'ผู้รับเงิน ทดสอบ', taxId: '3100000001234', address: 'กรุงเทพฯ', branchLabel: null },
  }

  it('50 ทวิ: snapshot ผู้ลงนามของใบ ⇒ พิมพ์ชื่อ/ตำแหน่งช่องผู้จ่ายเงิน', async () => {
    const text = textOf(
      await renderWhtCertificate(buildWhtCertificateDoc({ ...whtSource, payerSigner: { name: SIGNER, title: TITLE } })),
    )
    expect(text).toContain(SIGNER)
    expect(text).toContain(`ตำแหน่ง ${TITLE}`)
    expect(text).toContain('(ผู้มีหน้าที่หักภาษี ณ ที่จ่าย)')
  })

  it('50 ทวิ: ใบก่อน U151 (ไม่มี snapshot) ⇒ ไม่พิมพ์ชื่อ', async () => {
    const text = textOf(await renderWhtCertificate(buildWhtCertificateDoc(whtSource)))
    expect(text).not.toContain(SIGNER)
    expect(text).not.toContain('ตำแหน่ง')
    const blank = textOf(
      await renderWhtCertificate(buildWhtCertificateDoc({ ...whtSource, payerSigner: { name: ' ', title: null } })),
    )
    expect(blank).not.toContain('ตำแหน่ง')
  })
})
