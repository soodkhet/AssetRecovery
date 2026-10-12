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
 * + ยังไม่ออกใบกำกับ (รอรับชำระ)                 (ใบกำกับเมื่อรับชำระ — mytester3 J3-03)
 * − ใบลดหนี้ + ใบเพิ่มหนี้                       (เอกสาร active)
 * − Adjustment ลดยอดที่รอใบลดหนี้ + Adjustment เพิ่มยอดที่รอใบเพิ่มหนี้
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
    pendingReceiptSatang -
    creditNotesSatang +
    debitNotesSatang -
    awaitingCreditSatang +
    awaitingDebitSatang +
    uninvoicedSatang +
    uninvoicedAdjustmentSatang
  const differenceSatang = input.reportTotalSatang - expectedSatang

  const lines: ReportReconciliationLine[] = [
    { key: 'invoiced', label: 'ยอดตามใบกำกับภาษี', sign: '+', amountSatang: invoicedSatang },
  ]
  // mytester3 J3-03 — แสดงเฉพาะเมื่อมียอด (ใบกำกับเมื่อรับชำระของรอบที่ยังรับเงินไม่ครบ)
  if (pendingReceiptSatang !== 0) {
    lines.push({
      key: 'pendingReceipt',
      label: 'บวก ยังไม่ออกใบกำกับภาษี (รอรับชำระ)',
      sign: '+',
      amountSatang: pendingReceiptSatang,
    })
  }
  lines.push(
    { key: 'creditNotes', label: 'หัก ใบลดหนี้', sign: '-', amountSatang: creditNotesSatang },
    { key: 'debitNotes', label: 'บวก ใบเพิ่มหนี้', sign: '+', amountSatang: debitNotesSatang },
    { key: 'awaitingCredit', label: 'หัก Adjustment ลดยอดที่ไม่มีใบลดหนี้ (รอออก หรือไม่ต้องออก)', sign: '-', amountSatang: awaitingCreditSatang },
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
        ? 'ยอดรายงานต่างจากใบกำกับภาษีเฉพาะ Adjustment ที่ยังรอเอกสารจากสำนักงานบัญชี'
        : 'กระทบยอดไม่ลง — อาจมีใบลดหนี้/ใบเพิ่มหนี้ที่ไม่ได้อ้าง Adjustment หรือยอดเอกสารไม่เท่ายอด Adjustment ' +
          'ให้ตรวจสอบกับฝ่ายบัญชี',
  }
}
