import type { Metadata } from 'next'
import { IncomeSummary } from '@/components/field/income-summary'

export const metadata: Metadata = { title: 'สรุปรายได้' }

/** สรุปรายได้ (`41` §7.10) — สะสมตลอด + กรองรายเดือน */
export default function FieldIncomePage() {
  return <IncomeSummary />
}
