import {
  calculatePayeeBatchWht,
  isPayerBorneWhtCondition,
  type PayeeTaxProfileValues,
  type WhtRateOrigin,
} from '@/lib/finance/wht-calc'
import type { MonthToDate } from '@/lib/finance/wht-month-to-date'
import type { ExpenseType, PayeeType, PayoutBatchSide, WhtCondition, WhtIncomeCategory } from '@/lib/generated/prisma/enums'
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
 * - ยังไม่เข้ารอบ ⇒ คาดการณ์แบบรอบจ่าย: รวมทุกรายการที่ยังไม่เข้ารอบของผู้รับคนเดียวกันในชุดที่ส่งมา + ยอดสะสมของเดือน
 *   (ค่าตั้งเกณฑ์สะสมต่อเดือน — E-054) แล้วเทียบเกณฑ์ขั้นต่ำครั้งเดียว (mytester F-03 · ดู `approvalWhtPreviews()`)
 *   ยอดจริงอาจต่างได้ตามการจัดรายการเข้ารอบ
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
    /** ประเภทเงินได้รายคน (staging E-021) — ไม่ระบุ/`null` = ตามค่าตั้งองค์กร */
    incomeCategoryOverride?: WhtIncomeCategory | null
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
  /**
   * true = อยู่ในฐานและมีอัตรา แต่ยอดคาดการณ์ต่ำกว่าเกณฑ์ขั้นต่ำ ⇒ ภาษี 0 (staging E-039 — เดิมแสดง "3.00%" คู่ ฿0.00
   * โดยไม่บอกเหตุ) · เฉพาะยอดคาดการณ์ (ยังไม่เข้ารอบจ่าย)
   */
  whtBelowThreshold: boolean
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
  const [preview] = approvalWhtPreviews([{ ...input, payeeId: '' }])
  if (preview === undefined) throw new Error('approvalWhtPreview: คำนวณ WHT ไม่ได้')
  return preview
}

export interface ApprovalWhtGroupInput extends ApprovalWhtInput {
  payeeId: string
}

/**
 * **pure** — ยอด WHT ของหลายรายการพร้อมกัน (mytester F-03): รายการที่ยังไม่เข้ารอบของผู้รับคนเดียวกันคิดเป็นกลุ่มเดียว
 * ด้วย `calculatePayeeBatchWht()` (เกณฑ์ขั้นต่ำเทียบฐานรวม + ยอดสะสมของเดือนเมื่อส่ง `monthToDate`) แทนการคิดเกณฑ์
 * ทีละรายการ (เดิมค่าน้ำมัน/เบี้ยเสี่ยงโชว์ ฿0) · ผู้เรียกเลือกชุดรายการเอง — คิวใช้ `approvalWhtPreviewsForNextBatch()`
 * · ขาดอัตรา 40(1)/40(2) ⇒ ทุกแถวของกลุ่มเตือน (รอบจ่ายปฏิเสธทั้งรอบของผู้รับ) · ลำดับผลลัพธ์ = ลำดับ input
 */
