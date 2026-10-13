import { signedAdjustmentSatang } from '@/lib/adjustments/adjustment'
import { sumSatang } from '@/lib/finance/satang'
import type { AdjustmentType, CreditNoteType } from '@/lib/generated/prisma/enums'
import type { ReportReconciliation, ReportReconciliationLine } from '@/lib/reports/payload'

/**
 * **บรรทัดกระทบยอดรายงานรายได้ ↔ เอกสารภาษี** (มติ PO 05/10/2569 U44 · `96` §6-F2 · `21`) — pure ล้วน
 *
 * รายงานบริหาร (F2) ใช้ยอด**ก่อน VAT หลัง Adjustment ที่อนุมัติแล้ว** (`22` §6.12) ส่วนยอดในใบกำกับภาษี
 * จะเปลี่ยนก็ต่อเมื่อสำนักงานบัญชีออกใบลดหนี้/ใบเพิ่มหนี้ (ม.86/9–86/10 · U47) ⇒ สองยอดต่างกันได้ชั่วคราว
 * บรรทัดนี้อธิบายส่วนต่างให้ผู้อ่านเห็นทีละก้อน:
 *
 * ```
 *   ยอดตามใบกำกับภาษี (ก่อน VAT — ใบที่ออกจริง)
 * + รับชำระแล้ว รอออกใบกำกับภาษี                (เงินรับที่ยังไม่ออกใบเสร็จฯ — mytester3 LR3-04)
 * + ยังไม่ออกใบกำกับ (รอรับชำระ)                 (ใบกำกับเมื่อรับชำระ — mytester3 J3-03)
 * − ใบลดหนี้ + ใบเพิ่มหนี้                       (เอกสาร active)
 * − Adjustment ลดยอดที่รอใบลดหนี้ + Adjustment เพิ่มยอดที่รอใบเพิ่มหนี้
 *   (ส่วนที่ลดก่อนออกใบ R — ไม่ต้องออกใบลดหนี้ — หักออกจากส่วนที่ยังไม่ออกใบเต็มจำนวน และหักจากบรรทัดนี้ไม่เกินยอดรอใบลดหนี้
 *    ส่วนที่เหลือของ R เป็นของ Adjustment ที่ลดคร่อมและมีใบลดหนี้ส่วนเกินแล้ว ⇒ ไม่แสดงบรรทัดแยก · LR3-04 + J5-01)
 * + รายได้ที่ยังไม่ออกใบกำกับ ± Adjustment ของรายได้นั้น
 * = ยอดคาดหมาย  →  เทียบกับยอดรายงาน (ไม่ลง ⇒ แสดงผลต่าง)
 * ```
 *
 * ### กติกา
 * - เงิน satang จำนวนเต็ม บวก/ลบล้วน **ไม่มีสูตรใหม่** (เครื่องหมาย Adjustment ใช้ `signedAdjustmentSatang()`)
 * - ยอดใบกำกับ = ยอดก่อน VAT ของ**รายได้ในช่วงรายงาน**ที่อยู่ในรอบวางบิลที่มีใบกำกับ active (ส่วนของใบที่ตก
 *   อยู่ในช่วงนี้ — รอบวางบิลที่คร่อมช่วงจึงไม่ดึงยอดนอกช่วงเข้ามา)
 * - Adjustment ที่ "มีเอกสารแล้ว" ไม่ต้องมีบรรทัดของตัวเอง — ยอดของมันถูกแทนด้วยใบลดหนี้/ใบเพิ่มหนี้แล้ว
 *   (ยอดเอกสารไม่เท่ายอด Adjustment ⇒ โผล่เป็นผลต่าง ไม่ถูกกลบ)
 * - Adjustment ระดับรอบวางบิล (มติ U69): F2 กระจายลงรายได้ในรอบตามสัดส่วนยอดเคส ⇒ ผู้เรียกส่งเข้ามาเฉพาะ
 *   **ส่วนที่ตกอยู่กับรายได้ในช่วงรายงาน** (`batchAdjustmentShareInRange()`) — ยอดชุดเดียวกับที่ F2 นับ จึงลงตัว
 * - ใบลดหนี้/ใบเพิ่มหนี้ที่ไม่อ้าง Adjustment ใดของรายงาน ทำให้กระทบยอดไม่ลง ⇒ แสดงผลต่างตามจริง ห้ามปรับให้ลงเอง
 */

/** รายได้ 1 ใบในช่วงรายงาน (ยอดก่อน VAT ก่อนปรับปรุง — `revenues.gross_satang`) */
export interface ReconciliationRevenue {
  grossSatang: number
  /** อยู่ในรอบวางบิลที่มีใบกำกับภาษี `active` */
  invoiced: boolean
}

