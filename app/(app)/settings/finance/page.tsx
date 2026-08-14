import { FinanceSettingsShell } from '@/components/settings/finance-settings-shell'
import { requireMenuPage } from '@/lib/nav/menu-guard'
import { resolveFinanceSettingsTab } from '@/lib/settings/finance-tabs'

/**
 * ตั้งค่าบัญชี/การเงิน 13 แท็บ (ไฟล์ `13` · `06` §9)
 *
 * route guard เป็นชั้น UX — ข้อมูลจริงมาจาก `/api/settings/*` ที่ตรวจ `requirePermission()` เอง
 * ทุก endpoint (DEC-002) · `?tab=` ที่ชี้ไปแท็บที่ยังไม่เกิดจะตกกลับแท็บแรกเสมอ
 */
export default async function FinanceSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  await requireMenuPage('settings.finance')
  const { tab } = await searchParams
  return <FinanceSettingsShell initialTab={resolveFinanceSettingsTab(tab)} />
}
