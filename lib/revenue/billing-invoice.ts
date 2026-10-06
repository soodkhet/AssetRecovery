import { formatBranch } from '@/lib/format/branch'
import { fmtDate } from '@/lib/format/datetime'
import { fmtSatang } from '@/lib/format/money'
import { bahtInWords } from '@/lib/payout/baht-text'
import { summarizeSalesAmounts, vatLabelOf, type SalesAmounts } from '@/lib/sales/sales'

/**
 * **ใบแจ้งหนี้/ใบวางบิล** (มติ PO 06/10/2569 U95 · U96 #12) — **pure ล้วน ไม่มี I/O**
 *
 * ออกตอนส่งรอบวางบิล (เลข `BL-<พ.ศ.>-NNN` ของรอบ) — **ไม่ใช่เอกสารภาษี ไม่เกิดภาระ VAT**
 * (ค่าบริการ: ความรับผิด VAT เกิดเมื่อรับชำระ ม.78/1(2) ⇒ ใบเสร็จรับเงิน/ใบกำกับภาษีออกตอนรับเงิน)
 * · VAT บนใบแจ้งหนี้ = **ยอดประมาณการ ณ วันวางบิล** (snapshot ของรายได้ในรอบ — ไม่คำนวณใหม่)
 * · ยอดทุกช่องมาจาก snapshot `revenues` (ผลรวม = `sales_records`) — ห้ามคิดสูตรบนเอกสาร (Rule 01)
 */

export const BILLING_INVOICE_TITLE = 'ใบแจ้งหนี้/ใบวางบิล'
export const BILLING_INVOICE_TITLE_EN = 'INVOICE / BILLING NOTE'
export const BILLING_INVOICE_NOT_TAX_NOTE =
  'เอกสารนี้ไม่ใช่ใบกำกับภาษี — ใบเสร็จรับเงิน/ใบกำกับภาษีจะออกให้เมื่อได้รับชำระเงิน'

export interface BillingInvoiceParty {
  name: string
  taxId: string
  address: string
  phone: string | null
  branchCode: string
}

/** แถวคอลัมน์ snapshot ของ `billing_batches` (UAT BUG-164) — `null` ทั้งชุด = รอบยังไม่ได้ส่ง */
export interface BillingPartySnapshotColumns {
  sellerName: string | null
  sellerTaxId: string | null
  sellerAddress: string | null
  sellerPhone: string | null
  sellerBranchCode: string | null
  buyerName: string | null
  buyerTaxId: string | null
  buyerAddress: string | null
  buyerPhone: string | null
  buyerBranchCode: string | null
}

/** ข้อมูลคู่ค้าปัจจุบันขององค์กร/บริษัท ที่ใช้ทำ snapshot ตอนส่งรอบ */
export interface BillingLiveParty {
  name: string
  taxId: string
  address: string | null
  phone: string | null
  branchCode: string
}

/**
 * ค่าที่บันทึกลง `billing_batches` ตอน**ส่งรอบวางบิล** (UAT BUG-164) — ใบแจ้งหนี้ที่ส่งลูกค้าแล้วต้องคงชื่อ/
 * ที่อยู่/เลขผู้เสียภาษีของผู้ขายและผู้ซื้อ ณ วันส่ง แม้แก้ข้อมูลบริษัท/องค์กรภายหลัง (แนวเดียวกับ snapshot ของใบกำกับภาษี)
 */
export function billingPartySnapshotOf(seller: BillingLiveParty, buyer: BillingLiveParty): {
  [K in keyof BillingPartySnapshotColumns]: K extends 'sellerPhone' | 'buyerPhone' ? string | null : string
} {
  return {
    sellerName: seller.name,
    sellerTaxId: seller.taxId,
    sellerAddress: seller.address ?? '',
    sellerPhone: seller.phone,
    sellerBranchCode: seller.branchCode,
    buyerName: buyer.name,
    buyerTaxId: buyer.taxId,
    buyerAddress: buyer.address ?? '',
    buyerPhone: buyer.phone,
    buyerBranchCode: buyer.branchCode,
  }
}

/**
 * คู่ค้าที่พิมพ์บนใบแจ้งหนี้ — อ่านจาก **snapshot ตอนส่งรอบ** เสมอ (ภายใน · พอร์ทัล · Export Pack ได้ค่าเดียวกัน)
 * · รอบที่ส่งแล้วถูก backfill ตอน migrate ทุกใบ ⇒ ค่าสด (`live`) ใช้เฉพาะแถวที่ไม่มี snapshot เท่านั้น
 *   (เช่น ข้อมูลที่ใส่ตรงลงฐานโดยไม่ผ่านการส่งรอบ) — ไม่ใช่ทางปกติ
 */
