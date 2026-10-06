import { formatBranch } from '@/lib/format/branch'
import { fmtDate } from '@/lib/format/datetime'
import { estimateCustomerWhtForBilling } from '@/lib/finance/wht-calc'
import { fmtRatePct, fmtSatang } from '@/lib/format/money'
import { bankAccountLine, type DocBankAccount } from '@/lib/organization/bank-account-line'
import type { SellerProfileSnapshot } from '@/lib/organization/profile'
import type { DocumentTemplateSnapshot } from '@/lib/settings/tax-doc-template'
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

export const BILLING_INVOICE_TITLE = 'ใบแจ้งหนี้ / ใบวางบิล'
export const BILLING_INVOICE_TITLE_EN = 'Invoice / Billing Note'
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

// ── snapshot รายละเอียดใบแจ้งหนี้ ณ วันส่ง (มติ PO 07/10/2569 U130) ──────────────

/** รายละเอียดบนใบแจ้งหนี้ที่เดิมอ่านสด — % ภาษีที่ลูกค้าหัก + บัญชีรับเงิน + รายละเอียดทรัพย์ต่อบรรทัด */
export interface BillingInvoiceDetailSnapshot {
  /** NULL = ลูกค้าไม่หักภาษี ณ วันส่ง */
  customerWhtPct: number | null
  receivingAccount: DocBankAccount | null
  /** ต่อรายได้ (`revenues.id`) */
  lines: ReadonlyMap<string, { assetDescription: string | null; handoverDocRef: string | null }>
}

