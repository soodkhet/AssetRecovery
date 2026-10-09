import type { Metadata } from 'next'
import { PendingAcceptTab } from '@/components/field/pending-accept-tab'

export const metadata: Metadata = { title: 'รอรับงาน' }

/** แท็บ "รอรับงาน" (`41` §7.2) — รวม Agent Accept UI ของไฟล์ 40 */
export default function FieldPendingPage() {
  return <PendingAcceptTab />
}
