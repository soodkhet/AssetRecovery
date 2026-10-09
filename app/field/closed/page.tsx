import type { Metadata } from 'next'
import { ClosedTab } from '@/components/field/closed-tab'

export const metadata: Metadata = { title: 'จบงาน' }

/** แท็บ "จบงาน" (`41` §7.11) — pill filter 4 ตัว + dropdown เดือน */
export default function FieldClosedPage() {
  return <ClosedTab />
}
