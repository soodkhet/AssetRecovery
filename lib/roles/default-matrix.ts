import type { CapabilityAccessLevel, RoleGroup } from '@/lib/generated/prisma/enums'
import {
  ACCOUNTING_ROLE_NAME,
  ADMIN_OFFICE_ROLE_NAME,
  CASE_APPROVER_ROLE_NAME,
  COMPANY_ADMIN_ROLE_NAME,
  COMPANY_MANAGER_ROLE_NAME,
  COMPANY_SUPERVISOR_ROLE_NAME,
  EXECUTIVE_ROLE_NAME,
  FIELD_AGENT_ROLE_NAME,
  FINANCE_ROLE_NAME,
  TEAM_MANAGER_ROLE_NAME,
  TEAM_SUPERVISOR_ROLE_NAME,
} from '@/lib/auth/constants'

/**
 * ค่าเริ่มต้นของ `role_capabilities` — ถอดมาจาก **Functional Permission Matrix `25` §7 ตรงทุกช่อง**
 * (37 รายการ 4 กลุ่ม ตาม `13` §6.10 · สัญลักษณ์ ✅ → `manage`, 👁️ → `view`, — → ไม่มี record)
 *
 * - **Superadmin ไม่มี record** — `manage` ทุกอย่างโดยนิยาม enforce ที่ middleware (DEC-009)
 * - capability ที่ถูกล็อก ("✅ only") ของ Superadmin จึงไม่มีแถวที่นี่เลย ส่วนของ **บริหาร (Executive)**
 *   3 รายการยังต้องมีแถวจริง เพราะสิทธิ์เป็นของ Executive ไม่ใช่ Superadmin (ดู `lib/roles/capability-locks.ts`)
 * - capability นอก matrix (`functional_group = null` เช่น `manage_users`, `intake_asset`) **ผูกเฉพาะที่ระบุใน `BOUND_NON_MATRIX_CAPABILITIES`**
 *   — เจ้าของสิทธิ์อยู่ในสเปคของโมดูลนั้น (08/09/11/13/15/30/44) ให้ task ของโมดูลนั้นผูกเอง
 *
 * pure ล้วน — `prisma/seed.ts` และเทสต์ใช้ตัวเดียวกัน (seed จึงตรวจสอบได้โดยไม่ต้องมี DB)
 */

export interface RoleRef {
  name: string
  roleGroup: RoleGroup
}

export interface DefaultAssignment {
  capabilityCode: string
  role: RoleRef
  level: CapabilityAccessLevel
}

const executive: RoleRef = { name: EXECUTIVE_ROLE_NAME, roleGroup: 'system' }
const finance: RoleRef = { name: FINANCE_ROLE_NAME, roleGroup: 'system' }
const accounting: RoleRef = { name: ACCOUNTING_ROLE_NAME, roleGroup: 'system' }
const caseApprover: RoleRef = { name: CASE_APPROVER_ROLE_NAME, roleGroup: 'system' }
const adminOffice: RoleRef = { name: ADMIN_OFFICE_ROLE_NAME, roleGroup: 'system' }
const managerIn: RoleRef = { name: TEAM_MANAGER_ROLE_NAME, roleGroup: 'inhouse' }
const managerOut: RoleRef = { name: TEAM_MANAGER_ROLE_NAME, roleGroup: 'outsource' }
const supervisorIn: RoleRef = { name: TEAM_SUPERVISOR_ROLE_NAME, roleGroup: 'inhouse' }
const supervisorOut: RoleRef = { name: TEAM_SUPERVISOR_ROLE_NAME, roleGroup: 'outsource' }
const agentIn: RoleRef = { name: FIELD_AGENT_ROLE_NAME, roleGroup: 'inhouse' }
const agentOut: RoleRef = { name: FIELD_AGENT_ROLE_NAME, roleGroup: 'outsource' }
const companyManager: RoleRef = { name: COMPANY_MANAGER_ROLE_NAME, roleGroup: 'finance_company' }
const companySupervisor: RoleRef = { name: COMPANY_SUPERVISOR_ROLE_NAME, roleGroup: 'finance_company' }
const companyAdmin: RoleRef = { name: COMPANY_ADMIN_ROLE_NAME, roleGroup: 'finance_company' }

