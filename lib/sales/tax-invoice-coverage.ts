import { sumSatang } from '@/lib/finance/satang'
import { fmtCount, fmtSatangSymbol } from '@/lib/format/money'

/**
 * **ใบกำกับภาษีครอบเงินที่รับครบไหม** (mytester3 H3-02 · `30` §6.2 · `37` §6.1 Control Totals · หลักการตรวจ `22` §6.8.2)
 * — **pure ล้วน ไม่มี I/O** · ผู้เรียกโหลดยอดต่อรอบวางบิลมาให้ (`loadTaxInvoiceCoverageBatches()`)
 *
 * ต่อรอบวางบิลที่ **รับชำระครบ** (`paid`):
 * ```
 * เอกสารสุทธิ = Σ ใบกำกับ active − Σ ใบลดหนี้ active + Σ ใบเพิ่มหนี้ active
 * ยอดสุทธิของรอบ = ใบแจ้งหนี้ − Σ ใบลดหนี้ + Σ ใบเพิ่มหนี้                       (ยอดตามเอกสาร — U96 #11)
 * ต้องเท่ากันทุกสตางค์ทั้งยอดรวมและ VAT ⇔ Σ ใบกำกับ = ใบแจ้งหนี้
 * ```
 * ผลรวมทั้งงวด: Σ เอกสารสุทธิ เทียบ Σ (เงินรับ + ภาษีลูกค้าหัก + ค่าธรรมเนียมที่ตัด) − ส่วนเกินที่ไม่ออกเอกสาร
 * (รับเกินยอด = ส่วนเกิน ไม่ออกเอกสาร — `22` §6.8.2) ⇒ ผลต่าง = Σ ส่วนที่ใบกำกับขาด/เกินของแต่ละรอบ
 *
 * - รอบที่ยังมีเงินรับรอออกใบ (คำเตือน U95 เดิม) ไม่นำมาตรวจ — ไม่เตือนซ้ำ
 * - รอบที่มีใบอัตรา VAT ต่างจากใบแจ้งหนี้ (U96 #9) ⇒ เทียบเฉพาะยอดก่อน VAT (รีวิว mytester3 #4)
 * - ระดับ = **คำเตือน ไม่บล็อก** (แนวเดียวกับ U95 "รับเงินแล้วแต่ยังไม่ออกใบ" · ไม่มี error code บล็อกใน `24`)
 */

export interface CoverageAmounts {
  vatSatang: number
  totalSatang: number
  /** ยอดก่อน VAT — ใช้เทียบเมื่ออัตรา VAT ของใบต่างจากใบแจ้งหนี้ (`vatRateDiffers`) */
  beforeVatSatang?: number
}

export interface TaxInvoiceCoverageBatch {
  batchNumber: string
  /** ใบแจ้งหนี้ของรอบ (`sales_records` — ยอดเต็มก่อนใบลด/เพิ่มหนี้) */
  invoiced: CoverageAmounts
  /** ผลรวมใบลดหนี้ active ของรอบ */
  creditNotes: CoverageAmounts
  /** ผลรวมใบเพิ่มหนี้ active ของรอบ */
  debitNotes: CoverageAmounts
  /** ผลรวมใบเสร็จรับเงิน/ใบกำกับภาษี (หรือใบกำกับแบบเดิม) active ของรอบ */
  taxInvoices: CoverageAmounts
  /** ยอดรับชำระสะสมของรอบ (`billing_batches`) */
  receivedSatang: number
  customerWhtSatang: number
  bankFeeSatang: number
  /** รอบรับชำระครบ (`paid`) — รอบที่ยังไม่ครบไม่ตรวจ */
  fullyPaid: boolean
  /** ยังมีเงินรับของรอบที่รอออกใบ (คำเตือน U95 — {@link receiptAwaitsTaxInvoice}) ⇒ ข้าม */
  hasReceiptsAwaitingInvoice: boolean
  /**
   * รีวิว mytester3 #4 — มีใบกำกับของรอบที่อัตรา VAT ต่างจากใบแจ้งหนี้ (U96 #9 อัตรา ณ วันรับเงิน) ⇒ VAT/ยอดรวมของใบ
   * ต่างจากใบแจ้งหนี้ได้โดยชอบ ⇒ เทียบเฉพาะ**ยอดก่อน VAT** (มูลค่าบริการต้องออกใบครบ) ข้าม VAT
   */
  vatRateDiffers?: boolean
  /**
   * มติผู้ใช้ 12/10/2569 (รีวิว R3 #1) — ส่วนที่ลดในมูลค่าที่ยังไม่ออกใบ (ไม่ต้องมีใบลดหนี้ — `uninvoicedReductionOf()`)
   * ⇒ หักจากยอดสุทธิของรอบ · ไม่ส่ง = 0
   */
  uninvoicedReduction?: CoverageAmounts
}