/** Adjustment ที่อนุมัติแล้วซึ่งผูกกับรายได้/รอบวางบิลของรายงาน (ระดับรอบ = ส่วนที่กระจายลงรายได้ในช่วง — U69) */
export interface ReconciliationAdjustment {
  adjustmentType: AdjustmentType
  amountSatang: number
  /** รายได้/รอบวางบิลต้นทางมีใบกำกับ active */
  invoiced: boolean
  /** มีใบลดหนี้/ใบเพิ่มหนี้ active อ้างถึงแล้ว */
  hasActiveNote: boolean
  /** mytester5 J5-01 — รอบวางบิลต้นทาง (จับคู่กับ {@link ReconciliationInvoicedBatch.batchKey}) · ไม่ส่ง = กองกลาง */
  batchKey?: string
}

/** ใบลดหนี้/ใบเพิ่มหนี้ active ของใบกำกับในรายงาน (ยอดก่อน VAT) */
export interface ReconciliationNote {
  noteType: CreditNoteType
  amountBeforeVatSatang: number
}

/**
 * mytester3 J3-03 — รอบวางบิลที่มีใบกำกับ active (ต่อรอบ) ใช้แยกส่วนที่ "ยังไม่ออกใบกำกับ (รอรับชำระ)"
 * ของใบเสร็จรับเงิน/ใบกำกับภาษีที่ออกเมื่อรับชำระ (`31` §6.2.1) ออกจากยอดตามใบกำกับ
 */
export interface ReconciliationInvoicedBatch {
  /** ยอดก่อน VAT ของใบแจ้งหนี้ทั้งรอบ (`sales_records.total_before_vat_satang`) */
  batchBeforeVatSatang: number
  /** ผลรวมยอดก่อน VAT ของใบกำกับ active ของรอบที่ออกแล้ว ณ วันสิ้นช่วงรายงาน */
  issuedBeforeVatSatang: number
  /** ผลรวมยอดก่อน VAT ของรายได้ในช่วงรายงานที่อยู่ในรอบนี้ */
  inRangeGrossSatang: number
  /**
   * mytester3 LR3-04 — ส่วนที่ลดในมูลค่าที่ยังไม่ออกใบ (ก่อน VAT · `uninvoicedReductionOf()`) — ไม่ต้องออกใบ/ใบลดหนี้ · ไม่ส่ง = 0
   */
  uninvoicedReductionBeforeVatSatang?: number
  /** mytester3 LR3-04 — เงินรับที่ยังไม่ออกใบเสร็จฯ (ก่อน VAT) ณ วันสิ้นช่วง · ไม่ส่ง = 0 */
  receivedNotInvoicedBeforeVatSatang?: number
  /**
   * mytester5 J5-01 — รหัสรอบ: ส่วนที่ลดก่อนออกใบของรอบนี้หักบรรทัด "รอใบลดหนี้" ได้เฉพาะ Adjustment ที่มี `batchKey` เดียวกัน
   * (กันไม่ให้ R ของรอบหนึ่งไปกลบยอดรอใบลดหนี้จริงของอีกรอบ) · ไม่ส่ง = กองกลาง (จับคู่กับ Adjustment ที่ไม่ส่งเช่นกัน)
   */
  batchKey?: string
}

/** ส่วนของรอบที่ตกในช่วงรายงาน (สัดส่วนรายได้ในช่วง ปัดลง) — ใช้สูตรเดียวทุกบรรทัด */
function inRangeShare(amount: number, batch: ReconciliationInvoicedBatch): number {
  if (amount <= 0 || batch.inRangeGrossSatang <= 0) return 0
  if (batch.inRangeGrossSatang >= batch.batchBeforeVatSatang) return amount
  return Math.floor((amount * batch.inRangeGrossSatang) / batch.batchBeforeVatSatang)
}

export interface PendingReceiptBreakdown {
  /** รับชำระแล้ว รอออกใบกำกับภาษี */
  receivedSatang: number
  /** ยังไม่ออกใบกำกับ (รอรับชำระ) */
  awaitingPaymentSatang: number
  /** ส่วนที่ลดก่อนออกใบ (ไม่ต้องออกใบ) */
  reductionSatang: number
}

