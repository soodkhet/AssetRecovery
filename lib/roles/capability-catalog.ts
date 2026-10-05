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
  { code: 'approve_case', label: 'รับ/ไม่รับเคส (Case Approval)', module: 'case', functionalGroup: FunctionalGroup.ops },
  { code: 'assign_case', label: 'มอบหมาย/Reassign เคส', module: 'assignment', functionalGroup: FunctionalGroup.ops, description: 'เฉพาะทีมที่ดูแล' },
  { code: 'perform_field_work', label: 'รับงาน/ปิดงานภาคสนาม', module: 'field', functionalGroup: FunctionalGroup.ops },
  { code: 'reject_evidence', label: 'ตีกลับหลักฐานปิดงาน', module: 'field', functionalGroup: FunctionalGroup.ops, description: 'กระทบ Revenue' },
  { code: 'approve_recycle', label: 'อนุมัติ/ปฏิเสธ Recycle', module: 'case', functionalGroup: FunctionalGroup.ops },
  { code: 'view_own_company_data', label: 'ดูสถานะเคส/วางบิลของบริษัทตัวเอง', module: 'portal', functionalGroup: FunctionalGroup.ops, description: 'own scope เท่านั้น' },

  // ── กลุ่ม การเงิน (Finance) — 12 ──
  { code: 'approve_expense_manager', label: 'อนุมัติ Claim ขั้น Manager', module: 'expense', functionalGroup: FunctionalGroup.finance, description: 'ขั้น 1 — เฉพาะทีมตัวเอง' },
  { code: 'approve_expense_finance', label: 'อนุมัติ/ตีกลับ Claim ขั้น Finance', module: 'expense', functionalGroup: FunctionalGroup.finance, description: 'ขั้น 2 — pending_finance_approval' },
  { code: 'approve_expense_executive', label: 'อนุมัติ Claim ที่เกินเพดาน', module: 'expense', functionalGroup: FunctionalGroup.finance, description: 'Executive เท่านั้น — Approval Matrix' },
  { code: 'request_advance', label: 'ขอเงินทดรองจ่าย / เคลียร์ยอด', module: 'advance', functionalGroup: FunctionalGroup.finance, description: 'Field Agent เจ้าของคำขอ · การเงินตรวจสอบ' },
  { code: 'manage_payout_batch', label: 'จัดการ Payout Batch', module: 'payout', functionalGroup: FunctionalGroup.finance },
  { code: 'generate_payment_file', label: 'สร้างไฟล์โอนเงิน (Bank Payment File)', module: 'payout', functionalGroup: FunctionalGroup.finance, description: 'แยกจากจัดการ Payout — จุดเสี่ยงเงินออก' },
  { code: 'manage_payee_profile', label: 'จัดการ Payee Profile', module: 'payee', functionalGroup: FunctionalGroup.finance, description: 'Field Agent ดูได้เฉพาะของตัวเอง' },
  { code: 'manage_billing', label: 'จัดการ Billing Batch', module: 'billing', functionalGroup: FunctionalGroup.finance },
  { code: 'create_adjustment', label: 'สร้าง Adjustment', module: 'adjustment', functionalGroup: FunctionalGroup.finance },
  { code: 'approve_adjustment', label: 'อนุมัติ Adjustment (รอบ collecting/sent)', module: 'adjustment', functionalGroup: FunctionalGroup.finance, description: 'บริหารอนุมัติได้เมื่อรอบเป็น sent' },
  { code: 'approve_adjustment_locked', label: 'อนุมัติ Adjustment (รอบ locked)', module: 'adjustment', functionalGroup: FunctionalGroup.finance, description: '🔒 Executive เท่านั้น — Period Lock Policy' },
  { code: 'view_finance_dashboard', label: 'ดู Dashboard / Profitability Report', module: 'report', functionalGroup: FunctionalGroup.finance, description: 'ดูอย่างเดียวทุกฝ่าย' },

  // ── กลุ่ม บัญชี (Accounting) — 11 ──
  { code: 'manage_accounting_period', label: 'จัดการรอบบัญชี (collecting → sent)', module: 'accounting', functionalGroup: FunctionalGroup.accounting },
  { code: 'unlock_period', label: 'ปลดล็อกรอบบัญชีที่ locked', module: 'accounting', functionalGroup: FunctionalGroup.accounting, description: '🔒 Executive เท่านั้น + บันทึก audit' },
  { code: 'manage_tax_invoice', label: 'ออก/ยกเลิกใบกำกับภาษี', module: 'tax_invoice', functionalGroup: FunctionalGroup.accounting, description: 'เลขที่ห้าม gap' },
  { code: 'manage_wht', label: 'ออกหนังสือรับรอง WHT / mark filed', module: 'wht', functionalGroup: FunctionalGroup.accounting },
  { code: 'manage_sales_expenses', label: 'จัดการ Sales/Receipts/Expenses', module: 'accounting', functionalGroup: FunctionalGroup.accounting },
  { code: 'map_cost_center', label: 'map Cost Center (manual)', module: 'accounting', functionalGroup: FunctionalGroup.accounting },
  { code: 'manage_exceptions', label: 'จัดการ Exception (สร้าง/แก้/resolve)', module: 'exception', functionalGroup: FunctionalGroup.accounting },
  { code: 'authorize_exception', label: 'สร้าง Authorized Exception', module: 'exception', functionalGroup: FunctionalGroup.accounting, description: '🔒 Executive เท่านั้น — รับความเสี่ยงข้าม exception' },
  { code: 'manage_bank_reconciliation', label: 'Import statement / จับคู่ Bank Reconcile', module: 'bank', functionalGroup: FunctionalGroup.accounting, description: 'รวมปิดรายการโดยไม่จับคู่' },
  { code: 'manage_accountant_questions', label: 'บันทึก/ตอบ Accountant Question', module: 'accounting', functionalGroup: FunctionalGroup.accounting },
  { code: 'export_accounting_pack', label: 'Export Accounting Pack', module: 'export', functionalGroup: FunctionalGroup.accounting, description: 'critical exception ที่ยัง open = block' },

  // ── กลุ่ม บริหาร (Management/Admin) — 8 ──
  { code: 'manage_companies', label: 'จัดการ Finance Company', module: 'master_data', functionalGroup: FunctionalGroup.admin, description: '🔒 Superadmin เท่านั้น' },
  { code: 'manage_service_fees', label: 'จัดการ Service Fee Template', module: 'master_data', functionalGroup: FunctionalGroup.admin, description: '🔒 Superadmin เท่านั้น' },
  { code: 'view_master_data', label: 'ดูข้อมูล Master Data', module: 'master_data', functionalGroup: FunctionalGroup.admin, description: 'ดูอย่างเดียวทุกฝ่ายหลัก' },
  { code: 'manage_tax_profiles', label: 'แก้ไข Tax Profile / VAT Rate', module: 'settings', functionalGroup: FunctionalGroup.admin, description: '🔒 Superadmin เท่านั้น' },
  { code: 'manage_period_lock_policy', label: 'แก้ไข Period Lock Policy', module: 'settings', functionalGroup: FunctionalGroup.admin, description: '🔒 Superadmin เท่านั้น' },
  { code: 'manage_invoice_numbering', label: 'แก้ไข Tax Invoice Numbering', module: 'settings', functionalGroup: FunctionalGroup.admin, description: '🔒 Superadmin เท่านั้น' },
  { code: 'manage_roles', label: 'จัดการ Role / Permission', module: 'role', functionalGroup: FunctionalGroup.admin, description: '🔒 Superadmin เท่านั้น — critical action' },
  { code: 'record_admin_data', label: 'บันทึกข้อมูล/แนบเอกสาร (ธุรการ)', module: 'admin', functionalGroup: FunctionalGroup.admin, description: 'ตามสิทธิ์ที่ได้รับมอบหมาย' },

  // ── นอก Functional Matrix (`02` §12) — ไม่มีกลุ่ม เพราะ `13` §6.10 คุมเฉพาะสายการเงิน/บัญชี ──
  { code: 'approve_advance', label: 'อนุมัติคำขอเงินทดรองจ่าย', module: 'advance', functionalGroup: null },
  { code: 'lock_period', label: 'ล็อกรอบบัญชี', module: 'accounting', functionalGroup: null },
  { code: 'manage_users', label: 'จัดการผู้ใช้', module: 'user', functionalGroup: null },
  { code: 'manage_teams', label: 'จัดการทีม', module: 'team', functionalGroup: null },
  { code: 'manage_compensation_plans', label: 'จัดการแผนค่าตอบแทน', module: 'master_data', functionalGroup: null },
  // ค่าตั้งภาษีหัก ณ ที่จ่าย 3 ตัว (มติ PO 05/10/2569 UAT U8 · `13` §6.4.2) — Superadmin/บริหาร แก้ได้
  // 50 ทวิ ที่ลูกค้าหักเรา (มติ PO 05/10/2569 U40) — ธุรการ/การเงิน/บัญชี ตามหนังสือ + บันทึกรับ · บริหาร ดู
  { code: 'manage_customer_wht', label: 'ติดตาม/บันทึกรับหนังสือ 50 ทวิ ที่ลูกค้าหัก', module: 'accounting', functionalGroup: null, description: 'ธุรการ/การเงิน/บัญชี · แนบไฟล์สแกนบังคับ' },
  { code: 'manage_wht_policy', label: 'แก้ไขค่าตั้งภาษีหัก ณ ที่จ่าย (ฐาน/50 ทวิ/ประเภทเงินได้)', module: 'settings', functionalGroup: null, description: 'Superadmin/บริหาร · ต้องมีเหตุผล · มีผลกับรอบจ่ายถัดไป' },
  // ปฏิทินวันหยุด (มติ PO 06/10/2569 UAT U93 · `13` §6.15) — ธุรการ/บัญชี/การเงิน กรอกปีละครั้ง · บริหาร ดู · ไม่ล็อก
  { code: 'manage_holidays', label: 'จัดการปฏิทินวันหยุด', module: 'settings', functionalGroup: null, description: 'เพิ่ม/ลบ/นำเข้าวันหยุดขององค์กร ใช้เลื่อนกำหนดยื่นภาษีที่ตรงวันหยุดเป็นวันทำการถัดไป · ต้องมีเหตุผล' },
  // ระยะเก็บเอกสารลูกหนี้ (PDPA — มติ PO 06/10/2569 U97 · `13` §6.16) — Superadmin/บริหาร · ไม่ล็อก
  { code: 'manage_data_retention', label: 'ตั้งระยะเก็บเอกสารลูกหนี้ (PDPA)', module: 'settings', functionalGroup: null, description: 'จำนวนปีหลังปิดเคสก่อนระบบลบไฟล์บัตร/สัญญา/เอกสารลูกหนี้ · ต้องมีเหตุผล' },
  { code: 'manage_settings', label: 'จัดการการตั้งค่าระบบ', module: 'settings', functionalGroup: null },
  { code: 'intake_asset', label: 'รับทรัพย์เข้าคลัง', module: 'warehouse', functionalGroup: null },
  { code: 'reject_asset_intake', label: 'ปฏิเสธการรับเข้าคลัง', module: 'warehouse', functionalGroup: null },
  { code: 'create_handover_lot', label: 'สร้างล็อตส่งมอบ', module: 'warehouse', functionalGroup: null, description: '1 lot = 1 บริษัทไฟแนนซ์' },
  { code: 'confirm_handover_lot', label: 'ยืนยันส่งมอบล็อต', module: 'warehouse', functionalGroup: null, description: 'transaction 4 ขั้น + trigger Revenue' },
  { code: 'view_audit_log', label: 'ดูบันทึกการใช้งาน (Audit Log)', module: 'platform', functionalGroup: null, description: 'Superadmin/บริหาร/บัญชี/การเงิน · อ่านอย่างเดียวเสมอ' },
  { code: 'manage_jobs', label: 'จัดการงานเบื้องหลัง (Background Job)', module: 'platform', functionalGroup: null, description: 'view = ดู Job Log · manage = สั่งงาน (Trigger job) · retry ได้เฉพาะ Superadmin เท่านั้น' },

  // ── นอก Functional Matrix: พอร์ทัลบริษัทไฟแนนซ์ (มติ PO 05/10/2569 U6/O43 D1 · `97` §3.3 · `07` §5.3) ──
  // สิทธิ์ 3 ระดับของผู้ใช้บริษัทแยกตามหมวดเมนู portal — อ่านอย่างเดียวเสมอ (`/api/portal/*` = GET)
  // ⇒ `manage` มีผลเท่ากับ `view` · Superadmin ปรับค่าได้ที่หน้าจัดการ Role (ไม่ใช่ "✅ only")
  { code: 'portal_cases', label: 'พอร์ทัล: ภาพรวมและสถานะเคส', module: 'portal', functionalGroup: null, description: 'หน้าภาพรวมและรายการเคสของบริษัทตัวเอง' },
  { code: 'portal_finance', label: 'พอร์ทัล: วางบิล/ใบกำกับภาษี/ยอดค้างชำระ', module: 'portal', functionalGroup: null, description: 'รอบวางบิลที่ส่งแล้ว ใบกำกับภาษี และยอดค้างชำระของบริษัทตัวเอง' },
  { code: 'portal_handover', label: 'พอร์ทัล: ล็อตส่งมอบทรัพย์', module: 'portal', functionalGroup: null, description: 'ล็อตส่งมอบ รายการทรัพย์ และรูปทรัพย์ของบริษัทตัวเอง' },
  { code: 'portal_profile', label: 'พอร์ทัล: ข้อมูลบริษัท', module: 'portal', functionalGroup: null, description: 'ข้อมูลบริษัทและผู้ติดต่อของบริษัทตัวเอง' },
  { code: 'portal_download', label: 'พอร์ทัล: ดาวน์โหลดเอกสาร', module: 'portal', functionalGroup: null, description: 'ดาวน์โหลด PDF/Excel ได้เฉพาะหมวดที่มีสิทธิ์เห็น' },

  // ── นอก Functional Matrix: ผู้ใช้ภายในดู portal ในฐานะลูกค้า (มติ PO 05/10/2569 U59 · `97` §13.1 · `07` §5.1) ──
  // ไม่ขึ้นต้น `portal_` (ไม่ใช่สิทธิ์หมวดของผู้ใช้บริษัท) · อ่านอย่างเดียว ⇒ `manage` = `view` · ไม่ใช่ "✅ only"
  { code: 'view_client_portal_as', label: 'ดูพอร์ทัลในฐานะลูกค้า', module: 'portal', functionalGroup: null, description: 'เปิดพอร์ทัลของบริษัทไฟแนนซ์แบบดูอย่างเดียว เห็นเหมือนผู้จัดการของบริษัท (ทุกการเปิดและดาวน์โหลดลงบันทึกการใช้งาน)' },
]

/** capability ที่อยู่ใน Functional Permission Matrix (`13` §6.10 — ต้องเท่ากับ 37 เสมอ) */
export const MATRIX_CAPABILITIES: readonly CapabilitySeed[] = CAPABILITIES.filter(
  (capability) => capability.functionalGroup !== null,
)

export const CAPABILITY_CODES: ReadonlySet<string> = new Set(CAPABILITIES.map((capability) => capability.code))
