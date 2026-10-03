/**
 * จับคู่รายการเบิกรอบเดิม → รายการใหม่ที่มาแทน (`41` §10.1 "ไล่ประวัติย้อนหลังได้") — **pure ล้วน**
 *
 * เดิมผูกทุกแถวเก่าเข้ากับแถวใหม่แถวแรก ⇒ ค่าน้ำมันเดิมอาจชี้เบี้ยเลี้ยงใหม่ (UAT BUG-051)
 * กติกา: จับคู่ **ชนิดเดียวกัน** เท่านั้น · ชนิดเดียวกันหลายแถว = เรียงตามวันที่รายการแล้วตาม id จับคู่ทีละตัว ·
 * แถวเก่าที่ไม่มีแถวใหม่ชนิดเดียวกัน (เช่น แผนใหม่ไม่มีค่าน้ำมัน) ⇒ ไม่ผูก (`superseded_by_expense_id` = null)
 * ดีกว่าชี้ผิดตัว — ชุดเก่า/ใหม่ทั้งชุดยังตามได้จาก audit ของ assignment (`supersededExpenseIds`/`expenseIds`)
 */

export interface SupersedeCandidate {
  id: string
  expenseType: string
  /** `YYYY-MM-DD` หรือ ISO — ใช้เรียงลำดับเท่านั้น */
  expenseDate: string
}

export interface SupersedePair {
  supersededId: string
  replacementId: string
}

function byDateThenId(a: SupersedeCandidate, b: SupersedeCandidate): number {
  if (a.expenseDate !== b.expenseDate) return a.expenseDate < b.expenseDate ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

export function pairSupersededExpenses(
  superseded: readonly SupersedeCandidate[],
  replacements: readonly SupersedeCandidate[],
): SupersedePair[] {
  const pool = new Map<string, SupersedeCandidate[]>()
  for (const row of [...replacements].sort(byDateThenId)) {
    pool.set(row.expenseType, [...(pool.get(row.expenseType) ?? []), row])
  }

  const pairs: SupersedePair[] = []
  for (const row of [...superseded].sort(byDateThenId)) {
    const next = pool.get(row.expenseType)?.shift()
    if (next !== undefined) pairs.push({ supersededId: row.id, replacementId: next.id })
  }
  return pairs
}
