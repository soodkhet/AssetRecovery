import type { AdvanceDocSource, AdvanceReturnDocSource } from '@/lib/advances/advance-doc'
import { sumPayoutTaxSplit } from '@/lib/finance/wht-calc'
import { monthLabelTH } from '@/lib/field/calendar'
import { toBangkokParts } from '@/lib/format/datetime'
import type { DocumentNumberType, TemplateDocumentType } from '@/lib/generated/prisma/enums'
import { PACK_FILES } from '@/lib/exports/pack'
import type { DocLetterhead } from '@/lib/organization/profile'
import type { PayoutDocIssuer, PayoutPayeeDocInfo } from '@/lib/payout/payout-doc'
import type { PayoutBatchDetailDto, PayoutBatchItemDto } from '@/lib/payout/types'
import type { BillingInvoiceSource } from '@/lib/revenue/billing-invoice'
import type { TaxInvoiceDocSource } from '@/lib/sales/sales'
import type { SubstituteReceiptDocSource } from '@/lib/substitute-receipts/substitute-receipt-doc'
import type { HandoverParty } from '@/lib/warehouse/handover-doc'
import type { AssetListItemDto, LotDetailDto } from '@/lib/warehouse/types'
import type { WhtCertificateDocSource } from '@/lib/wht/wht'
import type { DocTemplateRender } from '@/lib/settings/tax-doc-template'

/**
 * **ข้อมูลสมมติคงที่** ของหน้าตัวอย่างเอกสาร (มติ PO U104) — pure ล้วน ไม่แตะ DB
 *
 * - ผู้ออกเอกสาร (เรา) = **ข้อมูลองค์กรจริง** จากหัวเอกสารกลาง ⇒ เห็นหน้าตาที่จะออกจริง
 * - คู่ค้า/ผู้รับเงิน/ลูกหนี้/รายการ = ชื่อสมมติที่ขึ้นต้นด้วย "ตัวอย่าง"/"สมมติ" ทั้งหมด (ห้ามดึงข้อมูลจริงจากฐาน)
 * - เลขที่เอกสาร = "เลขถัดไป" ตามค่าตั้งปัจจุบัน (คำนวณแบบอ่านอย่างเดียว — ไม่เดินตัวนับ)
 * - วันที่ = วันที่ดูตัวอย่าง (ปีในเลขเอกสารตรงกับวันที่บนเอกสาร) · ยอดเงิน = satang คงที่ (Rule 01)
 */

export interface DocumentSampleContext {
  letterhead: DocLetterhead
  /** เลขที่ตัวอย่างต่อชุดเลข (เลขถัดไป ณ `asOf`) */
  numbers: Readonly<Record<DocumentNumberType, string>>
  asOf: Date
  /**
   * ข้อความท้าย + รูปลายเซ็นตามค่าตั้งปัจจุบันของแท็บ "เทมเพลตเอกสาร" (มติ PO U122) — ปุ่ม "ดูตัวอย่าง PDF"
   * ของแท็บนั้นเปิดตัวอย่างชุดนี้ · ไม่ส่ง/ไม่มีชนิดนั้น = ไม่พิมพ์
   */
  templates?: Partial<Record<TemplateDocumentType, DocTemplateRender>>
}

/** ชื่อ/ข้อมูลสมมติทั้งหมดของตัวอย่าง — เทสต์ใช้ตรวจว่าไม่มีข้อมูลจริงหลุดเข้ามา */
export const SAMPLE_CUSTOMER = {
  name: 'บริษัท ตัวอย่าง ลิสซิ่ง จำกัด',
  taxId: '0105599999991',
  address: '99/9 ถนนตัวอย่าง แขวงสมมติ เขตตัวอย่าง กรุงเทพมหานคร 10000',
  phone: '02-000-0000',
  branchCode: '00000',
} as const

