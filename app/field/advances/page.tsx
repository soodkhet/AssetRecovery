import type { Metadata } from 'next'
import { AdvancesTab } from '@/components/field/advances-tab'

export const metadata: Metadata = { title: 'เงินทดรองจ่าย' }

/** เงินทดรองจ่ายของพนักงาน (UAT BUG-046 · `15` §5/§12) — ขอเบิก + เคลียร์ยอดของตัวเอง */
export default function FieldAdvancesPage() {
  return <AdvancesTab />
}