/**
 * เงินรับนี้ "รอออกใบเสร็จรับเงิน/ใบกำกับภาษี" ไหม (คำเตือน U95 #6 + ข้อข้ามของ {@link evaluateTaxInvoiceCoverage})
 * - มีใบ active แล้ว / รอบออกใบกำกับแบบเดิมครอบแล้ว ⇒ ไม่รอ
 * - รีวิว mytester3 #5 — รอบรับชำระครบ (`paid`) และ Σ ก่อน VAT ของใบ active ≥ ใบแจ้งหนี้ ⇒ ไม่มีมูลค่าให้ออกใบอีก
 *   (เงินส่วนเพิ่มหนี้/ส่วนเกินหลังใบปิดยอด — ออกใบไม่ได้โดยออกแบบ `TAX_INVOICE_NOTHING_TO_INVOICE`) ⇒ ไม่รอ
 */
export function receiptAwaitsTaxInvoice(input: {
  hasActiveInvoice: boolean
  coveredByLegacyInvoice: boolean
  batchFullyPaid: boolean
  /** Σ ก่อน VAT ของใบ active ของรอบ */
  invoicedBeforeVatSatang: number
  /** ยอดก่อน VAT ตามใบแจ้งหนี้ (`sales_records`) — ไม่มีรายการขาย = `null` */
  billedBeforeVatSatang: number | null
  /** มติผู้ใช้ 12/10/2569 (รีวิว R3 #1) — ส่วนที่ลดก่อนออกใบ (ก่อน VAT) ไม่ต้องออกใบ · ไม่ส่ง = 0 */
  uninvoicedReductionBeforeVatSatang?: number
}): boolean {
  if (input.hasActiveInvoice || input.coveredByLegacyInvoice) return false
  const fullyInvoiced =
    input.billedBeforeVatSatang !== null &&
    input.invoicedBeforeVatSatang >= input.billedBeforeVatSatang - (input.uninvoicedReductionBeforeVatSatang ?? 0)
  return !(input.batchFullyPaid && fullyInvoiced)
}

export interface TaxInvoiceCoverageMismatch {
  batchNumber: string
  /** ยอดสุทธิของรอบ (รวม VAT) */
  expectedSatang: number
  /** เอกสารสุทธิ (รวม VAT) */
  documentsSatang: number
  /** ยอดสุทธิของรอบ − เอกสารสุทธิ (บวก = ใบกำกับขาด) · รอบอัตรา VAT ต่างกัน = ผลต่างยอดก่อน VAT */
  differenceSatang: number
  /** ผลต่างเฉพาะ VAT (บวก = ภาษีขายขาด) */
  vatDifferenceSatang: number
}

export interface TaxInvoiceCoverageResult {
  /** จำนวนรอบที่ตรวจ */
  checkedCount: number
  /** Σ เอกสารสุทธิ (ใบกำกับ − ใบลดหนี้ + ใบเพิ่มหนี้) ของรอบที่ตรวจ */
  documentsSatang: number
  /** Σ (เงินรับ + ภาษีลูกค้าหัก + ค่าธรรมเนียมที่ตัด) ของรอบที่ตรวจ */
  settledSatang: number
  /** Σ ส่วนที่รับเกินยอดสุทธิของรอบ (ไม่ออกเอกสาร) */
  overpaymentSatang: number
  /** settled − overpayment − documents (0 = ครอบครบ) */
  differenceSatang: number
  mismatches: readonly TaxInvoiceCoverageMismatch[]
}