export const SAMPLE_PAYEE = {
  fullName: 'สมมติ ตัวอย่าง',
  nameTitle: 'นาย',
  phone: '080-000-0000',
  nationalId: '1999999999991',
  addressDetail: '9/9 หมู่ 9',
  addressSubdistrict: 'ตัวอย่าง',
  addressDistrict: 'สมมติ',
  addressProvince: 'ชลบุรี',
  addressPostalCode: '20000',
  bankName: 'ธนาคารตัวอย่าง',
  accountNumber: '000-0-00000-0',
} as const

const SAMPLE_PAYEE_DISPLAY = `${SAMPLE_PAYEE.nameTitle}${SAMPLE_PAYEE.fullName}`
const SAMPLE_PAYEE_ADDRESS = `${SAMPLE_PAYEE.addressDetail} ต.${SAMPLE_PAYEE.addressSubdistrict} อ.${SAMPLE_PAYEE.addressDistrict} จ.${SAMPLE_PAYEE.addressProvince} ${SAMPLE_PAYEE.addressPostalCode}`
const SAMPLE_TEAM = 'ทีมตัวอย่าง'
const SAMPLE_DEVICE = 'สมาร์ทโฟนตัวอย่าง รุ่น X1'
const SAMPLE_BANK = { bankName: 'ธนาคารตัวอย่าง', accountNumber: '000-0-00000-0', accountName: null }
const SAMPLE_ID = '00000000-0000-4000-8000-000000000000'

const DAY_MS = 24 * 60 * 60 * 1000

function daysBefore(asOf: Date, days: number): Date {
  return new Date(asOf.getTime() - days * DAY_MS)
}

function daysAfter(asOf: Date, days: number): Date {
  return new Date(asOf.getTime() + days * DAY_MS)
}

/** "ตุลาคม 2569" ของวันที่ดูตัวอย่าง (พ.ศ. — Rule 01) */
export function samplePeriodLabel(asOf: Date): string {
  const parts = toBangkokParts(asOf)
  if (parts === null) throw new Error('samplePeriodLabel: วันที่ไม่ถูกต้อง')
  return monthLabelTH({ year: parts.year, month: parts.month })
}

/** รหัสสาขา 5 หลักจากป้ายสาขาของหัวเอกสาร ("สาขาที่ 00002" → 00002 · สำนักงานใหญ่ → 00000) */
function sellerBranchCode(letterhead: DocLetterhead): string {
  return /(\d{5})/.exec(letterhead.branchLabel)?.[1] ?? '00000'
}

function seller(context: DocumentSampleContext) {
  const { letterhead } = context
  return {
    name: letterhead.nameTh,
    taxId: letterhead.taxId,
    address: letterhead.address,
    phone: letterhead.phone,
    branchCode: sellerBranchCode(letterhead),
  }
}

export function sampleIssuer(context: DocumentSampleContext): PayoutDocIssuer & HandoverParty {
  const party = seller(context)
  return { name: party.name, address: party.address, taxId: party.taxId, phone: party.phone, branchCode: party.branchCode }
}

/** เลขเคสสมมติ — ขึ้นต้น SAMPLE เสมอ */
function sampleCaseRef(index: number): string {
  return `SAMPLE-${String(index).padStart(3, '0')}`
}

// ── ใบแจ้งหนี้/ใบวางบิล ──────────────────────────────────────────────

export function sampleBillingSource(context: DocumentSampleContext): BillingInvoiceSource {
  return {
    batchNumber: context.numbers.billing_batch,
    period: samplePeriodLabel(context.asOf),
    sentAt: context.asOf,
    dueDate: daysAfter(context.asOf, 30),
    seller: seller(context),
    buyer: { ...SAMPLE_CUSTOMER },
    sellerProfile: null,
    templateSnapshot: null,
    lines: Array.from({ length: 4 }, (_, index) => ({
      caseRef: sampleCaseRef(index + 1),
      revenueDate: daysBefore(context.asOf, 10),
      grossSatang: 150_000,
      vatSatang: 10_500,
      totalSatang: 160_500,
      vatRatePct: '7.00',
      assetDescription: SAMPLE_DEVICE,
      handoverDocRef: context.numbers.delivery_note,
    })),
    customerWhtPct: 3,
    recordedCustomerWhtSatang: 0,
    receivingAccount: { ...SAMPLE_BANK, accountName: context.letterhead.nameTh },
  }
}

