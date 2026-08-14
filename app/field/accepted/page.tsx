import { AcceptedTab } from '@/components/field/accepted-tab'
import { requireSessionPage } from '@/lib/auth/page-guard'

/**
 * แท็บ "รับงานแล้ว (จัดวันที่)" (`41` §7.3)
 * ต้องรู้ `userId` เพื่อเรียงคอลัมน์ "ฉัน" มาก่อนในมุมมองทีม — อ่านจาก session ฝั่ง server
 */
export default async function FieldAcceptedPage() {
  const user = await requireSessionPage()
  return <AcceptedTab currentUserId={user.id} />
}
