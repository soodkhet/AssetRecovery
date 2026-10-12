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
  { code: 'approve_case', label: 'รับ/ไม่รับเคส', module: 'case', functionalGroup: FunctionalGroup.ops },
  { code: 'assign_case', label: 'มอบหมาย/เปลี่ยนผู้รับผิดชอบเคส', module: 'assignment', functionalGroup: FunctionalGroup.ops, description: 'เฉพาะทีมที่ดูแล' },
  { code: 'perform_field_work', label: 'รับงาน/ปิดงานภาคสนาม', module: 'field', functionalGroup: FunctionalGroup.ops },
  { code: 'reject_evidence', label: 'ตีกลับหลักฐานปิดงาน', module: 'field', functionalGroup: FunctionalGroup.ops, description: 'กระทบรายได้' },
  { code: 'approve_recycle', label: 'อนุมัติ/ไม่อนุมัติคำขอรีไซเคิลเคส', module: 'case', functionalGroup: FunctionalGroup.ops },
  { code: 'view_own_company_data', label: 'ดูสถานะเคส/วางบิลของบริษัทตัวเอง', module: 'portal', functionalGroup: FunctionalGroup.ops, description: 'เห็นเฉพาะข้อมูลของบริษัทตัวเอง' },

  // ── กลุ่ม การเงิน (Finance) — 12 ──
  { code: 'approve_expense_manager', label: 'อนุมัติคำขอเบิกขั้นผู้จัดการทีม', module: 'expense', functionalGroup: FunctionalGroup.finance, description: 'ขั้น 1 — เฉพาะทีมตัวเอง' },
  { code: 'approve_expense_finance', label: 'อนุมัติ/ตีกลับคำขอเบิกขั้นการเงิน', module: 'expense', functionalGroup: FunctionalGroup.finance, description: 'ขั้น 2 — รายการที่รอการเงินอนุมัติ' },
  { code: 'approve_expense_executive', label: 'อนุมัติคำขอเบิกที่เกินเพดาน', module: 'expense', functionalGroup: FunctionalGroup.finance, description: 'ผู้บริหารเท่านั้น — ตามลำดับขั้นการอนุมัติ' },
  { code: 'request_advance', label: 'ขอเงินทดรองจ่าย / เคลียร์ยอด', module: 'advance', functionalGroup: FunctionalGroup.finance, description: 'พนักงานติดตามทรัพย์เจ้าของคำขอ · การเงินตรวจสอบ' },
  { code: 'manage_payout_batch', label: 'จัดการรอบจ่าย', module: 'payout', functionalGroup: FunctionalGroup.finance },
  { code: 'generate_payment_file', label: 'สร้างไฟล์โอนเงินธนาคาร', module: 'payout', functionalGroup: FunctionalGroup.finance, description: 'แยกจากการจัดการรอบจ่าย — จุดเสี่ยงเงินออก' },
  { code: 'manage_payee_profile', label: 'จัดการข้อมูลผู้รับเงิน', module: 'payee', functionalGroup: FunctionalGroup.finance, description: 'พนักงานติดตามทรัพย์ดูได้เฉพาะของตัวเอง' },
  { code: 'manage_billing', label: 'จัดการรอบวางบิล', module: 'billing', functionalGroup: FunctionalGroup.finance },
  { code: 'create_adjustment', label: 'สร้างรายการปรับปรุง', module: 'adjustment', functionalGroup: FunctionalGroup.finance },
  { code: 'approve_adjustment', label: 'อนุมัติรายการปรับปรุง (งวดที่ยังไม่ล็อก)', module: 'adjustment', functionalGroup: FunctionalGroup.finance, description: 'งวดที่ส่งสำนักงานบัญชีแล้ว ผู้บริหารเป็นผู้อนุมัติ' },
  { code: 'approve_adjustment_locked', label: 'อนุมัติรายการปรับปรุง (งวดที่ล็อกแล้ว)', module: 'adjustment', functionalGroup: FunctionalGroup.finance, description: '🔒 ผู้บริหารเท่านั้น — ตามนโยบายล็อกงวดบัญชี' },
  { code: 'view_finance_dashboard', label: 'ดูแดชบอร์ด / รายงานกำไร', module: 'report', functionalGroup: FunctionalGroup.finance, description: 'ดูอย่างเดียวทุกฝ่าย' },

  // ── กลุ่ม บัญชี (Accounting) — 11 ──
  { code: 'manage_accounting_period', label: 'จัดการงวดบัญชี (กำลังรวบรวม → ส่งสำนักงานบัญชี)', module: 'accounting', functionalGroup: FunctionalGroup.accounting },
  { code: 'unlock_period', label: 'ปลดล็อกงวดบัญชีที่ล็อกแล้ว', module: 'accounting', functionalGroup: FunctionalGroup.accounting, description: '🔒 ผู้บริหารเท่านั้น + บันทึกประวัติการใช้งาน' },
  { code: 'manage_tax_invoice', label: 'ออก/ยกเลิกใบกำกับภาษี', module: 'tax_invoice', functionalGroup: FunctionalGroup.accounting, description: 'เลขที่เอกสารต้องเรียงต่อเนื่อง ห้ามข้าม' },
  { code: 'manage_wht', label: 'ออกหนังสือรับรองหัก ณ ที่จ่าย / บันทึกว่ายื่นแล้ว', module: 'wht', functionalGroup: FunctionalGroup.accounting },
  { code: 'manage_sales_expenses', label: 'จัดการรายการขาย/เงินรับ/ค่าใช้จ่าย', module: 'accounting', functionalGroup: FunctionalGroup.accounting },
  { code: 'map_cost_center', label: 'กำหนดศูนย์ต้นทุนของค่าใช้จ่าย', module: 'accounting', functionalGroup: FunctionalGroup.accounting },
  { code: 'manage_exceptions', label: 'จัดการข้อยกเว้น (บันทึก/แก้/ปิดข้อยกเว้น)', module: 'exception', functionalGroup: FunctionalGroup.accounting },
  { code: 'authorize_exception', label: 'อนุมัติข้ามข้อยกเว้น', module: 'exception', functionalGroup: FunctionalGroup.accounting, description: '🔒 ผู้บริหารเท่านั้น — รับความเสี่ยงแทนการแก้ข้อยกเว้น' },
  { code: 'manage_bank_reconciliation', label: 'นำเข้ารายการเดินบัญชี / จับคู่กระทบยอดธนาคาร', module: 'bank', functionalGroup: FunctionalGroup.accounting, description: 'รวมปิดรายการโดยไม่จับคู่' },
  { code: 'manage_accountant_questions', label: 'บันทึก/ตอบคำถามถึงสำนักงานบัญชี', module: 'accounting', functionalGroup: FunctionalGroup.accounting },
  { code: 'export_accounting_pack', label: 'ส่งออกชุดเอกสารส่งสำนักงานบัญชี', module: 'export', functionalGroup: FunctionalGroup.accounting, description: 'ถ้ามีข้อยกเว้นระดับวิกฤตที่ยังเปิดอยู่ จะส่งออกไม่ได้' },

  // ── กลุ่ม บริหาร (Management/Admin) — 8 ──
  { code: 'manage_companies', label: 'จัดการบริษัทไฟแนนซ์', module: 'master_data', functionalGroup: FunctionalGroup.admin, description: '🔒 Superadmin เท่านั้น' },
  { code: 'manage_service_fees', label: 'จัดการเทมเพลตค่าบริการ', module: 'master_data', functionalGroup: FunctionalGroup.admin, description: '🔒 Superadmin เท่านั้น' },
  { code: 'view_master_data', label: 'ดูข้อมูลหลัก', module: 'master_data', functionalGroup: FunctionalGroup.admin, description: 'ดูอย่างเดียวทุกฝ่ายหลัก' },
  { code: 'manage_tax_profiles', label: 'แก้ไขโปรไฟล์ภาษี / อัตราภาษีมูลค่าเพิ่ม', module: 'settings', functionalGroup: FunctionalGroup.admin, description: '🔒 Superadmin เท่านั้น' },
  { code: 'manage_period_lock_policy', label: 'แก้ไขนโยบายล็อกงวดบัญชี', module: 'settings', functionalGroup: FunctionalGroup.admin, description: '🔒 Superadmin เท่านั้น' },
  { code: 'manage_invoice_numbering', label: 'แก้ไขเลขที่เอกสาร', module: 'settings', functionalGroup: FunctionalGroup.admin, description: '🔒 Superadmin เท่านั้น' },
  { code: 'manage_roles', label: 'จัดการบทบาทและสิทธิ์', module: 'role', functionalGroup: FunctionalGroup.admin, description: '🔒 Superadmin เท่านั้น — การกระทำสำคัญ' },
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
  // แคตตาล็อกแบรนด์/รุ่นเครื่อง (มติ PO U155 · `13` §6.18) — ธุรการ จัดการ · บริหาร ดู · ไม่ล็อก
  { code: 'manage_device_catalog', label: 'จัดการแคตตาล็อกแบรนด์/รุ่นเครื่อง', module: 'settings', functionalGroup: null, description: 'ตั้งการแสดงแบรนด์/รุ่น เพิ่มเอง ผูกรหัสรุ่นเครื่อง อัปเดต/นำเข้าฐานรหัสรุ่นเครื่อง และตั้งตัวเลือกความจุ/สี' },
  { code: 'manage_settings', label: 'จัดการการตั้งค่าระบบ', module: 'settings', functionalGroup: null },
  { code: 'intake_asset', label: 'รับทรัพย์เข้าคลัง', module: 'warehouse', functionalGroup: null },
  { code: 'reject_asset_intake', label: 'ปฏิเสธการรับเข้าคลัง', module: 'warehouse', functionalGroup: null },
  { code: 'create_handover_lot', label: 'สร้างล็อตส่งมอบ', module: 'warehouse', functionalGroup: null, description: '1 ล็อต = 1 บริษัทไฟแนนซ์' },
  { code: 'confirm_handover_lot', label: 'ยืนยันส่งมอบล็อต', module: 'warehouse', functionalGroup: null, description: 'ยืนยัน 4 ขั้นพร้อมกันทั้งหมด และทำให้เกิดรายได้' },
  { code: 'view_audit_log', label: 'ดูบันทึกการใช้งาน', module: 'platform', functionalGroup: null, description: 'Superadmin/บริหาร/บัญชี/การเงิน · อ่านอย่างเดียวเสมอ' },
  { code: 'manage_jobs', label: 'จัดการงานเบื้องหลัง', module: 'platform', functionalGroup: null, description: 'ดู = ดูประวัติงาน · จัดการ = สั่งงาน · สั่งทำซ้ำได้เฉพาะ Superadmin' },

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

  // ── นอก Functional Matrix: ตัวอย่างเอกสารทั้งหมด (มติ PO 06/10/2569 U104 · เมนูบัญชี → เมนูย่อย) ──
  // อ่านอย่างเดียว (ข้อมูลสมมติ + หัวเอกสารขององค์กร) ⇒ `manage` = `view` · ไม่ใช่ "✅ only"
  { code: 'view_document_samples', label: 'ดูตัวอย่างเอกสารทั้งหมด', module: 'accounting', functionalGroup: null, description: 'ดูหน้าตาเอกสารทุกชนิดที่ระบบออก ด้วยข้อมูลสมมติและหัวเอกสารขององค์กร · อ่านอย่างเดียว ไม่เดินเลขที่เอกสาร' },
]

