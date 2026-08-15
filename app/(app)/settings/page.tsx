import { redirect } from 'next/navigation'
import { DASHBOARD_PATH } from '@/lib/auth/constants'
import { requireMenuPage } from '@/lib/nav/menu-guard'
import { firstVisibleChildPath } from '@/lib/nav/menu-registry'

/**
 * การตั้งค่า — mockup `settings.html` ไม่มีหน้า "ราก" ของตัวเอง แต่เปิดมาที่แท็บแรกเสมอ
 * (`renderSettingsLayout` ตั้งค่าเริ่มต้นเป็นแท็บ "ตั้งค่าทั่วไป") ⇒ เปลี่ยนเส้นทางไปแท็บแรก
 * แล้วให้ `<SubNav>` เป็นตัวพาไปแท็บอื่น
 *
 * ⚠️ แท็บแรกต่างกันตาม role: `06` §7.2 v1.2 (D17) ให้การเงิน/บัญชีเห็นเมนูนี้แบบ **บางส่วน**
 * (เฉพาะบันทึกการใช้งาน/งานเบื้องหลัง) ⇒ ต้องส่งไป "แท็บแรกที่ผู้ใช้เห็นจริง" ไม่ใช่ `/settings/roles`
 * ตายตัว ไม่งั้นสอง role นี้จะถูกเด้งกลับแดชบอร์ดทันทีตั้งแต่หน้าแรก
 */
export default async function SettingsPage() {
  const user = await requireMenuPage('settings')
  redirect(firstVisibleChildPath(user, 'settings') ?? DASHBOARD_PATH)
}
