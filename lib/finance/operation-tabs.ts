import { hasCapability, type CapabilityHolder } from '@/lib/auth/permission'

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
  /**
   * แท็บที่หน้าจริงอยู่ **คนละ route** — เรนเดอร์เป็นลิงก์ข้ามไปแทนที่จะเป็นปุ่มเทา
   * (Final Test ด่าน 5 — "ผู้รับเงิน" เคยเป็นปุ่มเทาถาวรทั้งที่หน้าเสร็จตั้งแต่ Phase 3.2)
   */
  href?: string
  /**
   * capability ที่ **API อ่านของแท็บนี้** รับ (ถืออย่างใดอย่างหนึ่งระดับ `view` ⇒ เห็นแท็บ · Superadmin เห็นทุกแท็บ)
   * ⚠️ ต้องตรงกับ `withApiPermission()` ของ endpoint ที่แท็บเรียก (ล็อกด้วย `operation-tabs.test.ts`)
   * — แท็บที่ผู้ใช้ไม่มีสิทธิ์อ่าน **ซ่อน** แทนการโชว์ตารางว่าง/"0 รายการ" ทั้งที่จริงได้ 403 (UAT R6-F)
   * · ทำให้ผู้จัดการทีมเห็นเฉพาะแท็บคิวอนุมัติค่าตอบแทน (มติ PO 03/10/2569 — UAT R6-A)
   * เขียนเป็นสตริงตรง ๆ เพราะไฟล์นี้ถูก import ฝั่ง client (ห้ามดึงโมดูล server เข้ามา)
   */
  capabilities: readonly string[]
}

export const FINANCE_OPERATION_TABS: readonly FinanceOperationTab[] = [
  { id: 'dashboard', label: 'ภาพรวม', source: 'ไฟล์ 14', available: true, capabilities: ['view_finance_dashboard'] },
  // คิวรายการเบิก (ไฟล์ 15) + ทบทวนเงินทดรอง — งานประจำของการเงิน/ผู้อนุมัติขั้นสูง (ผู้จัดการใช้แท็บ comp)
  {
    id: 'approval',
    label: 'รออนุมัติ',
    source: 'ไฟล์ 15',
    available: true,
    capabilities: ['approve_expense_finance', 'approve_expense_executive'],
  },
  // คิวอนุมัติค่าตอบแทนหลายขั้น (ไฟล์ 16) — ผู้จัดการทีมเข้าได้ (มติ PO 03/10/2569 — UAT R6-A)
  {
    id: 'comp',
    label: 'ค่าตอบแทน',
    source: 'ไฟล์ 16',
    available: true,
    capabilities: ['approve_expense_manager', 'approve_expense_finance', 'approve_expense_executive'],
  },
  {
    id: 'advances',
    label: 'เงินทดรองจ่าย',
    source: 'ไฟล์ 15',
    available: true,
    capabilities: ['request_advance', 'approve_advance'],
  },
  { id: 'payout', label: 'รอบจ่ายเงิน', source: 'ไฟล์ 17', available: true, capabilities: ['manage_payout_batch'] },
  { id: 'revenue', label: 'รายได้และวางบิล', source: 'ไฟล์ 19', available: true, capabilities: ['manage_billing'] },
  // ไฟล์ 18 — การเงินเป็นผู้จัดการ payee (`18` §12) ⇒ เรนเดอร์ในหน้านี้เลยตาม mockup `finance.html`
  // (`financeSubTab === 'payee'`) · เดิมเป็นลิงก์ไป `/settings/finance?tab=payee` ซึ่งการเงินเข้าไม่ได้
  // (เมนูตั้งค่าการเงินเป็นของ Superadmin/บริหาร) ⇒ เด้งกลับแดชบอร์ด (UAT R6-C) · ใช้ component เดียวกับหน้าตั้งค่า
  {
    id: 'payee',
    label: 'ผู้รับเงิน (Payee)',
    source: 'ไฟล์ 18',
    available: true,
    capabilities: ['manage_payee_profile'],
  },
  {
    id: 'adjustment',
    label: 'ปรับปรุง',
    source: 'ไฟล์ 20',
    available: true,
    capabilities: ['create_adjustment', 'approve_adjustment', 'approve_adjustment_locked'],
  },
  { id: 'profit', label: 'กำไรและต้นทุน', source: 'ไฟล์ 21', available: true, capabilities: ['view_finance_dashboard'] },
  // มติ PO 05/10/2569 U40 — 50 ทวิ ที่ลูกค้าหักเรา: การเงินช่วยตาม + ธุรการเข้าหน้านี้ได้ทางเดียว (เห็นแท็บนี้แท็บเดียว)
  {
    id: 'customer-wht',
    label: '50 ทวิ ลูกค้า',
    source: 'ไฟล์ 31',
    available: true,
    capabilities: ['manage_customer_wht'],
  },
]

