/**
 * SSOT ของ **9 แท็บ** ในหน้า "การเงิน" (`06` §8 — ไฟล์ 14–21 · mockup `finance.html`
 * `renderFinanceOperations`) — pure ล้วน ใช้ร่วม server component (ตรวจ `?tab=`) และ client
 *
 * เพิ่ม/เปิดแท็บใหม่ = แก้ `available` ที่นี่ที่เดียว แล้วเสียบ component ใน `<FinanceShell>`
 * (แนวเดียวกับ `lib/settings/finance-tabs.ts` ของหน้าตั้งค่า)
 */

export interface FinanceOperationTab {
  id: string
  label: string
  /** ไฟล์ spec ต้นทางของแท็บนี้ */
  source: string
  /** หน้าจริงพร้อมใช้แล้วหรือยัง — `false` = ปุ่มเทา กดไม่ได้ พร้อมบอกว่าอยู่ Phase ไหน */
  available: boolean
  plannedPhase?: string
}

export const FINANCE_OPERATION_TABS: readonly FinanceOperationTab[] = [
  { id: 'dashboard', label: 'ภาพรวม', source: 'ไฟล์ 14', available: false, plannedPhase: '3.8' },
  { id: 'approval', label: 'รออนุมัติ', source: 'ไฟล์ 15', available: true },
  { id: 'comp', label: 'ค่าตอบแทน', source: 'ไฟล์ 16', available: true },
  { id: 'advances', label: 'เงินทดรองจ่าย', source: 'ไฟล์ 15', available: true },
  { id: 'payout', label: 'รอบจ่ายเงิน', source: 'ไฟล์ 17', available: false, plannedPhase: '3.5' },
  { id: 'revenue', label: 'รายได้และวางบิล', source: 'ไฟล์ 19', available: false, plannedPhase: '3.7' },
  // ไฟล์ 18 ทำเสร็จตั้งแต่ 3.2 แต่หน้าอยู่ในหน้าตั้งค่าการเงิน (`13`) ตาม mockup `settings.html`
  { id: 'payee', label: 'ผู้รับเงิน (Payee)', source: 'ไฟล์ 18', available: false, plannedPhase: '3.2 — อยู่ที่หน้าตั้งค่าการเงิน' },
  { id: 'adjustment', label: 'ปรับปรุง', source: 'ไฟล์ 20', available: false, plannedPhase: '3.7' },
  { id: 'profit', label: 'กำไรและต้นทุน', source: 'ไฟล์ 21', available: false, plannedPhase: '3.8' },
]

export const DEFAULT_FINANCE_OPERATION_TAB = 'approval'

/** แท็บแรกที่ใช้งานได้จริง — `?tab=` ที่ชี้แท็บยังไม่เกิดตกกลับแท็บเริ่มต้นเสมอ */
export function resolveFinanceOperationTab(tab: string | undefined): string {
  const found = FINANCE_OPERATION_TABS.find((item) => item.id === tab)
  return found !== undefined && found.available ? found.id : DEFAULT_FINANCE_OPERATION_TAB
}
