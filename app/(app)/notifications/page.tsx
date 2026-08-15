import { NotificationCenter } from '@/components/notifications/notification-center'

/**
 * ศูนย์แจ้งเตือน — หน้ารายการเต็ม (`90` §6.3/§14 · mockup `reference/notifications.html`)
 *
 * เข้าถึงจากกระดิ่งบน header ("ดูทั้งหมด") — **ไม่อยู่ใน Top Nav 7 เมนู** ของ `06` §7.1.1
 * ทุก role ที่ล็อกอินได้เห็นหน้านี้ แต่เห็นเฉพาะรายการของตัวเอง (กรองที่ API layer)
 */
export const metadata = { title: 'การแจ้งเตือน — AssetRecovery' }

export default function NotificationsPage() {
  return <NotificationCenter />
}