/**
 * **ส่วนย่อยในแท็บ** ที่ API อ่านต่างจากแท็บแม่ (BUG-182 · `06` §7.2 ทั่วไป = ซ่อน) — ผู้ที่เห็นแท็บแต่ไม่ถือ capability
 * ของส่วนนั้น (เช่น ผู้บริหาร: เห็นแท็บ "รออนุมัติ" ด้วย `approve_expense_executive` แต่ไม่ถือสิทธิ์เงินทดรอง)
 * ต้อง**ไม่เห็นส่วนนั้นเลย** แทนกล่อง "ไม่มีสิทธิ์ใช้งาน" + 403 ใน console
 * ⚠️ ต้องตรงกับ `withApiPermission()` ของ endpoint ที่ส่วนนั้นเรียก (ล็อกด้วย `operation-tabs.test.ts`)
 */
export const FINANCE_TAB_SECTIONS = {
  /** แท็บรออนุมัติ → ตาราง "เงินทดรองจ่าย" (`GET /api/advances`) */
  'approval.advances': ['request_advance', 'approve_advance'],
  /** แท็บปรับปรุง → การ์ดวันลงพื้นที่/ค่าน้ำมันในงวดที่ปิดแล้ว (`GET /api/adjustments/field-days` · `fuel-expenses`) */
  'adjustment.locked-sources': ['create_adjustment', 'manage_accounting_period'],
} as const satisfies Record<string, readonly string[]>

export type FinanceTabSection = keyof typeof FINANCE_TAB_SECTIONS

/** ผู้ใช้เห็นส่วนย่อยนี้หรือไม่ — ถือ capability อ่านของส่วนนั้นสักตัว (Superadmin เห็นเสมอ) */
export function canViewFinanceTabSection(viewer: CapabilityHolder, section: FinanceTabSection): boolean {
  return FINANCE_TAB_SECTIONS[section].some((capability) => hasCapability(viewer, 'view', capability))
}

/**
 * `14` §1 — "ภาพรวม" คือ **หน้าแรกของโมดูลการเงิน** (เปิดใช้จริงตั้งแต่ Phase 3.8)
 * ก่อนหน้านั้นแท็บเริ่มต้นเป็น `approval` เพราะหน้าภาพรวมยังไม่เกิด
 */
export const DEFAULT_FINANCE_OPERATION_TAB = 'dashboard'

/** แท็บที่ผู้ใช้คนนี้เห็น — ถือ capability อ่านของแท็บนั้นสักตัว (Superadmin เห็นทุกแท็บ) */
export function visibleFinanceOperationTabs(viewer: CapabilityHolder): FinanceOperationTab[] {
  return FINANCE_OPERATION_TABS.filter((tab) =>
    tab.capabilities.some((capability) => hasCapability(viewer, 'view', capability)),
  )
}

/** ผู้ใช้เห็นแท็บใด ๆ ในหน้าการเงินไหม — ใช้กับเมนูของ role ที่เห็นหน้าการเงินแบบบางส่วน (ผู้จัดการทีม) */
export function canViewAnyFinanceOperationTab(viewer: CapabilityHolder): boolean {
  return visibleFinanceOperationTabs(viewer).length > 0
}

/**
 * แท็บแรกที่ใช้งานได้จริง **และผู้ใช้เห็น** — `?tab=` ที่ชี้แท็บยังไม่เกิด/ไม่มีสิทธิ์ตกกลับแท็บเริ่มต้น
 * (หรือแท็บแรกที่เห็นเมื่อแท็บเริ่มต้นก็ไม่มีสิทธิ์ เช่น ผู้จัดการทีม ⇒ `comp`)
 * แท็บที่เป็นลิงก์ข้าม route (`href`) ก็เลือกค้างไว้ที่หน้านี้ไม่ได้ ไม่งั้นจะได้การ์ดเปล่า
 */
export function resolveFinanceOperationTab(tab: string | undefined, viewer: CapabilityHolder): string {
  const selectable = visibleFinanceOperationTabs(viewer).filter((item) => item.available && item.href === undefined)
  const found = selectable.find((item) => item.id === tab)
  if (found !== undefined) return found.id
  const fallback = selectable.find((item) => item.id === DEFAULT_FINANCE_OPERATION_TAB) ?? selectable[0]
  return fallback?.id ?? DEFAULT_FINANCE_OPERATION_TAB
}

/**
 * key ใน URL ของตัวกรองย่อยแต่ละแท็บ (preship R6-008) — ชื่อไม่ซ้ำข้ามแท็บ · เปลี่ยนแท็บแล้วล้างทิ้งทั้งชุด
 * (`FinanceShell`) ไม่ให้ตัวกรองของแท็บก่อนค้างใน URL
 */
export const FINANCE_FILTER_PARAMS = {
  billingStatus: 'bill_status',
  revenueStatus: 'rev_status',
  payoutStatus: 'payout_status',
  payoutSide: 'payout_side',
  advanceStatus: 'adv_status',
  claimStatus: 'claim_status',
  adjustmentStatus: 'adj_status',
  adjustmentTarget: 'adj_target',
} as const
