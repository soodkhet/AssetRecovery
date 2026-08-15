import { FunctionalGroup } from '@/lib/generated/prisma/enums'

/**
 * รายการ capability ทั้งระบบ (`02` §12) — **pure ล้วน** ใช้ร่วมกันระหว่าง `prisma/seed.ts` และเทสต์
 * (เดิมอยู่ในไฟล์ seed ตั้งแต่ Phase 1.2 — ย้ายมาที่นี่ใน Phase 1.6 เพื่อให้ยามความสอดคล้องเทสต์ได้
 * โดยไม่ต้องต่อ DB · เนื้อหาไม่เปลี่ยนแม้แต่รายการเดียว)
 *
 * Functional Permission Matrix **37 รายการ 4 กลุ่ม** (`13` §6.10 + `25` §7) — `functionalGroup` ไม่เป็น null
 * ตามด้วย capability ที่ `02` §12 ระบุแต่ไม่อยู่ใน matrix (functionalGroup = null — งานนอกสายการเงิน/บัญชี)
 *
 * 🔒 = "✅ only" ตาม `25` §16.1 — มอบให้ role อื่นไม่ได้ (รายชื่อจริงบังคับที่ `lib/roles/capability-locks.ts`)
 */

export interface CapabilitySeed {
  code: string
  label: string
  module: string
  functionalGroup: FunctionalGroup | null
  description?: string
}