/** capability ที่อยู่ใน Functional Permission Matrix (`13` §6.10 — ต้องเท่ากับ 37 เสมอ) */
export const MATRIX_CAPABILITIES: readonly CapabilitySeed[] = CAPABILITIES.filter(
  (capability) => capability.functionalGroup !== null,
)

export const CAPABILITY_CODES: ReadonlySet<string> = new Set(CAPABILITIES.map((capability) => capability.code))

const CATALOG_BY_CODE: ReadonlyMap<string, CapabilitySeed> = new Map(
  CAPABILITIES.map((capability) => [capability.code, capability]),
)

/**
 * ป้าย/คำอธิบาย capability ที่แสดงบนหน้าจอยึดแคตตาล็อกนี้เป็นหลัก — ฐานที่ seed ไว้ก่อนแก้ข้อความ
 * (เช่น "รอบ collecting/sent" · "mark filed" — mytester2 A2-01) จึงแสดงข้อความใหม่ทันทีโดยไม่ต้อง seed ซ้ำ
 * · code ที่ไม่อยู่ในแคตตาล็อกใช้ค่าจากฐานตามเดิม
 */
export function withCatalogText<T extends { code: string; label: string; description: string | null }>(
  rows: readonly T[],
): T[] {
  return rows.map((row) => {
    const seed = CATALOG_BY_CODE.get(row.code)
    return seed === undefined ? row : { ...row, label: seed.label, description: seed.description ?? null }
  })
}
