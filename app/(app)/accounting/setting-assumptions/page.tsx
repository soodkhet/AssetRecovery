import type { Metadata } from 'next'
import { SettingAssumptionsView } from '@/components/accounting/setting-assumptions-view'
import { requireMenuPage } from '@/lib/nav/menu-guard'
import { settingAssumptionHrefs } from '@/lib/settings/assumption-overview'

export const metadata: Metadata = { title: 'ค่าตั้งรอนักบัญชียืนยัน' }

/**
 * บัญชี → "ค่าตั้งรอนักบัญชียืนยัน" (มติ PO 07/10/2569 U170 · BUG-180 · `06` §7.2/§8)
 *
 * `requireMenuPage()` = ยามระดับเมนู (UX) — รายการอ่านด้วย `view_master_data` และปุ่มยืนยันตรวจ
 * `manage_accountant_questions` ที่ API (DEC-002) · ลิงก์ไปหน้าตั้งค่าคำนวณที่ server ตามแท็บที่ผู้ใช้เปิดได้จริง
 */
export default async function SettingAssumptionsPage() {
  const user = await requireMenuPage('accounting.setting-assumptions')
  return <SettingAssumptionsView links={settingAssumptionHrefs(user)} />
}