// ── ใบเสร็จรับเงิน/ใบกำกับภาษี ───────────────────────────────────────

export type TaxInvoiceSampleVariant = 'normal' | 'replacement' | 'partial'

export function sampleTaxInvoiceSource(
  context: DocumentSampleContext,
  variant: TaxInvoiceSampleVariant = 'normal',
): TaxInvoiceDocSource {
  const party = seller(context)
  const invoiceNumber = context.numbers.tax_invoice
  const partial = variant === 'partial'
  // รับบางส่วน: รับ 3,210.00 จากยอดใบแจ้งหนี้ 6,420.00 (ก่อน VAT 3,000.00 · VAT 210.00 · ลูกค้าหัก 3% = 90.00)
  const amounts = partial
    ? { totalBeforeVatSatang: 300_000, vatSatang: 21_000, totalSatang: 321_000 }
    : { totalBeforeVatSatang: 600_000, vatSatang: 42_000, totalSatang: 642_000 }
  const customerWhtSatang = partial ? 9_000 : 18_000
  return {
    docKind: 'receipt_tax_invoice',
    invoiceNumber,
    invoiceDate: context.asOf,
    status: 'active',
    cancelReason: null,
    cancelledAt: null,
    deliveryFormat: 'paper_pdf',
    seller: { name: party.name, taxId: party.taxId, address: party.address, phone: party.phone },
    buyer: { name: SAMPLE_CUSTOMER.name, taxId: SAMPLE_CUSTOMER.taxId, address: SAMPLE_CUSTOMER.address, phone: SAMPLE_CUSTOMER.phone },
    buyerBranchCode: SAMPLE_CUSTOMER.branchCode,
    sellerBranchCode: party.branchCode,
    sellerProfile: null,
    templateSnapshot: null,
    description: `ค่าบริการติดตามทรัพย์ รอบเดือน ${samplePeriodLabel(context.asOf)} (ใบแจ้งหนี้ ${context.numbers.billing_batch})`,
    periodLabel: samplePeriodLabel(context.asOf),
    amounts,
    vatRatesPct: ['7.00'],
    replacementNote:
      variant === 'replacement'
        ? 'ออกแทนฉบับเลขที่ (เลขฉบับเดิม) ที่ถูกยกเลิก เนื่องจาก ที่อยู่ผู้ซื้อไม่ถูกต้อง'
        : null,
    billingBatchNumber: context.numbers.billing_batch,
    receivedDate: context.asOf,
    receipt: {
      cashSatang: amounts.totalSatang - customerWhtSatang,
      customerWhtSatang,
      receivedDate: context.asOf,
      bankAccount: { bankName: SAMPLE_BANK.bankName, accountNumber: SAMPLE_BANK.accountNumber, accountName: null },
    },
    installment: partial ? { sequence: 1, outstandingSatang: 321_000 } : null,
  }
}

// ── ใบส่งมอบทรัพย์ ─────────────────────────────────────────────────

function sampleAsset(context: DocumentSampleContext, index: number): AssetListItemDto {
  const imei = `35000000000000${index}`.slice(-15)
  return {
    id: `${SAMPLE_ID}-a${index}`,
    caseId: `${SAMPLE_ID}-c${index}`,
    caseRef: sampleCaseRef(index),
    debtorName: 'ลูกหนี้ ตัวอย่าง',
    deviceDesc: SAMPLE_DEVICE,
    imeiContract: imei,
    imeiActual: imei,
    serialContract: null,
    serialActual: null,
    assetStatus: 'handover_pending',
    condition: 'normal',
    conditionNote: null,
    companyId: SAMPLE_ID,
    companyName: SAMPLE_CUSTOMER.name,
    teamId: null,
    teamName: null,
    agentId: null,
    agentName: null,
    closedAt: daysBefore(context.asOf, 5).toISOString(),
    receivedAt: daysBefore(context.asOf, 4).toISOString(),
    rejectReason: null,
    rejectedAt: null,
    lotId: SAMPLE_ID,
    lotNumber: context.numbers.handover_lot,
    photoCount: 7,
  }
}