/** snapshot → JSONB (คีย์ snake_case · % เก็บเป็นข้อความทศนิยม 2 ตำแหน่ง ไม่ใช่ float) */
export function billingInvoiceDetailSnapshotJson(snapshot: {
  customerWhtPct: string | null
  receivingAccount: DocBankAccount | null
  lines: readonly { revenueId: string; assetDescription: string | null; handoverDocRef: string | null }[]
}): {
  customer_wht_pct: string | null
  receiving_account: { bank_name: string; account_number: string; account_name: string | null } | null
  lines: { revenue_id: string; asset_description: string | null; handover_doc_ref: string | null }[]
} {
  return {
    customer_wht_pct: snapshot.customerWhtPct,
    receiving_account:
      snapshot.receivingAccount === null
        ? null
        : {
            bank_name: snapshot.receivingAccount.bankName,
            account_number: snapshot.receivingAccount.accountNumber,
            account_name: snapshot.receivingAccount.accountName,
          },
    lines: snapshot.lines.map((line) => ({
      revenue_id: line.revenueId,
      asset_description: line.assetDescription,
      handover_doc_ref: line.handoverDocRef,
    })),
  }
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/** อ่าน JSONB กลับ — `null` = ไม่มี snapshot (รอบที่ส่งก่อน U130) หรือรูปไม่ถูกต้อง ⇒ ผู้เรียกใช้ค่าปัจจุบัน */
export function parseBillingInvoiceDetailSnapshot(value: unknown): BillingInvoiceDetailSnapshot | null {
  const record = recordOf(value)
  if (record === null || !Array.isArray(record['lines'])) return null
  const pctText = textOrNull(record['customer_wht_pct'])
  const pct = pctText === null ? null : Number(pctText)
  if (pct !== null && !Number.isFinite(pct)) return null
  const account = recordOf(record['receiving_account'])
  const bankName = account === null ? null : textOrNull(account['bank_name'])
  const accountNumber = account === null ? null : textOrNull(account['account_number'])
  const lines = new Map<string, { assetDescription: string | null; handoverDocRef: string | null }>()
  for (const entry of record['lines'] as unknown[]) {
    const line = recordOf(entry)
    const revenueId = line === null ? null : textOrNull(line['revenue_id'])
    if (line === null || revenueId === null) continue
    lines.set(revenueId, {
      assetDescription: textOrNull(line['asset_description']),
      handoverDocRef: textOrNull(line['handover_doc_ref']),
    })
  }
  return {
    customerWhtPct: pct,
    receivingAccount:
      bankName === null || accountNumber === null
        ? null
        : { bankName, accountNumber, accountName: account === null ? null : textOrNull(account['account_name']) },
    lines,
  }
}

export interface BillingInvoiceLineSource {
  caseRef: string
  revenueDate: Date
  grossSatang: number
  vatSatang: number
  totalSatang: number
  vatRatePct: string
  /** ยี่ห้อ/รุ่นเครื่องของเคส (มติ PO U100 — บรรทัดรองของรายการ) · ไม่มี = ไม่พิมพ์ */
  assetDescription?: string | null
  /** เลขที่ใบส่งมอบ `DLV-<พ.ศ.>-XXX` ของล็อตที่ส่งมอบเครื่องของเคสนี้ · ไม่มี = ไม่พิมพ์ */
  handoverDocRef?: string | null
}

export interface BillingInvoiceSource {
  batchNumber: string
  period: string
  sentAt: Date | null
  dueDate: Date
  seller: BillingInvoiceParty
  buyer: BillingInvoiceParty
  /** หัวเอกสารส่วนที่ snapshot เพิ่มตอนส่งรอบ (มติ PO U99) — รอบที่ส่งก่อน U99 = `null` (ใช้ค่าปัจจุบันเฉพาะชุดนี้) */
  sellerProfile: SellerProfileSnapshot | null
  /** เทมเพลตเอกสาร (ข้อความท้าย + รูปลายเซ็น) ณ วันส่งรอบ (มติ PO U122) — รอบที่ส่งก่อน U122 = `null` (ไม่พิมพ์) */
  templateSnapshot: DocumentTemplateSnapshot | null
  lines: readonly BillingInvoiceLineSource[]
  /**
   * UAT BUG-165 · มติ PO U100 — อัตราที่ลูกค้าหักภาษี ณ ที่จ่ายจากเรา (`finance_companies` ค่าปัจจุบัน) +
   * ยอดหักที่บันทึกแล้วจากเงินรับ (`billing_batches.wht_withheld_by_customer_satang`) · ไม่ส่ง = ไม่พิมพ์แถวหัก
   */
  customerWhtPct?: number | null
  recordedCustomerWhtSatang?: number
  /** บัญชีรับโอนของเรา (ค่าตั้งบัญชีธนาคาร — ใช้รับเงิน) · ไม่มี = ไม่พิมพ์แถวช่องทางการชำระเงิน */
  receivingAccount?: DocBankAccount | null
}

export interface BillingInvoiceLine {
  no: string
  caseRef: string
  revenueDateLabel: string
  beforeVatText: string
  /** บรรทัดรองใต้รายการ: "รุ่นเครื่อง · ใบส่งมอบ DLV-…" (ไม่มีข้อมูล = `null`) */
  detail: string | null
}

/** แถว "หัก ภาษีที่ลูกค้าจะหัก (ประมาณการ)" + "ยอดที่คาดว่าจะได้รับโอน" — ยอดคิดที่ `22` §6.16 แล้ว */
export interface BillingCustomerWhtLines {
  whtLabel: string
  /** ยอดหักในวงเล็บ `(1,860.00)` */
  whtText: string
  expectedLabel: string
  expectedText: string
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
  /** BUG-165 — ภาษีที่ลูกค้าจะหัก + ยอดคาดรับ (บริษัทไม่หัก = `null` ไม่พิมพ์) */
  customerWht: BillingCustomerWhtLines | null
  /** "โอนเข้าบัญชี …" — ไม่มีบัญชีรับเงิน = `null` (ซ่อนแถว) */
  paymentChannelText: string | null
  /** ผู้เซ็น (มติ PO U101) */
  signers: readonly string[]
  footnote: string
  fileName: string
}

export const BILLING_INVOICE_SIGNERS = ['ผู้วางบิล / ผู้ให้บริการ', 'ผู้รับวางบิล / ลูกค้า'] as const
export const BILLING_INVOICE_FOOTNOTE =
  'ภาษีมูลค่าเพิ่มเกิดเมื่อได้รับชำระเงิน — อัตราและยอดจริงจะแสดงในใบเสร็จรับเงิน/ใบกำกับภาษี · ' +
  'โปรดส่งหนังสือรับรองการหักภาษี ณ ที่จ่ายมาพร้อมการโอน'

/** BUG-165 — แถวภาษีที่ลูกค้าหัก: สูตรอยู่ `estimateCustomerWhtForBilling()` (`22` §6.16) ที่นี่แค่จัดข้อความ */
export function billingCustomerWhtLines(input: {
  amountBeforeVatSatang: number
  totalSatang: number
  recordedWhtSatang: number
  whtPct: number | null
}): BillingCustomerWhtLines | null {
  const result = estimateCustomerWhtForBilling(input)
  if (result.whtSatang <= 0) return null
  return {
    whtLabel: result.isEstimate
      ? `หัก ภาษีเงินได้หัก ณ ที่จ่าย ${fmtRatePct(input.whtPct)} ที่ลูกค้าจะหัก (ประมาณการ)`
      : 'หัก ภาษีเงินได้หัก ณ ที่จ่ายที่ลูกค้าหักแล้ว',
    whtText: `(${fmtSatang(result.whtSatang)})`,
    expectedLabel: result.isEstimate ? 'ยอดที่คาดว่าจะได้รับโอน' : 'ยอดรับสุทธิ',
    expectedText: fmtSatang(result.expectedReceiptSatang),
  }
}

function lineDetail(line: BillingInvoiceLineSource): string | null {
  const parts = [
    (line.assetDescription ?? '').trim(),
    (line.handoverDocRef ?? '').trim() === '' ? '' : `ใบส่งมอบ ${(line.handoverDocRef ?? '').trim()}`,
  ].filter((part) => part !== '')
  return parts.length === 0 ? null : parts.join(' · ')
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
      detail: lineDetail(line),
    })),
    amounts,
    amountBeforeVatText: fmtSatang(amounts.totalBeforeVatSatang),
    vatLabel: `${vatLabelOf(source.lines.map((line) => line.vatRatePct))} (ประมาณการ ณ วันวางบิล)`,
    vatText: fmtSatang(amounts.vatSatang),
    totalText: fmtSatang(amounts.totalSatang),
    totalInWordsText: bahtInWords(amounts.totalSatang),
    notTaxInvoiceNote: BILLING_INVOICE_NOT_TAX_NOTE,
    customerWht:
      source.customerWhtPct === undefined
        ? null
        : billingCustomerWhtLines({
            amountBeforeVatSatang: amounts.totalBeforeVatSatang,
            totalSatang: amounts.totalSatang,
            recordedWhtSatang: source.recordedCustomerWhtSatang ?? 0,
            whtPct: source.customerWhtPct,
          }),
    paymentChannelText:
      source.receivingAccount === undefined || source.receivingAccount === null
        ? null
        : `โอนเข้าบัญชี ${bankAccountLine(source.receivingAccount)}`,
    signers: BILLING_INVOICE_SIGNERS,
    footnote: BILLING_INVOICE_FOOTNOTE,
    fileName: `${source.batchNumber}.pdf`,
  }
}