export function evaluateTaxInvoiceCoverage(batches: readonly TaxInvoiceCoverageBatch[]): TaxInvoiceCoverageResult {
  const checked = batches.filter((batch) => batch.fullyPaid && !batch.hasReceiptsAwaitingInvoice)
  const rows = checked.map((batch) => {
    const notesTotal = batch.debitNotes.totalSatang - batch.creditNotes.totalSatang
    const reduction = batch.uninvoicedReduction ?? { beforeVatSatang: 0, vatSatang: 0, totalSatang: 0 }
    const expected = batch.invoiced.totalSatang - reduction.totalSatang + notesTotal
    const documents = batch.taxInvoices.totalSatang + notesTotal
    const settled = batch.receivedSatang + batch.customerWhtSatang + batch.bankFeeSatang
    if (batch.vatRateDiffers === true) {
      // รีวิว mytester3 #4 — อัตราต่างกัน ⇒ เทียบมูลค่าก่อน VAT (ใบลด/เพิ่มหนี้หักล้างกันทั้งสองฝั่ง) ข้าม VAT/ยอดรวม
      const beforeVatDifference =
        (batch.invoiced.beforeVatSatang ?? 0) - (reduction.beforeVatSatang ?? 0) - (batch.taxInvoices.beforeVatSatang ?? 0)
      // ครอบครบ ⇒ ยอดรวมของใบ (อัตราใหม่) คือยอดที่ถูกต้องของรอบ
      const target = beforeVatDifference === 0 ? documents : expected
      return {
        batchNumber: batch.batchNumber,
        expected: target,
        documents,
        settled,
        overpayment: Math.max(0, settled - target),
        mismatch: beforeVatDifference !== 0,
        difference: beforeVatDifference,
        vatDifference: 0,
      }
    }
    // ใบลด/เพิ่มหนี้หักล้างกันทั้งสองฝั่ง ⇒ ผลต่าง VAT = VAT ใบแจ้งหนี้ − Σ VAT ใบกำกับ
    const vatDifference = batch.invoiced.vatSatang - reduction.vatSatang - batch.taxInvoices.vatSatang
    return {
      batchNumber: batch.batchNumber,
      expected,
      documents,
      settled,
      overpayment: Math.max(0, settled - expected),
      mismatch: expected !== documents || vatDifference !== 0,
      difference: expected - documents,
      vatDifference,
    }
  })
  const documentsSatang = sumSatang(rows.map((row) => row.documents), 'เอกสารสุทธิ')
  const settledSatang = sumSatang(rows.map((row) => row.settled), 'ยอดรับชำระ')
  const overpaymentSatang = sumSatang(rows.map((row) => row.overpayment), 'ส่วนเกินที่ไม่ออกเอกสาร')
  return {
    checkedCount: rows.length,
    documentsSatang,
    settledSatang,
    overpaymentSatang,
    differenceSatang: settledSatang - overpaymentSatang - documentsSatang,
    mismatches: rows
      .filter((row) => row.mismatch)
      .map((row) => ({
        batchNumber: row.batchNumber,
        expectedSatang: row.expected,
        documentsSatang: row.documents,
        differenceSatang: row.difference,
        vatDifferenceSatang: row.vatDifference,
      })),
  }
}

/** แสดงเลขรอบในคำเตือนไม่เกินเท่านี้ */
const MISMATCH_NUMBERS_SHOWN = 5

/** คำเตือนในหน้าต่างตรวจความพร้อม — ไม่มีรอบที่ใบกำกับไม่ครอบ ⇒ `null` */
export function taxInvoiceCoverageWarning(result: TaxInvoiceCoverageResult | undefined): string | null {
  if (result === undefined || result.mismatches.length === 0) return null
  const shown = result.mismatches.slice(0, MISMATCH_NUMBERS_SHOWN).map(
    (row) => `${row.batchNumber} ต่าง ${fmtSatangSymbol(row.differenceSatang)}`,
  )
  const more = result.mismatches.length - shown.length
  return (
    `ใบเสร็จรับเงิน/ใบกำกับภาษีไม่ครอบยอดของรอบที่รับชำระครบ ${fmtCount(result.mismatches.length)} รอบ ` +
    `(${shown.join(', ')}${more > 0 ? ` และอีก ${fmtCount(more)} รอบ` : ''}) — ` +
    'ยอดใบกำกับ − ใบลดหนี้ + ใบเพิ่มหนี้ต้องเท่ายอดสุทธิของรอบ ภาษีขายอาจขาด/เกิน ' +
    'ตรวจที่แท็บรายได้และขาย และแจ้งสำนักงานบัญชีก่อนส่ง · ปิดงวดได้'
  )
}
