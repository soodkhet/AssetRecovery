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
 * - capability นอก matrix (`functional_group = null` เช่น `manage_users`, `intake_asset`) **ยังไม่ผูกที่นี่**
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
  manage_payout_batch: [[finance, 'manage']],
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
}

export const DEFAULT_ROLE_CAPABILITIES: readonly DefaultAssignment[] = Object.entries(MATRIX).flatMap(
  ([capabilityCode, grants]) => grants.map(([role, level]) => ({ capabilityCode, role, level })),
)

/**
 * capability code ที่มี default record จริง — **ไม่รวม 6 รายการที่ล็อกไว้กับ Superadmin**
 * (Superadmin ไม่เก็บ record ตามนิยาม) ⇒ 37 − 6 = 31 code
 */
export const DEFAULT_MATRIX_CAPABILITY_CODES: readonly string[] = Object.keys(MATRIX)
