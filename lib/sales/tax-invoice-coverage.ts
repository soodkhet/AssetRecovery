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
 * - ระดับ = **คำเตือน ไม่บล็อก** (แนวเดียวกับ U95 "รับเงินแล้วแต่ยังไม่ออกใบ" · ไม่มี error code บล็อกใน `24`)
 */

export interface CoverageAmounts {
  vatSatang: number
  totalSatang: number
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
  /** ยังมีเงินรับของรอบที่รอออกใบ (คำเตือน U95) ⇒ ข้าม */
  hasReceiptsAwaitingInvoice: boolean
}

export interface TaxInvoiceCoverageMismatch {
  batchNumber: string
  /** ยอดสุทธิของรอบ (รวม VAT) */
  expectedSatang: number
  /** เอกสารสุทธิ (รวม VAT) */
  documentsSatang: number
  /** ยอดสุทธิของรอบ − เอกสารสุทธิ (บวก = ใบกำกับขาด) */
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
    const expected = batch.invoiced.totalSatang + notesTotal
    const documents = batch.taxInvoices.totalSatang + notesTotal
    const settled = batch.receivedSatang + batch.customerWhtSatang + batch.bankFeeSatang
    return {
      batchNumber: batch.batchNumber,
      expected,
      documents,
      settled,
      overpayment: Math.max(0, settled - expected),
      // ใบลด/เพิ่มหนี้หักล้างกันทั้งสองฝั่ง ⇒ ผลต่าง VAT = VAT ใบแจ้งหนี้ − Σ VAT ใบกำกับ
      vatDifference: batch.invoiced.vatSatang - batch.taxInvoices.vatSatang,
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
      .filter((row) => row.expected !== row.documents || row.vatDifference !== 0)
      .map((row) => ({
        batchNumber: row.batchNumber,
        expectedSatang: row.expected,
        documentsSatang: row.documents,
        differenceSatang: row.expected - row.documents,
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