export const CAPABILITIES: readonly CapabilitySeed[] = [
  // ── กลุ่ม ปฏิบัติงาน (Operations) — 6 ──
  { code: 'approve_case', label: 'รับ/ไม่รับเคส (Case Approval)', module: 'case', functionalGroup: FunctionalGroup.ops, description: 'ไฟล์ 38' },
  { code: 'assign_case', label: 'มอบหมาย/Reassign เคส', module: 'assignment', functionalGroup: FunctionalGroup.ops, description: 'ไฟล์ 40 — เฉพาะทีมที่ดูแล' },
  { code: 'perform_field_work', label: 'รับงาน/ปิดงานภาคสนาม', module: 'field', functionalGroup: FunctionalGroup.ops, description: 'ไฟล์ 41' },
  { code: 'reject_evidence', label: 'ตีกลับหลักฐานปิดงาน', module: 'field', functionalGroup: FunctionalGroup.ops, description: '`41` §8 — กระทบ Revenue (`19` §6.1)' },
  { code: 'approve_recycle', label: 'อนุมัติ/ปฏิเสธ Recycle', module: 'case', functionalGroup: FunctionalGroup.ops, description: '`38` §6.6' },
  { code: 'view_own_company_data', label: 'ดูสถานะเคส/วางบิลของบริษัทตัวเอง', module: 'portal', functionalGroup: FunctionalGroup.ops, description: 'ไฟล์ 97 — own scope เท่านั้น' },

  // ── กลุ่ม การเงิน (Finance) — 12 ──
  { code: 'approve_expense_manager', label: 'อนุมัติ Claim ขั้น Manager', module: 'expense', functionalGroup: FunctionalGroup.finance, description: 'ขั้น 1 — เฉพาะทีมตัวเอง (ไฟล์ 16)' },
  { code: 'approve_expense_finance', label: 'อนุมัติ/ตีกลับ Claim ขั้น Finance', module: 'expense', functionalGroup: FunctionalGroup.finance, description: 'ขั้น 2 — pending_finance_approval (ไฟล์ 16/23)' },
  { code: 'approve_expense_executive', label: 'อนุมัติ Claim ที่เกินเพดาน', module: 'expense', functionalGroup: FunctionalGroup.finance, description: 'Executive เท่านั้น — Approval Matrix (`13` §6.2)' },
  { code: 'request_advance', label: 'ขอเงินทดรองจ่าย / เคลียร์ยอด', module: 'advance', functionalGroup: FunctionalGroup.finance, description: 'Field Agent เจ้าของคำขอ · การเงินตรวจสอบ (ไฟล์ 15)' },
  { code: 'manage_payout_batch', label: 'จัดการ Payout Batch', module: 'payout', functionalGroup: FunctionalGroup.finance, description: 'ไฟล์ 17' },
  { code: 'generate_payment_file', label: 'สร้างไฟล์โอนเงิน (Bank Payment File)', module: 'payout', functionalGroup: FunctionalGroup.finance, description: 'แยกจากจัดการ Payout — จุดเสี่ยงเงินออก (ไฟล์ 17)' },
  { code: 'manage_payee_profile', label: 'จัดการ Payee Profile', module: 'payee', functionalGroup: FunctionalGroup.finance, description: 'ไฟล์ 18 — Field Agent ดูได้เฉพาะของตัวเอง' },
  { code: 'manage_billing', label: 'จัดการ Billing Batch', module: 'billing', functionalGroup: FunctionalGroup.finance, description: 'ไฟล์ 19' },
  { code: 'create_adjustment', label: 'สร้าง Adjustment', module: 'adjustment', functionalGroup: FunctionalGroup.finance, description: 'ไฟล์ 20' },
  { code: 'approve_adjustment', label: 'อนุมัติ Adjustment (รอบ collecting/sent)', module: 'adjustment', functionalGroup: FunctionalGroup.finance, description: 'บริหารอนุมัติได้เมื่อรอบเป็น sent (`23` §6.9)' },
  { code: 'approve_adjustment_locked', label: 'อนุมัติ Adjustment (รอบ locked)', module: 'adjustment', functionalGroup: FunctionalGroup.finance, description: '🔒 Executive เท่านั้น — Period Lock Policy (`13` §6.11)' },
  { code: 'view_finance_dashboard', label: 'ดู Dashboard / Profitability Report', module: 'report', functionalGroup: FunctionalGroup.finance, description: 'ไฟล์ 14/21 — ดูอย่างเดียวทุกฝ่าย' },

  // ── กลุ่ม บัญชี (Accounting) — 11 ──
  { code: 'manage_accounting_period', label: 'จัดการรอบบัญชี (collecting → sent)', module: 'accounting', functionalGroup: FunctionalGroup.accounting, description: 'ไฟล์ 30' },
  { code: 'unlock_period', label: 'ปลดล็อกรอบบัญชีที่ locked', module: 'accounting', functionalGroup: FunctionalGroup.accounting, description: '🔒 Executive เท่านั้น + บันทึก audit (`13` §6.11 / 30)' },
  { code: 'manage_tax_invoice', label: 'ออก/ยกเลิกใบกำกับภาษี', module: 'tax_invoice', functionalGroup: FunctionalGroup.accounting, description: 'ไฟล์ 31 — เลขที่ห้าม gap' },
  { code: 'manage_wht', label: 'ออกหนังสือรับรอง WHT / mark filed', module: 'wht', functionalGroup: FunctionalGroup.accounting, description: 'ไฟล์ 33' },
  { code: 'manage_sales_expenses', label: 'จัดการ Sales/Receipts/Expenses', module: 'accounting', functionalGroup: FunctionalGroup.accounting, description: 'ไฟล์ 31/32' },
  { code: 'map_cost_center', label: 'map Cost Center (manual)', module: 'accounting', functionalGroup: FunctionalGroup.accounting, description: 'ไฟล์ 32' },
  { code: 'manage_exceptions', label: 'จัดการ Exception (สร้าง/แก้/resolve)', module: 'exception', functionalGroup: FunctionalGroup.accounting, description: 'ไฟล์ 34' },
  { code: 'authorize_exception', label: 'สร้าง Authorized Exception', module: 'exception', functionalGroup: FunctionalGroup.accounting, description: '🔒 Executive เท่านั้น — รับความเสี่ยงข้าม exception (ไฟล์ 34)' },
  { code: 'manage_bank_reconciliation', label: 'Import statement / จับคู่ Bank Reconcile', module: 'bank', functionalGroup: FunctionalGroup.accounting, description: 'ไฟล์ 35 — รวมปิดรายการโดยไม่จับคู่' },
  { code: 'manage_accountant_questions', label: 'บันทึก/ตอบ Accountant Question', module: 'accounting', functionalGroup: FunctionalGroup.accounting, description: 'ไฟล์ 36' },
  { code: 'export_accounting_pack', label: 'Export Accounting Pack', module: 'export', functionalGroup: FunctionalGroup.accounting, description: 'ไฟล์ 37 — critical exception ที่ยัง open = block' },

  // ── กลุ่ม บริหาร (Management/Admin) — 8 ──
  { code: 'manage_companies', label: 'จัดการ Finance Company', module: 'master_data', functionalGroup: FunctionalGroup.admin, description: '🔒 Superadmin เท่านั้น (ไฟล์ 10)' },
  { code: 'manage_service_fees', label: 'จัดการ Service Fee Template', module: 'master_data', functionalGroup: FunctionalGroup.admin, description: '🔒 Superadmin เท่านั้น (ไฟล์ 12)' },
  { code: 'view_master_data', label: 'ดูข้อมูล Master Data', module: 'master_data', functionalGroup: FunctionalGroup.admin, description: 'ดูอย่างเดียวทุกฝ่ายหลัก (ไฟล์ 25)' },
  { code: 'manage_tax_profiles', label: 'แก้ไข Tax Profile / VAT Rate', module: 'settings', functionalGroup: FunctionalGroup.admin, description: '🔒 Superadmin เท่านั้น (`13` §6.4-6.5)' },
  { code: 'manage_period_lock_policy', label: 'แก้ไข Period Lock Policy', module: 'settings', functionalGroup: FunctionalGroup.admin, description: '🔒 Superadmin เท่านั้น (`13` §6.11)' },
  { code: 'manage_invoice_numbering', label: 'แก้ไข Tax Invoice Numbering', module: 'settings', functionalGroup: FunctionalGroup.admin, description: '🔒 Superadmin เท่านั้น (`13` §6.12)' },
  { code: 'manage_roles', label: 'จัดการ Role / Permission', module: 'role', functionalGroup: FunctionalGroup.admin, description: '🔒 Superadmin เท่านั้น — critical action (`05` §10)' },
  { code: 'record_admin_data', label: 'บันทึกข้อมูล/แนบเอกสาร (ธุรการ)', module: 'admin', functionalGroup: FunctionalGroup.admin, description: 'ตามสิทธิ์ที่ได้รับมอบหมาย (ไฟล์ 25)' },

  // ── นอก Functional Matrix (`02` §12) — ไม่มีกลุ่ม เพราะ `13` §6.10 คุมเฉพาะสายการเงิน/บัญชี ──
  { code: 'approve_advance', label: 'อนุมัติคำขอเงินทดรองจ่าย', module: 'advance', functionalGroup: null, description: 'ไฟล์ 15' },
  { code: 'lock_period', label: 'ล็อกรอบบัญชี', module: 'accounting', functionalGroup: null, description: 'ไฟล์ 30' },
  { code: 'manage_users', label: 'จัดการผู้ใช้', module: 'user', functionalGroup: null, description: 'ไฟล์ 08' },
  { code: 'manage_teams', label: 'จัดการทีม', module: 'team', functionalGroup: null, description: 'ไฟล์ 09' },
  { code: 'manage_compensation_plans', label: 'จัดการแผนค่าตอบแทน', module: 'master_data', functionalGroup: null, description: 'ไฟล์ 11' },
  { code: 'manage_settings', label: 'จัดการการตั้งค่าระบบ', module: 'settings', functionalGroup: null, description: 'ไฟล์ 13' },
  { code: 'intake_asset', label: 'รับทรัพย์เข้าคลัง', module: 'warehouse', functionalGroup: null, description: 'ไฟล์ 44' },
  { code: 'reject_asset_intake', label: 'ปฏิเสธการรับเข้าคลัง', module: 'warehouse', functionalGroup: null, description: 'ไฟล์ 44' },
  { code: 'create_handover_lot', label: 'สร้างล็อตส่งมอบ', module: 'warehouse', functionalGroup: null, description: 'ไฟล์ 44 — 1 lot = 1 บริษัทไฟแนนซ์' },
  { code: 'confirm_handover_lot', label: 'ยืนยันส่งมอบล็อต', module: 'warehouse', functionalGroup: null, description: 'ไฟล์ 44 §11 — transaction 4 ขั้น + trigger Revenue' },
  { code: 'view_audit_log', label: 'ดูบันทึกการใช้งาน (Audit Log)', module: 'platform', functionalGroup: null, description: '`90` §12 "View audit" — Superadmin/บริหาร/บัญชี/การเงิน · อ่านอย่างเดียวเสมอ (`90` §8/§10)' },
  { code: 'manage_jobs', label: 'จัดการงานเบื้องหลัง (Background Job)', module: 'platform', functionalGroup: null, description: '`91` §12 — view = ดู Job Log · manage = สั่งงาน (Trigger job) · **retry ล็อก Superadmin เท่านั้น**' },
]

/** capability ที่อยู่ใน Functional Permission Matrix (`13` §6.10 — ต้องเท่ากับ 37 เสมอ) */
export const MATRIX_CAPABILITIES: readonly CapabilitySeed[] = CAPABILITIES.filter(
  (capability) => capability.functionalGroup !== null,
)

export const CAPABILITY_CODES: ReadonlySet<string> = new Set(CAPABILITIES.map((capability) => capability.code))
