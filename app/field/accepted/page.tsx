import type { Metadata } from 'next'
import { AcceptedTab } from '@/components/field/accepted-tab'
import { requireInternalSessionPage } from '@/lib/auth/page-guard'

export const metadata: Metadata = { title: 'รับงานแล้ว' }

/**
 * แท็บ "รับงานแล้ว (จัดวันที่)" (`41` §7.3)
 * ต้องรู้ `userId` เพื่อเรียงคอลัมน์ "ฉัน" มาก่อนในมุมมองทีม — อ่านจาก session ฝั่ง server
 */
export default async function FieldAcceptedPage() {
  const user = await requireInternalSessionPage()
  return <AcceptedTab currentUserId={user.id} />
}