export function billingInvoicePartiesOf(
  snapshot: BillingPartySnapshotColumns,
  live: { seller: BillingLiveParty; buyer: BillingLiveParty },
): { seller: BillingInvoiceParty; buyer: BillingInvoiceParty } {
  if (snapshot.sellerName !== null && snapshot.buyerName !== null) {
    return {
      seller: {
        name: snapshot.sellerName,
        taxId: snapshot.sellerTaxId ?? '',
        address: snapshot.sellerAddress ?? '',
        phone: snapshot.sellerPhone,
        branchCode: snapshot.sellerBranchCode ?? '00000',
      },
      buyer: {
        name: snapshot.buyerName,
        taxId: snapshot.buyerTaxId ?? '',
        address: snapshot.buyerAddress ?? '',
        phone: snapshot.buyerPhone,
        branchCode: snapshot.buyerBranchCode ?? '00000',
      },
    }
  }
  const fallback = billingPartySnapshotOf(live.seller, live.buyer)
  return {
    seller: {
      name: fallback.sellerName,
      taxId: fallback.sellerTaxId,
      address: fallback.sellerAddress,
      phone: fallback.sellerPhone,
      branchCode: fallback.sellerBranchCode,
    },
    buyer: {
      name: fallback.buyerName,
      taxId: fallback.buyerTaxId,
      address: fallback.buyerAddress,
      phone: fallback.buyerPhone,
      branchCode: fallback.buyerBranchCode,
    },
  }
}

export interface BillingInvoiceLineSource {
  caseRef: string
  revenueDate: Date
  grossSatang: number
  vatSatang: number
  totalSatang: number
  vatRatePct: string
}

export interface BillingInvoiceSource {
  batchNumber: string
  period: string
  sentAt: Date | null
  dueDate: Date
  seller: BillingInvoiceParty
  buyer: BillingInvoiceParty
  lines: readonly BillingInvoiceLineSource[]
}

export interface BillingInvoiceLine {
  no: string
  caseRef: string
  revenueDateLabel: string
  beforeVatText: string
}

export interface BillingInvoiceDoc {
  title: string
  titleEn: string
  documentNumber: string
  issueDateLabel: string
  dueDateLabel: string
  periodLabel: string
  seller: Omit<BillingInvoiceParty, 'branchCode'> & { branchLabel: string }
  buyer: Omit<BillingInvoiceParty, 'branchCode'> & { branchLabel: string }
  description: string
  lines: BillingInvoiceLine[]
  amounts: SalesAmounts
  amountBeforeVatText: string
  vatLabel: string
  vatText: string
  totalText: string
  totalInWordsText: string
  notTaxInvoiceNote: string
  fileName: string
}

function partyOf(party: BillingInvoiceParty): Omit<BillingInvoiceParty, 'branchCode'> & { branchLabel: string } {
  return {
    name: party.name,
    taxId: party.taxId,
    address: party.address,
    phone: party.phone,
    branchLabel: formatBranch(party.branchCode),
  }
}

export function buildBillingInvoiceDoc(source: BillingInvoiceSource): BillingInvoiceDoc {
  const amounts = summarizeSalesAmounts(
    source.lines.map((line) => ({ grossSatang: line.grossSatang, vatSatang: line.vatSatang, totalSatang: line.totalSatang })),
  )
  return {
    title: BILLING_INVOICE_TITLE,
    titleEn: BILLING_INVOICE_TITLE_EN,
    documentNumber: source.batchNumber,
    issueDateLabel: fmtDate(source.sentAt),
    dueDateLabel: fmtDate(source.dueDate),
    periodLabel: source.period,
    seller: partyOf(source.seller),
    buyer: partyOf(source.buyer),
    description: `ค่าบริการติดตามทรัพย์ รอบเดือน ${source.period.trim()}`,
    lines: source.lines.map((line, index) => ({
      no: String(index + 1),
      caseRef: line.caseRef,
      revenueDateLabel: fmtDate(line.revenueDate),
      beforeVatText: fmtSatang(line.grossSatang),
    })),
    amounts,
    amountBeforeVatText: fmtSatang(amounts.totalBeforeVatSatang),
    vatLabel: `${vatLabelOf(source.lines.map((line) => line.vatRatePct))} (ประมาณการ ณ วันวางบิล)`,
    vatText: fmtSatang(amounts.vatSatang),
    totalText: fmtSatang(amounts.totalSatang),
    totalInWordsText: bahtInWords(amounts.totalSatang),
    notTaxInvoiceNote: BILLING_INVOICE_NOT_TAX_NOTE,
    fileName: `${source.batchNumber}.pdf`,
  }
}