export function sampleHandoverLot(context: DocumentSampleContext): LotDetailDto {
  const assetCount = 5
  return {
    id: SAMPLE_ID,
    lotNumber: context.numbers.handover_lot,
    docRef: context.numbers.delivery_note,
    type: 'finance_pickup',
    status: 'pending_attach',
    companyId: SAMPLE_ID,
    companyName: SAMPLE_CUSTOMER.name,
    scheduledAt: context.asOf.toISOString(),
    deliveredAt: null,
    confirmedAt: null,
    assetCount,
    tab: 'pending_handover',
    contactPerson: 'คุณตัวอย่าง ผู้ประสานงาน 080-000-0000',
    deliveryAddr: null,
    trackingNo: null,
    signedDocUrl: null,
    deliveryProofUrl: null,
    note: null,
    confirmedByName: null,
    createdAt: daysBefore(context.asOf, 1).toISOString(),
    assets: Array.from({ length: assetCount }, (_, index) => sampleAsset(context, index + 1)),
  }
}

export function sampleHandoverRecipient(): HandoverParty {
  return {
    name: SAMPLE_CUSTOMER.name,
    address: SAMPLE_CUSTOMER.address,
    taxId: SAMPLE_CUSTOMER.taxId,
    phone: null,
    branchCode: SAMPLE_CUSTOMER.branchCode,
  }
}

// ── รอบจ่าย: ใบสำคัญจ่าย / สลิป / สรุปรอบ ─────────────────────────────

const SAMPLE_PAYEE_ID = `${SAMPLE_ID}-p1`

function payoutItem(context: DocumentSampleContext, overrides: Partial<PayoutBatchItemDto>): PayoutBatchItemDto {
  return {
    id: `${SAMPLE_ID}-i`,
    source: 'expense',
    sourceId: `${SAMPLE_ID}-e`,
    payeeId: SAMPLE_PAYEE_ID,
    payeeName: SAMPLE_PAYEE_DISPLAY,
    teamName: SAMPLE_TEAM,
    description: 'ค่าคอมมิชชั่น',
    caseRef: null,
    trackingRound: 1,
    grossSatang: 80_000,
    whtSatang: 2_400,
    netSatang: 77_600,
    taxProfileId: SAMPLE_ID,
    taxProfileName: 'บุคคลธรรมดา 3%',
    whtPctSnapshot: 3,
    whtBaseIncluded: true,
    whtIncomeCategory: 'sec_40_8',
    whtCondition: 'withhold',
    advanceOffsetSatang: 0,
    transferSatang: 77_600,
    advanceOffsets: [],
    bankName: SAMPLE_BANK.bankName,
    accountNumberMasked: 'xxx-x-x0000-x',
    voucherNumber: context.numbers.payment_voucher,
    ...overrides,
  }
}

