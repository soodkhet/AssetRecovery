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
 *   ยอดตามใบกำกับภาษี (ก่อน VAT)
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
 * - ใบลดหนี้/ใบเพิ่มหนี้ที่ไม่อ้าง Adjustment ใดของรายงาน และ Adjustment ระดับรอบวางบิล (รายงานไม่ได้หัก)
 *   ทำให้กระทบยอดไม่ลง ⇒ แสดงผลต่างตามจริง ห้ามปรับให้ลงเอง
 */

/** รายได้ 1 ใบในช่วงรายงาน (ยอดก่อน VAT ก่อนปรับปรุง — `revenues.gross_satang`) */
export interface ReconciliationRevenue {
  grossSatang: number
  /** อยู่ในรอบวางบิลที่มีใบกำกับภาษี `active` */
  invoiced: boolean
}

/** Adjustment ที่อนุมัติแล้วซึ่งผูกกับรายได้/รอบวางบิลของรายงาน */
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

export interface RevenueReconciliationInput {
  /** ยอดรวมของรายงาน (ยอดก่อน VAT หลัง Adjustment — แถวรวม) */
  reportTotalSatang: number
  revenues: readonly ReconciliationRevenue[]
  adjustments: readonly ReconciliationAdjustment[]
  notes: readonly ReconciliationNote[]
}

export const RECONCILIATION_TITLE = 'กระทบยอดกับใบกำกับภาษี (ยอดก่อน VAT)'

export function buildRevenueReconciliation(input: RevenueReconciliationInput): ReportReconciliation {
  const invoicedSatang = sumSatang(
    input.revenues.filter((row) => row.invoiced).map((row) => row.grossSatang),
    'ยอดตามใบกำกับภาษี',
  )
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
    invoicedSatang -
    creditNotesSatang +
    debitNotesSatang -
    awaitingCreditSatang +
    awaitingDebitSatang +
    uninvoicedSatang +
    uninvoicedAdjustmentSatang
  const differenceSatang = input.reportTotalSatang - expectedSatang

  const lines: ReportReconciliationLine[] = [
    { key: 'invoiced', label: 'ยอดตามใบกำกับภาษี', sign: '+', amountSatang: invoicedSatang },
    { key: 'creditNotes', label: 'หัก ใบลดหนี้', sign: '-', amountSatang: creditNotesSatang },
    { key: 'debitNotes', label: 'บวก ใบเพิ่มหนี้', sign: '+', amountSatang: debitNotesSatang },
    { key: 'awaitingCredit', label: 'หัก Adjustment ลดยอดที่รอใบลดหนี้', sign: '-', amountSatang: awaitingCreditSatang },
    { key: 'awaitingDebit', label: 'บวก Adjustment เพิ่มยอดที่รอใบเพิ่มหนี้', sign: '+', amountSatang: awaitingDebitSatang },
  ]
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
        : 'กระทบยอดไม่ลง — อาจมีใบลดหนี้/ใบเพิ่มหนี้ที่ไม่ได้อ้าง Adjustment, ยอดเอกสารไม่เท่ายอด Adjustment ' +
          'หรือ Adjustment ระดับรอบวางบิลที่รายงานไม่ได้นำมาปรับ ให้ตรวจสอบกับฝ่ายบัญชี',
  }
}
