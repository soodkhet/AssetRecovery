import { hasCapability, type CapabilityHolder } from '@/lib/auth/permission'

/**
 * SSOT ของ **10 แท็บ** ในหน้า "บัญชี" (`06` §8 — ไฟล์ 30–37 · mockup `accounting.html`
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
  /**
   * capability ที่ **API อ่านหลักของแท็บนี้** รับ (ถืออย่างใดอย่างหนึ่งระดับ `view` ⇒ เห็นแท็บ · Superadmin เห็นทุกแท็บ)
   * — แท็บที่อ่านไม่ได้ **ซ่อน** แทนการโชว์การ์ด ฿0.00 + ตาราง "ไม่มีสิทธิ์ใช้งาน" (BUG-158 · แนวเดียวกับหน้าการเงิน UAT R6-F)
   * ⚠️ ต้องตรงกับ `withApiPermission()` ของ endpoint ที่แท็บเรียก (ล็อกด้วย `accounting-tabs.test.ts`)
   * เขียนเป็นสตริงตรง ๆ เพราะไฟล์นี้ถูก import ฝั่ง client (ห้ามดึงโมดูล server เข้ามา)
   */
  capabilities: readonly string[]
}

export const ACCOUNTING_TABS: readonly AccountingTab[] = [
  {
    id: 'closing',
    label: 'รอบส่งบัญชี',
    source: 'ไฟล์ 30',
    available: true,
    capabilities: ['manage_accounting_period', 'unlock_period'],
  },
  {
    id: 'sales',
    label: 'รายได้และขาย',
    source: 'ไฟล์ 31',
    available: true,
    capabilities: ['manage_sales_expenses', 'manage_tax_invoice'],
  },
  {
    id: 'receipts',
    label: 'เงินรับ',
    source: 'ไฟล์ 31',
    available: true,
    capabilities: ['manage_sales_expenses', 'manage_tax_invoice'],
  },
  {
    id: 'expenses',
    label: 'ค่าใช้จ่าย',
    source: 'ไฟล์ 32',
    available: true,
    capabilities: ['manage_sales_expenses', 'map_cost_center'],
  },
  { id: 'bank', label: 'กระทบยอด', source: 'ไฟล์ 35', available: true, capabilities: ['manage_bank_reconciliation'] },
  { id: 'wht', label: 'เอกสาร & WHT', source: 'ไฟล์ 33', available: true, capabilities: ['manage_wht'] },
  {
    id: 'documents',
    label: 'เอกสารไม่ครบ',
    source: 'ไฟล์ 34',
    available: true,
    capabilities: ['manage_exceptions', 'authorize_exception'],
  },
  { id: 'qa', label: 'ข้อซักถาม', source: 'ไฟล์ 36', available: true, capabilities: ['manage_accountant_questions'] },
  { id: 'export', label: 'ส่งมอบ', source: 'ไฟล์ 37', available: true, capabilities: ['export_accounting_pack'] },
  // มติ PO 05/10/2569 U40 — ติดตาม/บันทึกรับหนังสือ 50 ทวิ ที่ลูกค้าหักเรา (ใช้ component เดียวกับหน้าการเงิน)
  {
    id: 'customer-wht',
    label: '50 ทวิ ลูกค้า',
    source: 'ไฟล์ 31',
    available: true,
    capabilities: ['manage_customer_wht'],
  },
]

/** แท็บเริ่มต้น — "รอบส่งบัญชี" คือหน้าแรกของโมดูล (`30` §8 — ปิดงวดคือแกนของงานบัญชี) */
export const DEFAULT_ACCOUNTING_TAB = 'closing'

/** แท็บที่ผู้ใช้คนนี้เห็น — ถือ capability อ่านของแท็บนั้นสักตัว (Superadmin เห็นทุกแท็บ · BUG-158) */
export function visibleAccountingTabs(viewer: CapabilityHolder): AccountingTab[] {
  return ACCOUNTING_TABS.filter((tab) => tab.capabilities.some((capability) => hasCapability(viewer, 'view', capability)))
}

/**
 * `?tab=` ที่ชี้แท็บยังไม่เกิด/ไม่มีจริง/**ไม่มีสิทธิ์** ตกกลับแท็บเริ่มต้น
 * (หรือแท็บแรกที่เห็นเมื่อแท็บเริ่มต้นก็ไม่มีสิทธิ์)
 */
export function resolveAccountingTab(tab: string | undefined, viewer: CapabilityHolder): string {
  const selectable = visibleAccountingTabs(viewer).filter((item) => item.available)
  const found = selectable.find((item) => item.id === tab)
  if (found !== undefined) return found.id
  const fallback = selectable.find((item) => item.id === DEFAULT_ACCOUNTING_TAB) ?? selectable[0]
  return fallback?.id ?? DEFAULT_ACCOUNTING_TAB
}

/**
 * key ใน URL ของตัวกรองย่อยแต่ละแท็บบัญชี (preship R7-005) — ชื่อไม่ซ้ำกับ `FINANCE_FILTER_PARAMS`
 * (แท็บภาษีลูกค้าหักใช้ทั้งหน้าการเงินและบัญชี) · เปลี่ยนแท็บแล้ว `AccountingShell` ล้างทุก key ยกเว้น `tab`
 */
export const ACCOUNTING_FILTER_PARAMS = {
  bankStatus: 'bank_status',
  customerWhtStatus: 'cwht_status',
  customerWhtAge: 'cwht_age',
  expenseDocument: 'exp_doc',
  exceptionStatus: 'exc_status',
  exceptionLevel: 'exc_level',
  questionStatus: 'q_status',
  salesInvoice: 'sales_invoice',
  whtStatus: 'wht_status',
  assumptionStatus: 'assume_status',
} as const
