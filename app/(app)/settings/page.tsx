import { redirect } from 'next/navigation'
import { requireMenuPage } from '@/lib/nav/menu-guard'

/**
 * การตั้งค่า — mockup `settings.html` ไม่มีหน้า "ราก" ของตัวเอง แต่เปิดมาที่แท็บแรกเสมอ
 * (`renderSettingsLayout` ตั้งค่าเริ่มต้นเป็นแท็บ "ตั้งค่าทั่วไป") ⇒ เปลี่ยนเส้นทางไปแท็บแรก
 * แล้วให้ `<SubNav>` เป็นตัวพาไปแท็บอื่น
 */
export default async function SettingsPage() {
  await requireMenuPage('settings')
  redirect('/settings/roles')
}