/** capability code → รายชื่อ role ที่ได้สิทธิ์ พร้อมระดับ (ลำดับตาม `25` §7.1–§7.6) */
const MATRIX: Readonly<Record<string, ReadonlyArray<readonly [RoleRef, CapabilityAccessLevel]>>> = {
  // ── ปฏิบัติงาน (Operations) — `25` §7.2 ฝั่ง field ops + `07` §12 ──
  approve_case: [[caseApprover, 'manage']],
  assign_case: [
    [managerIn, 'manage'],
    [supervisorIn, 'manage'],
    [managerOut, 'manage'],
    [supervisorOut, 'manage'],
  ],
  perform_field_work: [
    [agentIn, 'manage'],
    [agentOut, 'manage'],
  ],
  reject_evidence: [[caseApprover, 'manage']],
  approve_recycle: [[caseApprover, 'manage']],
  view_own_company_data: [
    [companyManager, 'view'],
    [companySupervisor, 'view'],
    [companyAdmin, 'view'],
  ],

  // ── การเงิน (Finance) — `25` §7.2/§7.3/§7.4/§7.6 ──
  approve_expense_manager: [
    [managerIn, 'manage'],
    [managerOut, 'manage'],
  ],
  approve_expense_finance: [[finance, 'manage']],
  approve_expense_executive: [[executive, 'manage']],
  request_advance: [
    [agentIn, 'manage'],
    [agentOut, 'manage'],
    [finance, 'view'],
  ],
  // `17` §12 "ดู Payout Batch: บัญชี, ผู้บริหาร (read-only)" — spec ของโมดูลชนะ reference กลาง `25` §7.2
  // (ลำดับเอกสารใน CLAUDE.md) · เดิมไม่มีแถว ⇒ บริหารเปิดแท็บรอบจ่ายแล้วได้ 403 แต่การ์ดโชว์ "0" (UAT R6-F)
  manage_payout_batch: [
    [finance, 'manage'],
    [accounting, 'view'],
    [executive, 'view'],
  ],
  generate_payment_file: [[finance, 'manage']],
  manage_payee_profile: [
    [finance, 'manage'],
    [agentIn, 'view'],
    [agentOut, 'view'],
  ],
  manage_billing: [
    [finance, 'manage'],
    [accounting, 'view'],
    [executive, 'view'],
  ],
  create_adjustment: [[finance, 'manage']],
  approve_adjustment: [
    [finance, 'manage'],
    [executive, 'manage'],
  ],
  // 🔒 ล็อกกับ Executive (`25` §7.4 "✅ only")
  approve_adjustment_locked: [[executive, 'manage']],
  view_finance_dashboard: [
    [finance, 'view'],
    [accounting, 'view'],
    [executive, 'view'],
  ],

  // ── บัญชี (Accounting) — `25` §7.3/§7.4/§7.5 ──
  manage_accounting_period: [[accounting, 'manage']],
  // 🔒 ล็อกกับ Executive (`25` §7.4 "✅ only")
  unlock_period: [[executive, 'manage']],
  manage_tax_invoice: [[accounting, 'manage']],
  manage_wht: [
    [accounting, 'manage'],
    [finance, 'view'],
  ],
  manage_sales_expenses: [
    [accounting, 'manage'],
    [finance, 'view'],
  ],
  map_cost_center: [
    [accounting, 'manage'],
    [finance, 'view'],
  ],
  manage_exceptions: [
    [accounting, 'manage'],
    [finance, 'view'],
  ],
  // 🔒 ล็อกกับ Executive (`25` §7.5 "✅ only")
  authorize_exception: [[executive, 'manage']],
  manage_bank_reconciliation: [
    [accounting, 'manage'],
    [finance, 'view'],
  ],
  manage_accountant_questions: [
    [accounting, 'manage'],
    [finance, 'view'],
  ],
  export_accounting_pack: [
    [accounting, 'manage'],
    [finance, 'view'],
  ],

  // ── บริหาร (Management) — `25` §7.1 ──
  // manage_companies / manage_service_fees / manage_tax_profiles / manage_period_lock_policy /
  // manage_invoice_numbering / manage_roles = 🔒 Superadmin เท่านั้น → ไม่มี record ตามนิยาม
  view_master_data: [
    [adminOffice, 'view'],
    [finance, 'view'],
    [accounting, 'view'],
    [executive, 'view'],
  ],
  record_admin_data: [[adminOffice, 'manage']],

  // ── capability นอก matrix ที่โมดูลเจ้าของสิทธิ์ผูกแล้ว (ดูหมายเหตุหัวไฟล์) ──
  // แผนค่าตอบแทน `11` §12 (Phase 1.7): manage = Superadmin/บริหาร/การเงิน · view = บัญชี/ผู้จัดการทีม
  // ค่าตั้งภาษีหัก ณ ที่จ่าย (มติ PO 05/10/2569 UAT U8): Superadmin (ไม่มี record) + บริหาร แก้ได้ ·
  // การอ่านค่าตั้งใช้ `view_master_data` เหมือนอัตรา VAT
  manage_wht_policy: [[executive, 'manage']],
  // 50 ทวิ ที่ลูกค้าหักเรา (มติ PO 05/10/2569 U40 — ผู้ใช้: "ธุรการจะได้ช่วยตาม 50 ทวิ ได้ด้วย")
  // จัดการ = ธุรการ/การเงิน/บัญชี · บริหาร ดูอย่างเดียว · Superadmin ไม่มี record โดยนิยาม
  manage_customer_wht: [
    [adminOffice, 'manage'],
    [finance, 'manage'],
    [accounting, 'manage'],
    [executive, 'view'],
  ],
  manage_compensation_plans: [
    [executive, 'manage'],
    [finance, 'manage'],
    [accounting, 'view'],
    [managerIn, 'view'],
    [managerOut, 'view'],
  ],
  // ผู้ใช้งาน `08` §12 + `05` §12 (Phase 1.9): manage = Superadmin (ไม่มี record) / ธุรการ ·
  // view = บริหาร (ระดับองค์กร) และผู้จัดการทีมติดตามทรัพย์ (เห็นเฉพาะคนในทีมตัวเอง — scope
  // ระดับแถวบังคับที่ `lib/users/queries.ts` ไม่ใช่ที่ access_level)
  // เงินทดรองจ่าย `15` §5 ("การเงิน — อนุมัติ Advance · Full") + `15` §12 (UAT BUG-047):
  // อนุมัติ/ปฏิเสธ = การเงินระดับ manage · ไม่มีแถว = Superadmin คนเดียวทำได้ (ขัดสเปค)
  approve_advance: [[finance, 'manage']],
  // คลังสินค้า `44` §5 + §13 (มติ PO 03/10/2569 UAT Q1 · BUG-063): ธุรการเป็นผู้ทำงานคลังทั้งสาย —
  // รับเข้า/ตรวจ IMEI/ตีกลับ/สร้างล็อต/นัดวัน/แนบเอกสาร/ยืนยัน · ไม่มีแถว = Superadmin คนเดียวทำได้
  // ⇒ ปิดงานสำเร็จแล้วไม่มีใครรับแจ้งเตือน "รอรับเข้าคลัง" · สิทธิ์ดูของการเงิน/บัญชี/บริหารมาจาก
  // `view_master_data` อยู่แล้ว (`lib/warehouse/permissions.ts`)
  // ผู้จัดการ/หัวหน้าทีม = **อ่านอย่างเดียว** เฉพาะทรัพย์ของเคสในทีมที่ตนดูแล (มติ PO 05/10/2569 U22 · BUG-076 ·
  // `06` §7.2 "✅ (read)") — ระดับ `view` เปิดเฉพาะ endpoint อ่านของคลัง (mutation ทุกตัวต้อง `manage`)
  // ขอบเขตทีมบังคับที่ `assetScopeWhere()` · ไม่รับแจ้งเตือน "รอรับเข้าคลัง" (ผู้รับต้องถือ `manage`)
  intake_asset: [
    [adminOffice, 'manage'],
    [managerIn, 'view'],
    [supervisorIn, 'view'],
    [managerOut, 'view'],
    [supervisorOut, 'view'],
  ],
  reject_asset_intake: [[adminOffice, 'manage']],
  create_handover_lot: [[adminOffice, 'manage']],
  confirm_handover_lot: [[adminOffice, 'manage']],
  manage_users: [
    [adminOffice, 'manage'],
    [executive, 'view'],
    [managerIn, 'view'],
    [managerOut, 'view'],
  ],

  // ── นอก matrix: บันทึกการใช้งาน (`90` §12) — อ่านอย่างเดียวทุก role ที่ได้สิทธิ์ ──
  // `90` §12 ระบุ "Superadmin/บริหาร/บัญชี/การเงิน" · Superadmin ไม่มี record โดยนิยาม (DEC-009)
  view_audit_log: [
    [executive, 'view'],
    [finance, 'view'],
    [accounting, 'view'],
  ],

  // ── นอก matrix: งานเบื้องหลัง (`91` §12) ──
  // "Trigger job = allowed module role ตาม action" ⇒ คนที่สั่งงานจริงคือเจ้าของโมดูลนั้น ๆ ผ่าน
  // ปุ่มของโมดูลเอง (ส่งออกชุดบัญชี/สร้างไฟล์โอน) · หน้า Job Log เป็นหน้ากลางไว้ "ดูสถานะ"
  // ⇒ default ให้ระดับ `view` กับบริหาร/บัญชี/การเงิน · `manage` (สั่งงานตรงจาก Job Log) และ
  //   retry เป็นของ Superadmin ซึ่งไม่เก็บ record ตามนิยาม (DEC-009)
  manage_jobs: [
    [executive, 'view'],
    [finance, 'view'],
    [accounting, 'view'],
  ],

  // ── นอก matrix: พอร์ทัลบริษัทไฟแนนซ์ (มติ PO 05/10/2569 U6/O43 D1 · `97` §3.3 · `07` §5.3) ──
  // ผู้จัดการ = ทุกหมวด · หัวหน้า = ภาพรวม/เคส + ส่งมอบ + ข้อมูลบริษัท (ไม่เห็นการเงิน) ·
  // แอดมิน = เคส + ข้อมูลบริษัท · ดาวน์โหลด = ทุก role (ไฟล์ที่โหลดได้จำกัดตามหมวดที่เห็น — บังคับที่ guard)
  portal_cases: [
    [companyManager, 'view'],
    [companySupervisor, 'view'],
    [companyAdmin, 'view'],
  ],
  portal_finance: [[companyManager, 'view']],
  portal_handover: [
    [companyManager, 'view'],
    [companySupervisor, 'view'],
  ],
  portal_profile: [
    [companyManager, 'view'],
    [companySupervisor, 'view'],
    [companyAdmin, 'view'],
  ],
  portal_download: [
    [companyManager, 'view'],
    [companySupervisor, 'view'],
    [companyAdmin, 'view'],
  ],

  // ── นอก matrix: ผู้ใช้ภายในดูพอร์ทัลในฐานะลูกค้า (มติ PO 05/10/2569 U59 · `97` §13.1) ──
  // ค่าเริ่มต้น = ธุรการ (ช่วยลูกค้า) · Superadmin โดยนิยาม (ไม่มี record) · role ภายในอื่นมอบได้ที่หน้าจัดการ Role
  view_client_portal_as: [[adminOffice, 'view']],
}