/** คอมมิชชัน 6 เคส + ค่าที่พัก 2 คืน (นอกฐานภาษี) + หักคืนเงินทดรอง 500.00 */
export function samplePayoutBatch(context: DocumentSampleContext): PayoutBatchDetailDto {
  const commissions = Array.from({ length: 6 }, (_, index) =>
    payoutItem(context, {
      id: `${SAMPLE_ID}-c${index}`,
      sourceId: `${SAMPLE_ID}-ec${index}`,
      caseRef: sampleCaseRef(index + 1),
    }),
  )
  const hotel = payoutItem(context, {
    id: `${SAMPLE_ID}-h1`,
    sourceId: `${SAMPLE_ID}-eh1`,
    description: 'ค่าที่พัก',
    grossSatang: 120_000,
    whtSatang: 0,
    netSatang: 120_000,
    whtBaseIncluded: false,
    transferSatang: 70_000,
    advanceOffsetSatang: 50_000,
    advanceOffsets: [{ advanceId: SAMPLE_ID, advanceRef: context.numbers.advance, amountSatang: 50_000 }],
  })
  const items = [...commissions, hotel]
  const sum = (key: 'grossSatang' | 'whtSatang' | 'netSatang' | 'advanceOffsetSatang' | 'transferSatang'): number =>
    items.reduce((total, row) => total + row[key], 0)
  return {
    id: SAMPLE_ID,
    name: `ค่าตอบแทน ${samplePeriodLabel(context.asOf)} (ตัวอย่าง)`,
    side: 'inhouse',
    status: 'completed',
    grossSatang: sum('grossSatang'),
    whtSatang: sum('whtSatang'),
    netSatang: sum('netSatang'),
    advanceOffsetSatang: sum('advanceOffsetSatang'),
    transferSatang: sum('transferSatang'),
    ...sumPayoutTaxSplit(items),
    itemCount: items.length,
    bankAccountId: SAMPLE_ID,
    bankAccountLabel: `${SAMPLE_BANK.bankName} xxx-x-x0000-x`,
    idempotencyKey: 'PB-SAMPLE',
    paymentFileUrl: null,
    paymentFileGeneratedAt: context.asOf.toISOString(),
    whtPolicy: null,
    createdAt: daysBefore(context.asOf, 1).toISOString(),
    createdByName: 'การเงิน (ตัวอย่าง)',
    updatedAt: context.asOf.toISOString(),
    cancelledAt: null,
    cancelledByName: null,
    cancelReason: null,
    items,
  }
}

export function samplePayoutPayees(): ReadonlyMap<string, PayoutPayeeDocInfo> {
  return new Map([
    [
      SAMPLE_PAYEE_ID,
      {
        displayName: SAMPLE_PAYEE_DISPLAY,
        taxId: SAMPLE_PAYEE.nationalId,
        isCorporate: false,
        address: SAMPLE_PAYEE_ADDRESS,
        branchLabel: null,
        stats: { successCases: 6, fieldDays: 5, hotelNights: 2 },
      },
    ],
  ])
}

// ── เงินทดรอง ─────────────────────────────────────────────────────

export function sampleAdvanceSource(context: DocumentSampleContext): AdvanceDocSource {
  return {
    advanceNumber: context.numbers.advance,
    status: 'cleared',
    requestedSatang: 350_000,
    approvedSatang: 300_000,
    usedSatang: 250_000,
    returnSatang: 50_000,
    purpose: 'ค่าเดินทางและที่พัก งานติดตามทรัพย์ต่างจังหวัด (ตัวอย่าง)',
    dueClearDate: daysAfter(context.asOf, 7),
    createdAt: daysBefore(context.asOf, 2),
    approvedAt: context.asOf,
    clearedAt: context.asOf,
    approverName: 'การเงิน (ตัวอย่าง)',
    teamName: SAMPLE_TEAM,
    payee: { ...SAMPLE_PAYEE },
    payoutBatchName: `ค่าตอบแทน ${samplePeriodLabel(context.asOf)} (ตัวอย่าง)`,
    substituteReceiptNumber: context.numbers.substitute_receipt,
  }
}

export function sampleAdvanceReturnSource(context: DocumentSampleContext): AdvanceReturnDocSource {
  return {
    returnNumber: context.numbers.advance_return,
    channel: 'payout_offset',
    amountSatang: 50_000,
    returnDate: context.asOf,
    payoutBatchName: `ค่าตอบแทน ${samplePeriodLabel(context.asOf)} (ตัวอย่าง)`,
    voucherNumber: context.numbers.payment_voucher,
    reversedAt: null,
    reversalReason: null,
    collectedBeforeSatang: 0,
    advance: sampleAdvanceSource(context),
  }
}