/**
 * mytester3 LR3-04 — แยกมูลค่าที่ยังไม่ออกใบของรอบ (= {@link pendingReceiptInvoiceSatang} ทุกสตางค์) เป็น 3 ส่วน:
 * ส่วนที่ปรับลดก่อนออกใบ (ไม่ต้องออก) → รับชำระแล้วรอออกใบ (ไม่เกินที่เหลือ) → รอรับชำระ (ที่เหลือ)
 */
function batchBreakdown(batch: ReconciliationInvoicedBatch): PendingReceiptBreakdown {
  const pending = Math.max(0, batch.batchBeforeVatSatang - batch.issuedBeforeVatSatang)
  const reduction = Math.min(pending, Math.max(0, batch.uninvoicedReductionBeforeVatSatang ?? 0))
  const received = Math.min(pending - reduction, Math.max(0, batch.receivedNotInvoicedBeforeVatSatang ?? 0))
  const total = inRangeShare(pending, batch)
  const reductionSatang = Math.min(total, inRangeShare(reduction, batch))
  const receivedSatang = Math.min(total - reductionSatang, inRangeShare(received, batch))
  return { receivedSatang, awaitingPaymentSatang: total - reductionSatang - receivedSatang, reductionSatang }
}

export function pendingReceiptBreakdown(batches: readonly ReconciliationInvoicedBatch[]): PendingReceiptBreakdown {
  let receivedSatang = 0
  let awaitingPaymentSatang = 0
  let reductionSatang = 0
  for (const batch of batches) {
    const parts = batchBreakdown(batch)
    reductionSatang += parts.reductionSatang
    receivedSatang += parts.receivedSatang
    awaitingPaymentSatang += parts.awaitingPaymentSatang
  }
  return { receivedSatang, awaitingPaymentSatang, reductionSatang }
}

/**
 * mytester5 J5-01 — ยอดที่หักออกจากบรรทัด "Adjustment ลดยอดที่รอใบลดหนี้" ได้ = Σ ต่อรอบ min(R ของรอบ, รอใบลดหนี้ของรอบ)
 * · ส่วนที่เหลือของ R เป็นของ Adjustment ที่ลดคร่อมซึ่งมีใบลดหนี้ส่วนเกินแล้ว (G4-01) ⇒ ไม่หักบรรทัดนี้
 */
function awaitingCreditOffsetSatang(
  batches: readonly ReconciliationInvoicedBatch[],
  awaitingDecreases: readonly ReconciliationAdjustment[],
): number {
  const reductionByKey = new Map<string, number>()
  for (const batch of batches) {
    const key = batch.batchKey ?? ''
    reductionByKey.set(key, (reductionByKey.get(key) ?? 0) + batchBreakdown(batch).reductionSatang)
  }
  const awaitingByKey = new Map<string, number>()
  for (const row of awaitingDecreases) {
    const key = row.batchKey ?? ''
    awaitingByKey.set(key, (awaitingByKey.get(key) ?? 0) + row.amountSatang)
  }
  let offset = 0
  for (const [key, reduction] of reductionByKey) offset += Math.min(reduction, awaitingByKey.get(key) ?? 0)
  return offset
}

export interface RevenueReconciliationInput {
  /** ยอดรวมของรายงาน (ยอดก่อน VAT หลัง Adjustment — แถวรวม) */
  reportTotalSatang: number
  revenues: readonly ReconciliationRevenue[]
  adjustments: readonly ReconciliationAdjustment[]
  notes: readonly ReconciliationNote[]
  /** mytester3 J3-03 — ไม่ส่ง = ไม่แยกบรรทัดรอรับชำระ (ใบกำกับเต็มรอบ) */
  invoicedBatches?: readonly ReconciliationInvoicedBatch[]
}

/**
 * mytester3 J3-03 — ส่วนของรายได้ในช่วงที่อยู่ในรอบที่มีใบกำกับ แต่ยังไม่ได้ออกใบ (ใบกำกับเมื่อรับชำระ — รับเงินยังไม่ครบ)
 * = Σ max(0, ใบแจ้งหนี้ก่อน VAT − ใบกำกับที่ออกแล้วก่อน VAT) × (รายได้ในช่วงของรอบ / ใบแจ้งหนี้ทั้งรอบ) ปัดลง
 * · รอบที่อยู่ในช่วงทั้งรอบไม่ต้องสัดส่วน · ใบกำกับเต็มรอบ (ออกตอนวางบิล) ⇒ 0
 */