export function approvalWhtPreviews(
  inputs: readonly ApprovalWhtGroupInput[],
  options: { monthToDate?: ReadonlyMap<string, MonthToDate> | null } = {},
): ApprovalWhtPreview[] {
  const result = new Array<ApprovalWhtPreview | undefined>(inputs.length)
  const groups = new Map<string, number[]>()
  inputs.forEach((input, index) => {
    // รายการที่เข้ารอบแล้วไม่ร่วมกลุ่ม — ยอดเป็น snapshot ของรอบ
    const key = input.payoutItem === null ? input.payeeId : `#${index}`
    const members = groups.get(key) ?? []
    members.push(index)
    groups.set(key, members)
  })

  for (const members of groups.values()) {
    const first = inputs[members[0] ?? -1]
    if (first === undefined) continue
    const incomeCategory = resolveIncomeCategory(first.policy, first.payee.side, first.payee.payeeType, first.payee.incomeCategoryOverride ?? null)
    const missing402 =
      usesPerPayeeWhtRate(incomeCategory) &&
      members.some((index) => isInWhtBase(first.policy, inputs[index]!.expenseType)) &&
      first.payee.wht402Pct === null
    const priorMonth = first.payoutItem === null ? (options.monthToDate?.get(first.payeeId) ?? null) : null

    const calc = calculatePayeeBatchWht(
      members.map((index) => {
        const input = inputs[index]!
        return {
          grossSatang: input.grossSatang,
          // ขาดอัตรา 40(1)/40(2) ⇒ รอบจ่ายจะปัดทั้งรอบ — คิวอนุมัติแสดงแบบไม่หักพร้อมคำเตือนแทนการล้ม
          includedInBase: isInWhtBase(input.policy, input.expenseType) && !missing402,
          source: {
            payeeTaxProfile: input.payee.taxProfile,
            typeDefaultTaxProfile: input.payee.typeDefaultTaxProfile ?? null,
            planWhtPct: input.planWhtPct,
          },
        }
      }),
      {
        incomeCategory: missing402 ? 'sec_40_8' : incomeCategory,
        section402Pct: first.payee.wht402Pct,
        condition: first.payee.whtCondition,
        ...(priorMonth === null ? {} : { monthToDate: priorMonth }),
      },
    )

    members.forEach((index, position) => {
      const input = inputs[index]!
      const line = calc.lines[position]
      if (line === undefined) throw new Error('approvalWhtPreviews: คำนวณ WHT ไม่ได้')
      const whtRateSource = line.rate.source
      if (input.payoutItem !== null) {
        result[index] = {
          whtSatang: input.payoutItem.whtSatang,
          netSatang: input.payoutItem.netSatang,
          whtPctUsed: input.payoutItem.whtPctSnapshot ?? line.whtPctUsed,
          whtRateSource,
          whtWarning: null,
          whtPayerBorne: isPayerBorneWhtCondition(input.payoutItem.whtCondition),
          whtFromPayout: true,
          whtBelowThreshold: false,
        }
        return
      }
      result[index] = {
        whtSatang: line.whtSatang,
        // (2)/(3) ⇒ `line.netSatang` = ยอดรายการเต็ม (ภาษีบวกเข้าเงินได้ ไม่ได้หักออก)
        netSatang: line.netSatang,
        whtPctUsed: line.whtPctUsed,
        whtRateSource,
        whtWarning: missing402
          ? WHT_402_RATE_MISSING_WARNING
          : line.rateMissing
            ? WHT_RATE_MISSING_WARNING
            : line.includedInBase
              ? (line.rate.warning ?? null)
              : null,
        whtPayerBorne: isPayerBorneWhtCondition(line.whtCondition),
        whtFromPayout: false,
        whtBelowThreshold: line.includedInBase && line.whtPctUsed > 0 && calc.belowThreshold,
      }
    })
  }

  return result.map((preview) => {
    if (preview === undefined) throw new Error('approvalWhtPreviews: คำนวณ WHT ไม่ครบทุกรายการ')
    return preview
  })
}

export interface ApprovalWhtQueueInput extends ApprovalWhtGroupInput {
  /** `expenses.status = approved` — รอบจ่ายหยิบเฉพาะรายการที่อนุมัติครบแล้ว */
  approved: boolean
}

/**
 * **pure** — ยอด WHT คาดการณ์ของคิวอนุมัติ "ถ้ารายการนี้เข้ารอบจ่ายถัดไป" (mytester F-03 รีวิว):
 * รอบจ่ายหยิบเฉพาะรายการ `approved` ที่ยังไม่เข้ารอบ ⇒ กลุ่มของแต่ละแถว = รายการอนุมัติแล้วของผู้รับคนเดียวกัน
 * (+ ตัวแถวเองถ้ายังไม่อนุมัติ) — รายการรออนุมัติอื่นไม่นับ เพราะยังไม่เข้ารอบ · รายการที่เข้ารอบแล้ว = ยอดของรอบ
 */
export function approvalWhtPreviewsForNextBatch(
  inputs: readonly ApprovalWhtQueueInput[],
  options: { monthToDate?: ReadonlyMap<string, MonthToDate> | null } = {},
): ApprovalWhtPreview[] {
  const result = new Array<ApprovalWhtPreview | undefined>(inputs.length)
  const approvedByPayee = new Map<string, number[]>()
  inputs.forEach((input, index) => {
    if (input.payoutItem !== null) {
      result[index] = approvalWhtPreviews([input], options)[0]
      return
    }
    if (!input.approved) return
    const members = approvedByPayee.get(input.payeeId) ?? []
    members.push(index)
    approvedByPayee.set(input.payeeId, members)
  })
  for (const members of approvedByPayee.values()) {
    const previews = approvalWhtPreviews(members.map((index) => inputs[index]!), options)
    members.forEach((index, position) => {
      result[index] = previews[position]
    })
  }
  inputs.forEach((input, index) => {
    if (input.payoutItem !== null || input.approved) return
    const approved = (approvedByPayee.get(input.payeeId) ?? []).map((member) => inputs[member]!)
    result[index] = approvalWhtPreviews([...approved, input], options).at(-1)
  })
  return result.map((preview) => {
    if (preview === undefined) throw new Error('approvalWhtPreviewsForNextBatch: คำนวณ WHT ไม่ครบทุกรายการ')
    return preview
  })
}