export function sampleSubstituteReceiptSource(context: DocumentSampleContext): SubstituteReceiptDocSource {
  return {
    receiptNumber: context.numbers.substitute_receipt,
    issueDate: context.asOf,
    totalSatang: 26_000,
    lines: [
      { lineDate: daysBefore(context.asOf, 4), description: 'ค่าผ่านทางพิเศษ (ขาไป)', amountSatang: 7_000, note: 'ทางพิเศษ' },
      { lineDate: daysBefore(context.asOf, 4), description: 'ค่ารถจักรยานยนต์รับจ้าง', amountSatang: 4_000, note: null },
      { lineDate: daysBefore(context.asOf, 3), description: 'ค่ารถจักรยานยนต์รับจ้าง', amountSatang: 6_000, note: null },
      { lineDate: daysBefore(context.asOf, 2), description: 'ค่าที่จอดรถ', amountSatang: 2_000, note: null },
      { lineDate: daysBefore(context.asOf, 1), description: 'ค่าผ่านทางพิเศษ (ขากลับ)', amountSatang: 7_000, note: null },
    ],
    payee: { ...SAMPLE_PAYEE },
    teamName: SAMPLE_TEAM,
    reference: { label: 'อ้างอิงเงินทดรอง', value: context.numbers.advance },
  }
}

// ── 50 ทวิ ────────────────────────────────────────────────────────

export function sampleWhtCertificateSource(context: DocumentSampleContext): WhtCertificateDocSource {
  const party = seller(context)
  return {
    certificateNumber: context.numbers.wht_certificate,
    status: 'active',
    cancelReason: null,
    cancelledAt: null,
    replacesCertificateNumber: null,
    deliveryFormat: 'paper',
    filingForm: 'PND3',
    incomeType: 'ค่าจ้างทำของ มาตรา 40(8)',
    paymentDate: context.asOf,
    grossSatang: 480_000,
    whtSatang: 14_400,
    issuedAt: context.asOf,
    payeeType: 'individual',
    incomeCategory: 'sec_40_8',
    whtCondition: 'withhold',
    filingSequence: 1,
    coverage: null,
    payer: {
      name: party.name,
      taxId: party.taxId,
      address: party.address,
      branchLabel: context.letterhead.branchLabel,
    },
    payee: { name: SAMPLE_PAYEE_DISPLAY, taxId: SAMPLE_PAYEE.nationalId, address: SAMPLE_PAYEE_ADDRESS, branchLabel: null },
  }
}

// ── หน้าปกชุดเอกสารบัญชี ───────────────────────────────────────────

export function samplePackCoverInput(context: DocumentSampleContext) {
  return {
    organizationName: context.letterhead.nameTh,
    periodLabel: samplePeriodLabel(context.asOf),
    version: 1,
    generatedByName: 'บัญชี (ตัวอย่าง)',
    generatedAt: context.asOf,
    contentDigest: '0'.repeat(64),
    checks: [
      { key: 'period_ended', label: 'งวดสิ้นเดือนแล้ว', passed: true, detail: '' },
      { key: 'billing_revenue_sync', label: 'ยอดวางบิลตรงกับรายได้ของรอบ', passed: true, detail: '' },
      { key: 'bank_reconcile', label: 'กระทบยอดธนาคารครบ 100%', passed: true, detail: '' },
      { key: 'no_critical_exception', label: 'ไม่มีข้อยกเว้นระดับวิกฤตที่เปิดอยู่', passed: true, detail: '' },
    ] as const,
    // จำนวนแถวสมมติต่อไฟล์ (ไฟล์ละ 4 แถว) + ยอดสรุปสมมติ — ให้เห็นตารางยอดควบคุมครบเหมือนชุดจริง
    controlTotals: {
      rowCounts: Object.fromEntries(PACK_FILES.map((file) => [file.fileName, 4])),
      summary: [
        { label: 'รายได้ก่อนภาษีมูลค่าเพิ่ม', amountSatang: 600_000 },
        { label: 'ภาษีขาย', amountSatang: 42_000 },
        { label: 'ค่าตอบแทนจ่ายแล้ว (ก่อนหัก ณ ที่จ่าย)', amountSatang: 600_000 },
        { label: 'ภาษีหัก ณ ที่จ่ายนำส่ง', amountSatang: 14_400 },
      ],
    },
  }
}