export function pendingReceiptInvoiceSatang(batches: readonly ReconciliationInvoicedBatch[]): number {
  return sumSatang(
    batches.map((batch) => {
      const pending = Math.max(0, batch.batchBeforeVatSatang - batch.issuedBeforeVatSatang)
      if (pending === 0 || batch.inRangeGrossSatang <= 0) return 0
      if (batch.inRangeGrossSatang >= batch.batchBeforeVatSatang) return pending
      return Math.floor((pending * batch.inRangeGrossSatang) / batch.batchBeforeVatSatang)
    }),
    'ยังไม่ออกใบกำกับ (รอรับชำระ)',
  )
}

export const RECONCILIATION_TITLE = 'กระทบยอดกับใบกำกับภาษี (ยอดก่อน VAT)'

export function buildRevenueReconciliation(input: RevenueReconciliationInput): ReportReconciliation {
  const invoicedRevenueSatang = sumSatang(
    input.revenues.filter((row) => row.invoiced).map((row) => row.grossSatang),
    'รายได้ในรอบที่มีใบกำกับภาษี',
  )
  // mytester3 J3-03 — "ยอดตามใบกำกับภาษี" = ใบที่ออกจริง (ตรง A2) · ส่วนที่รอรับชำระแยกบรรทัด ⇒ ผลรวมเท่าเดิม
  const pendingReceiptSatang = Math.min(
    invoicedRevenueSatang,
    pendingReceiptInvoiceSatang(input.invoicedBatches ?? []),
  )
  const invoicedSatang = invoicedRevenueSatang - pendingReceiptSatang
  // mytester3 LR3-04 — แยก "รับชำระแล้ว รอออกใบ" ออกจาก "รอรับชำระ" · ส่วนที่ปรับลดก่อนออกใบหักออกจากทั้งฝั่งยังไม่ออกใบ
  // และบรรทัด Adjustment ลดยอดด้วยยอดเดียวกัน (ไม่เกินทั้งสองฝั่ง) ⇒ ผลรวมคงเดิม กระทบยอดลงตัวเหมือนเดิม
  const breakdown = pendingReceiptBreakdown(input.invoicedBatches ?? [])
  const uninvoicedSatang = sumSatang(
    input.revenues.filter((row) => !row.invoiced).map((row) => row.grossSatang),
    'รายได้ที่ยังไม่ออกใบกำกับ',
  )
  const creditNotesSatang = sumSatang(
    input.notes.filter((row) => row.noteType === 'credit').map((row) => row.amountBeforeVatSatang),
    'ใบลดหนี้',
  )
  const debitNotesSatang = sumSatang(
    input.notes.filter((row) => row.noteType === 'debit').map((row) => row.amountBeforeVatSatang),
    'ใบเพิ่มหนี้',
  )
  const awaiting = input.adjustments.filter((row) => row.invoiced && !row.hasActiveNote)
  const awaitingCreditSatang = sumSatang(
    awaiting.filter((row) => row.adjustmentType === 'decrease').map((row) => row.amountSatang),
    'รอใบลดหนี้',
  )
  // mytester5 J5-01 — R (ส่วนที่ลดในมูลค่าที่ยังไม่ออกใบ) หักออกจากฝั่งยังไม่ออกใบ**เต็มจำนวน** ไม่ถูกจำกัดด้วยยอดรอใบลดหนี้:
  // Adjustment ที่ลดคร่อม (ส่วนที่ยังไม่ออกใบ + ส่วนเกินที่ออกใบลดหนี้แล้ว — G4-01) มีใบลดหนี้อ้างอยู่ ⇒ ไม่อยู่ในยอดรอใบลดหนี้
  // แต่ส่วน R ของมันยังต้องหักจาก "รอรับชำระ" · บรรทัดรอใบลดหนี้ลดเฉพาะส่วนของ R ที่ตรงกับ Adjustment ที่ยังไม่มีเอกสาร
  // ของรอบเดียวกัน (ต่อรอบ — R ของรอบหนึ่งไม่กลบยอดรอใบลดหนี้ของอีกรอบ)
  const reductionSatang = Math.min(breakdown.reductionSatang, pendingReceiptSatang)
  const pendingReceivedSatang = Math.min(breakdown.receivedSatang, pendingReceiptSatang - reductionSatang)
  const pendingAwaitingPaymentSatang = pendingReceiptSatang - reductionSatang - pendingReceivedSatang
  const awaitingCreditNoteSatang =
    awaitingCreditSatang -
    Math.min(
      reductionSatang,
      awaitingCreditSatang,
      awaitingCreditOffsetSatang(
        input.invoicedBatches ?? [],
        awaiting.filter((row) => row.adjustmentType === 'decrease'),
      ),
    )
  const awaitingDebitSatang = sumSatang(
    awaiting.filter((row) => row.adjustmentType === 'increase').map((row) => row.amountSatang),
    'รอใบเพิ่มหนี้',
  )
  const uninvoicedAdjustmentSatang = sumSatang(
    input.adjustments
      .filter((row) => !row.invoiced)
      .map((row) => signedAdjustmentSatang(row.adjustmentType, row.amountSatang)),
    'Adjustment ของรายได้ที่ยังไม่ออกใบกำกับ',
  )

  const expectedSatang =
    invoicedSatang +
    pendingReceivedSatang +
    pendingAwaitingPaymentSatang -
    creditNotesSatang +
    debitNotesSatang -
    awaitingCreditNoteSatang +
    awaitingDebitSatang +
    uninvoicedSatang +
    uninvoicedAdjustmentSatang
  const differenceSatang = input.reportTotalSatang - expectedSatang

  const lines: ReportReconciliationLine[] = [
    { key: 'invoiced', label: 'ยอดตามใบกำกับภาษี', sign: '+', amountSatang: invoicedSatang },
  ]
  // mytester3 J3-03 — แสดงเฉพาะเมื่อมียอด (ใบกำกับเมื่อรับชำระของรอบที่ยังรับเงินไม่ครบ)
  if (pendingReceivedSatang !== 0) {
    lines.push({
      key: 'receivedNotInvoiced',
      label: 'บวก รับชำระแล้ว รอออกใบกำกับภาษี',
      sign: '+',
      amountSatang: pendingReceivedSatang,
    })
  }
  if (pendingAwaitingPaymentSatang !== 0) {
    lines.push({
      key: 'pendingReceipt',
      label: 'บวก ยังไม่ออกใบกำกับภาษี (รอรับชำระ)',
      sign: '+',
      amountSatang: pendingAwaitingPaymentSatang,
    })
  }
  lines.push(
    { key: 'creditNotes', label: 'หัก ใบลดหนี้', sign: '-', amountSatang: creditNotesSatang },
    { key: 'debitNotes', label: 'บวก ใบเพิ่มหนี้', sign: '+', amountSatang: debitNotesSatang },
    { key: 'awaitingCredit', label: 'หัก Adjustment ลดยอดที่รอใบลดหนี้', sign: '-', amountSatang: awaitingCreditNoteSatang },
    { key: 'awaitingDebit', label: 'บวก Adjustment เพิ่มยอดที่รอใบเพิ่มหนี้', sign: '+', amountSatang: awaitingDebitSatang },
  )
  // บรรทัดของรายได้ที่ยังไม่ออกใบกำกับแสดงเฉพาะเมื่อมียอด — ปกติเป็นรายได้รอวางบิล
  if (uninvoicedSatang !== 0 || uninvoicedAdjustmentSatang !== 0) {
    lines.push(
      { key: 'uninvoiced', label: 'บวก รายได้ที่ยังไม่ออกใบกำกับภาษี', sign: '+', amountSatang: uninvoicedSatang },
      {
        key: 'uninvoicedAdjustments',
        label: 'บวก/หัก Adjustment ของรายได้ที่ยังไม่ออกใบกำกับภาษี',
        sign: '+',
        amountSatang: uninvoicedAdjustmentSatang,
      },
    )
  }
  lines.push({ key: 'reportTotal', label: 'ยอดตามรายงาน', sign: '=', amountSatang: input.reportTotalSatang })
  if (differenceSatang !== 0) {
    lines.push({
      key: 'difference',
      label: 'ผลต่างที่กระทบยอดไม่ลง (ยอดรายงาน − ยอดจากเอกสาร)',
      sign: 'diff',
      amountSatang: differenceSatang,
    })
  }

  return {
    title: RECONCILIATION_TITLE,
    lines,
    differenceSatang,
    balanced: differenceSatang === 0,
    note:
      differenceSatang === 0
        ? 'ยอดรายงานต่างจากใบกำกับภาษีเฉพาะมูลค่าที่ยังไม่ถึงกำหนดออกใบ (รอรับชำระ/รับชำระแล้วรอออกใบ) และ Adjustment ' +
          'ที่ยังรอเอกสารจากสำนักงานบัญชี · ส่วนที่ปรับลดก่อนออกใบกำกับภาษีไม่ต้องออกใบลดหนี้ จึงไม่มีบรรทัดแยก'
        : 'กระทบยอดไม่ลง — อาจมีใบลดหนี้/ใบเพิ่มหนี้ที่ไม่ได้อ้าง Adjustment หรือยอดเอกสารไม่เท่ายอด Adjustment ' +
          'ให้ตรวจสอบกับฝ่ายบัญชี',
  }
}
