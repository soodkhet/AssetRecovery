/**
 * SSOT ของ **9 แท็บ** ในหน้า "บัญชี" (`06` §8 — ไฟล์ 30–37 · mockup `accounting.html`
 * `renderAccountingOperations`) — pure ล้วน ใช้ร่วม server component (ตรวจ `?tab=`) และ client
 *
 * เปิดแท็บใหม่ = แก้ `available` ที่นี่ที่เดียว แล้วเสียบ component ใน `<AccountingShell>`
 * (แนวเดียวกับ `lib/finance/operation-tabs.ts` ของหน้าการเงิน)
 */

export interface AccountingTab {
  id: string
  label: string
  /** ไฟล์ spec ต้นทางของแท็บนี้ */
  source: string
  /** หน้าจริงพร้อมใช้แล้วหรือยัง — `false` = ปุ่มเทา กดไม่ได้ พร้อมบอกว่าอยู่ Phase ไหน */
  available: boolean
  plannedPhase?: string
}

export const ACCOUNTING_TABS: readonly AccountingTab[] = [
  { id: 'closing', label: 'รอบส่งบัญชี', source: 'ไฟล์ 30', available: false, plannedPhase: '4.7' },
  { id: 'sales', label: 'รายได้และขาย', source: 'ไฟล์ 31', available: false, plannedPhase: '4.7' },
  { id: 'receipts', label: 'เงินรับ', source: 'ไฟล์ 31', available: false, plannedPhase: '4.7' },
  { id: 'expenses', label: 'ค่าใช้จ่าย', source: 'ไฟล์ 32', available: true },
  { id: 'bank', label: 'กระทบยอด', source: 'ไฟล์ 35', available: true },
  { id: 'wht', label: 'เอกสาร & WHT', source: 'ไฟล์ 33', available: true },
  { id: 'documents', label: 'เอกสารไม่ครบ', source: 'ไฟล์ 34', available: false, plannedPhase: '4.7' },
  { id: 'qa', label: 'ข้อซักถาม', source: 'ไฟล์ 36', available: true },
  { id: 'export', label: 'ส่งมอบ', source: 'ไฟล์ 37', available: true },
]

/** แท็บเริ่มต้น — "รอบส่งบัญชี" คือหน้าแรกของโมดูล (`30`) แต่ยังไม่เกิดจนถึง Phase 4.7 */
export const DEFAULT_ACCOUNTING_TAB = 'expenses'

/** `?tab=` ที่ชี้แท็บยังไม่เกิดตกกลับแท็บเริ่มต้นเสมอ */
export function resolveAccountingTab(tab: string | undefined): string {
  const found = ACCOUNTING_TABS.find((item) => item.id === tab)
  return found !== undefined && found.available ? found.id : DEFAULT_ACCOUNTING_TAB
}
