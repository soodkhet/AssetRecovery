/**
 * SSOT ของ **13 แท็บ** ในหน้า "ตั้งค่าบัญชี/การเงิน" (ไฟล์ `13` §6.1–6.13 · §16)
 *
 * pure ล้วน (ค่าคงที่) — ใช้ร่วมทั้ง server component (ตรวจ `?tab=` ที่ส่งเข้ามา) และ client
 * component (แถบแท็บแนวตั้ง) · เพิ่ม/แก้แท็บต้องแก้ที่นี่ที่เดียว
 *
 * ⚠️ mockup `settings.html` มีแท็บที่ 14 ("Payee Profile") — ตัวนั้นเป็นของ **ไฟล์ 18** ไม่ใช่ไฟล์ 13
 * (`13` §16 ยืนยัน 13 แท็บ) จึงไม่อยู่ในรายการนี้
 */

export interface FinanceSettingsTab {
  id: string
  label: string
  /** หัวข้อใน `docs/13-accounting-finance-settings.md` ที่เป็นต้นทางของแท็บนี้ */
  section: string
  /** หน้าจริงพร้อมใช้แล้วหรือยัง — `false` = ยังเป็น placeholder รอ phase ที่ระบุ */
  available: boolean
  plannedPhase?: string
}

export const FINANCE_SETTINGS_TABS: readonly FinanceSettingsTab[] = [
  { id: 'cycles', label: 'รอบบิลและรอบจ่าย', section: '§6.1', available: true },
  { id: 'approval', label: 'สายการอนุมัติ', section: '§6.2 + §6.2.1', available: true },
  { id: 'bank', label: 'บัญชีธนาคารบริษัท', section: '§6.3', available: true },
  { id: 'tax', label: 'กติกาภาษี (Tax Profile)', section: '§6.4', available: false, plannedPhase: '1.12' },
  { id: 'vat', label: 'อัตรา VAT', section: '§6.5', available: false, plannedPhase: '1.12' },
  { id: 'cost', label: 'ศูนย์ต้นทุน', section: '§6.6', available: true },
  { id: 'docs', label: 'รูปแบบเอกสารภายใน', section: '§6.7', available: false, plannedPhase: '1.12' },
  { id: 'bankfile', label: 'ไฟล์โอนธนาคาร', section: '§6.8', available: true },
  { id: 'export', label: 'รูปแบบไฟล์ส่งบัญชี', section: '§6.9', available: false, plannedPhase: '1.12' },
  { id: 'permission', label: 'สิทธิ์บัญชี/การเงิน', section: '§6.10', available: false, plannedPhase: '1.12' },
  { id: 'lock', label: 'การล็อกรอบและ Adjustment', section: '§6.11', available: false, plannedPhase: '1.12' },
  { id: 'numbering', label: 'เลขที่ใบกำกับภาษี', section: '§6.12', available: false, plannedPhase: '1.12' },
  { id: 'taxdoc', label: 'เทมเพลตเอกสารภาษี', section: '§6.13', available: false, plannedPhase: '1.12' },
]

export const DEFAULT_FINANCE_SETTINGS_TAB = 'cycles'

/** แท็บแรกที่ใช้งานได้จริง — ใช้เป็นปลายทางเมื่อ `?tab=` ชี้ไปแท็บที่ยังไม่เกิด */
export function resolveFinanceSettingsTab(tab: string | undefined): string {
  const found = FINANCE_SETTINGS_TABS.find((item) => item.id === tab)
  return found !== undefined && found.available ? found.id : DEFAULT_FINANCE_SETTINGS_TAB
}
