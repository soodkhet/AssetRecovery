import {
  calculatePayeeBatchWht,
  isPayerBorneWhtCondition,
  type PayeeTaxProfileValues,
  type WhtRateOrigin,
} from '@/lib/finance/wht-calc'
import type { ExpenseType, PayeeType, PayoutBatchSide, WhtCondition } from '@/lib/generated/prisma/enums'
import {
  isInWhtBase,
  resolveIncomeCategory,
  usesPerPayeeWhtRate,
  type WhtPolicyValues,
} from '@/lib/settings/wht-policy'

/**
 * ยอด WHT / Net ที่คิวอนุมัติแสดงต่อรายการ (BUG-176) — **pure** · ใช้สูตรเดียวกับตอนสร้างรอบจ่าย
 * (`calculatePayeeBatchWht()` + ค่าตั้งฐาน WHT/ประเภทเงินได้/เงื่อนไขการหัก (1)(2)(3)) ห้ามประกอบสูตรเอง
 *
 * - รายการ**เข้ารอบจ่ายแล้ว** ⇒ ใช้ยอดที่บันทึกไว้ในรายการรอบจ่าย (snapshot — ยอดที่โอนจริง) ไม่คิดใหม่
 * - ยังไม่เข้ารอบ ⇒ คาดการณ์จากรายการเดียว (เกณฑ์ขั้นต่ำจริงเทียบกับฐานรวมทั้งรอบ ยอดจริงอาจต่างได้)
 * - (2)/(3) บริษัทออกภาษีให้ ⇒ ผู้รับได้ยอดเต็ม (`net = gross`) · `whtSatang` = ภาษีที่บริษัทออกให้
 */

export interface ApprovalWhtPayoutSnapshot {
  whtSatang: number
  netSatang: number
  whtPctSnapshot: number | null
  whtCondition: WhtCondition | null
}

export interface ApprovalWhtInput {
  grossSatang: number
  expenseType: ExpenseType
  planWhtPct: number | null
  payee: {
    taxProfile: PayeeTaxProfileValues | null
    wht402Pct: number | null
    whtCondition: WhtCondition
    payeeType: PayeeType
    side: PayoutBatchSide | null
    /** Tax Profile ค่าเริ่มต้นตามประเภทผู้รับ (ฝั่ง × ชนิด — มติ PO U121) · ไม่ระบุ/`null` = ไม่มี */
    typeDefaultTaxProfile?: PayeeTaxProfileValues | null
  }
  policy: Pick<
    WhtPolicyValues,
    'baseExpenseTypes' | 'incomeTypeMode' | 'inhouseIncomeCategory' | 'outsourceIncomeCategory'
  >
  /** รายการรอบจ่ายที่ผูกอยู่ (`expenses.payout_batch_item_id`) — `null` = ยังไม่เข้ารอบ */
  payoutItem: ApprovalWhtPayoutSnapshot | null
}

export interface ApprovalWhtPreview {
  whtSatang: number
  netSatang: number
  whtPctUsed: number
  /** `none` = ไม่ได้ใช้อัตรา (รายการไม่อยู่ในฐาน WHT หรือไม่มีอัตราเลย) */
  whtRateSource: WhtRateOrigin
  whtWarning: string | null
  /** true = บริษัทออกภาษีให้ (เงื่อนไข (2)/(3)) — ไม่หักจากผู้รับ */
  whtPayerBorne: boolean
  /** true = ยอดมาจากรายการรอบจ่ายที่บันทึกแล้ว */
  whtFromPayout: boolean
}

export const WHT_402_RATE_MISSING_WARNING =
  'ผู้รับเงินยังไม่มีอัตราหัก ณ ที่จ่ายแบบรายบุคคล — ต้องกำหนดก่อนสร้างรอบจ่าย (ยอดภาษีที่แสดงยังไม่รวม)'

/**
 * มติ PO 06/10/2569 U121 — รายการในฐานแต่ไม่มีอัตราเลย ⇒ คิวอนุมัติแสดงคำเตือนต่อแถว (ไม่ล้มทั้งหน้า)
 * และรอบจ่ายถูกบล็อก (`WHT_RATE_MISSING`)
 */
export const WHT_RATE_MISSING_WARNING =
  'ผู้รับเงินยังไม่มีอัตราหัก ณ ที่จ่าย (ไม่มี Tax Profile รายคน ไม่มีค่าเริ่มต้นตามประเภทผู้รับ และรายการไม่มีอัตราจากแผน) — ต้องกำหนดก่อนสร้างรอบจ่าย (ยอดภาษีที่แสดงยังไม่รวม)'

export function approvalWhtPreview(input: ApprovalWhtInput): ApprovalWhtPreview {
  const incomeCategory = resolveIncomeCategory(input.policy, input.payee.side, input.payee.payeeType)
  const includedInBase = isInWhtBase(input.policy, input.expenseType)
  const missing402 = usesPerPayeeWhtRate(incomeCategory) && includedInBase && input.payee.wht402Pct === null

  const [line] = calculatePayeeBatchWht(
    [
      {
        grossSatang: input.grossSatang,
        // ขาดอัตรา 40(1)/40(2) ⇒ รอบจ่ายจะปัดทั้งรอบ — คิวอนุมัติแสดงแบบไม่หักพร้อมคำเตือนแทนการล้ม
        includedInBase: includedInBase && !missing402,
        source: {
          payeeTaxProfile: input.payee.taxProfile,
          typeDefaultTaxProfile: input.payee.typeDefaultTaxProfile ?? null,
          planWhtPct: input.planWhtPct,
        },
      },
    ],
    {
      incomeCategory: missing402 ? 'sec_40_8' : incomeCategory,
      section402Pct: input.payee.wht402Pct,
      condition: input.payee.whtCondition,
    },
  ).lines
  if (line === undefined) throw new Error('approvalWhtPreview: คำนวณ WHT ไม่ได้')

  const whtRateSource = line.rate.source
  const whtWarning = missing402
    ? WHT_402_RATE_MISSING_WARNING
    : line.rateMissing
      ? WHT_RATE_MISSING_WARNING
      : line.includedInBase
        ? (line.rate.warning ?? null)
        : null

  if (input.payoutItem !== null) {
    return {
      whtSatang: input.payoutItem.whtSatang,
      netSatang: input.payoutItem.netSatang,
      whtPctUsed: input.payoutItem.whtPctSnapshot ?? line.whtPctUsed,
      whtRateSource,
      whtWarning: null,
      whtPayerBorne: isPayerBorneWhtCondition(input.payoutItem.whtCondition),
      whtFromPayout: true,
    }
  }

  return {
    whtSatang: line.whtSatang,
    // (2)/(3) ⇒ `line.netSatang` = ยอดรายการเต็ม (ภาษีบวกเข้าเงินได้ ไม่ได้หักออก)
    netSatang: line.netSatang,
    whtPctUsed: line.whtPctUsed,
    whtRateSource,
    whtWarning,
    whtPayerBorne: isPayerBorneWhtCondition(line.whtCondition),
    whtFromPayout: false,
  }
}
