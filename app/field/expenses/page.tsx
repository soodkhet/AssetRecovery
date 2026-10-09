import type { Metadata } from 'next'
import { ExpensesTab } from '@/components/field/expenses-tab'
import { EXPENSE_VIEW_TYPES, type ExpenseViewType } from '@/lib/field/schemas'

export const metadata: Metadata = { title: 'เบิกค่าใช้จ่าย' }

/**
 * เบิกค่าใช้จ่าย (`41` §7.9) — 2 ขอบแท็บ (ผูกกับเคส / เบิกแยก)
 * `?view=separate` เปิดแท็บเบิกแยกตรง ๆ (ลิงก์จากแจ้งเตือน "รายการเบิกถูกตีกลับ" · UAT BUG-099) — ค่าอื่น = ผูกกับเคส
 */
export default async function FieldExpensesPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams
  const initialView: ExpenseViewType = EXPENSE_VIEW_TYPES.find((item) => item === view) ?? 'caseBound'
  return <ExpensesTab initialView={initialView} />
}
