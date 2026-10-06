import { calculatePayeeBatchWht, type PayeeTaxProfileValues } from '@/lib/finance/wht-calc'
import type { ExpenseType, PayeeType, PayoutBatchSide, WhtCondition } from '@/lib/generated/prisma/enums'
import { isInWhtBase, isWhtConditionAllowed, resolveIncomeCategory, type WhtPolicyValues } from '@/lib/settings/wht-policy'

/**
 * `15_Accrued_Expenses.csv` (มติ PO 06/10/2569 U94 ข้อ 2) — **ภาษีหัก ณ ที่จ่ายที่คาดว่าจะหัก** ของรายการค้างจ่าย
 * — ชั้น **pure ล้วน ไม่มี I/O** · ไม่มีสูตรของตัวเอง ใช้ `calculatePayeeBatchWht()` (`22` §6.9) ตัวเดียวกับรอบจ่าย
 *
 * - รายการที่อยู่ในรอบจ่ายแล้ว (ยังไม่โอน) ⇒ ใช้ยอด WHT ที่รอบคิดไว้แล้ว (`payout_batch_items.wht_satang`)
 * - รายการที่ยังไม่เข้ารอบ ⇒ จำลองว่าทุกรายการค้างของผู้รับคนนั้นเข้ารอบจ่ายเดียวกัน แล้วคิดด้วยค่าตั้ง WHT ที่มีผล
 *   ณ วันสร้างชุด (เกณฑ์ขั้นต่ำต่อผู้รับต่อรอบ · ฐานตามชนิดรายการ · ประเภทเงินได้ตามฝั่ง/ชนิดผู้รับ)
 *   ⇒ เป็น **ยอดประมาณ** — ยอดจริงขึ้นกับว่ารายการถูกจัดเข้ารอบจ่ายไหนบ้าง
 * - คิดไม่ได้ (ผู้รับ 40(1)/40(2) ยังไม่มีอัตรา · ไม่มี Tax Profile รายคน/ค่าเริ่มต้นตามประเภท และไม่มีอัตราแผน
 *   ของรายการในฐาน — มติ PO U121) ⇒ `null` (ไฟล์เป็น `-`) · รายการนอกฐานไม่ต้องมีอัตรา
 */

export interface AccruedWhtItem {
  payeeId: string
  grossSatang: number
  expenseType: ExpenseType
  /** WHT ของรายการในรอบจ่ายที่ยังไม่โอน · `null` = ยังไม่อยู่ในรอบ */
  batchWhtSatang: number | null
  payeeType: PayeeType
  side: PayoutBatchSide | null
  payeeTaxProfile: PayeeTaxProfileValues | null
  /** Tax Profile ค่าเริ่มต้นตามประเภทผู้รับ (มติ PO U121) · ไม่ระบุ/`null` = ไม่มี */
  typeDefaultTaxProfile?: PayeeTaxProfileValues | null
  planWhtPct: number | null
  section402Pct: number | null
  /**
   * เงื่อนไขการหักของผู้รับ (มติ PO U105) — ค่าตั้งอนุญาต ⇒ (2)/(3) ประมาณแบบทบยอด · ไม่อนุญาต/ไม่ระบุ ⇒ คิดแบบ (1)
   * (รอบจ่ายจะถูกบล็อกจนกว่าจะแก้ — ยอดประมาณใช้วิธีที่ระบบคิดได้)
   */
  whtCondition?: WhtCondition | null
}

/** ยอด WHT ที่คาดว่าจะหัก ต่อรายการ (ลำดับเดียวกับ input) */
export function estimateAccruedWhtSatang(
  items: readonly AccruedWhtItem[],
  policy: Pick<
    WhtPolicyValues,
    'baseExpenseTypes' | 'incomeTypeMode' | 'inhouseIncomeCategory' | 'outsourceIncomeCategory'
  > & Partial<Pick<WhtPolicyValues, 'allowGrossUpConditions'>>,
): (number | null)[] {
  const result: (number | null)[] = items.map((item) => item.batchWhtSatang)
  const byPayee = new Map<string, number[]>()
  items.forEach((item, index) => {
    if (item.batchWhtSatang !== null) return
    const members = byPayee.get(item.payeeId) ?? []
    members.push(index)
    byPayee.set(item.payeeId, members)
  })

  for (const members of byPayee.values()) {
    const first = items[members[0] ?? -1]
    if (first === undefined) continue
    try {
      const { lines, rateMissing } = calculatePayeeBatchWht(
        members.map((index) => {
          const item = items[index]!
          return {
            grossSatang: item.grossSatang,
            includedInBase: isInWhtBase(policy, item.expenseType),
            source: {
              payeeTaxProfile: item.payeeTaxProfile,
              typeDefaultTaxProfile: item.typeDefaultTaxProfile ?? null,
              planWhtPct: item.planWhtPct,
            },
          }
        }),
        {
          incomeCategory: resolveIncomeCategory(policy, first.side, first.payeeType),
          section402Pct: first.section402Pct,
          condition:
            first.whtCondition !== null && first.whtCondition !== undefined &&
            isWhtConditionAllowed({ allowGrossUpConditions: policy.allowGrossUpConditions ?? false }, first.whtCondition)
              ? first.whtCondition
              : 'withhold',
        },
      )
      members.forEach((index, position) => {
        const line = lines[position]
        // มติ PO U121 — รายการในฐานที่ไม่มีอัตรา ⇒ ประมาณไม่ได้ (`-`) · ไม่มีอัตราแต่มีรายการอื่นของผู้รับคนเดียวกัน
        // ⇒ ยอดรวมของผู้รับไม่ครบ จึงเว้นทั้งผู้รับ (รอบจ่ายจะถูกบล็อกจนกว่าจะกำหนดอัตรา)
        result[index] = rateMissing || line === undefined ? null : line.whtSatang
      })
    } catch (error) {
      // ประมาณไม่ได้ (ข้อมูลอัตราไม่ครบ) ⇒ เว้นเป็น `-` ให้สำนักงานบัญชีเห็น ไม่เดาอัตรา (Hybrid Boundary)
      if (!(error instanceof RangeError) && !(error instanceof Error && 'code' in error)) throw error
      members.forEach((index) => {
        result[index] = null
      })
    }
  }
  return result
}