/**
 * capability นอก Functional Matrix 37 รายการ ที่ถูกผูกไปแล้วโดย task ของโมดูลเจ้าของสิทธิ์
 * เพิ่มรายการที่นี่ = ยืนยันว่าตั้งใจผูก (เทสต์กันการผูกเงียบ ๆ ที่ `default-matrix.test.ts`)
 */
export const BOUND_NON_MATRIX_CAPABILITIES: readonly string[] = [
  'manage_compensation_plans',
  'approve_advance',
  'intake_asset',
  'reject_asset_intake',
  'create_handover_lot',
  'confirm_handover_lot',
  'manage_users',
  'view_audit_log',
  'manage_jobs',
  'manage_wht_policy',
  'manage_customer_wht',
  // พอร์ทัลบริษัทไฟแนนซ์ (มติ PO 05/10/2569 U6/O43 D1)
  'portal_cases',
  'portal_finance',
  'portal_handover',
  'portal_profile',
  'portal_download',
  // ผู้ใช้ภายในดูพอร์ทัลในฐานะลูกค้า (มติ PO 05/10/2569 U59)
  'view_client_portal_as',
]

export const DEFAULT_ROLE_CAPABILITIES: readonly DefaultAssignment[] = Object.entries(MATRIX).flatMap(
  ([capabilityCode, grants]) => grants.map(([role, level]) => ({ capabilityCode, role, level })),
)

/**
 * capability code ที่มี default record จริง — **ไม่รวม 6 รายการที่ล็อกไว้กับ Superadmin**
 * (Superadmin ไม่เก็บ record ตามนิยาม) ⇒ 37 − 6 = 31 code
 */
export const DEFAULT_MATRIX_CAPABILITY_CODES: readonly string[] = Object.keys(MATRIX)
