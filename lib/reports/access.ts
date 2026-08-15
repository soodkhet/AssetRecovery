import { AuthError } from '@/lib/auth/errors'
import type { SessionUser } from '@/lib/auth/types'
import type { ReportCategory, ReportDefinition } from '@/lib/reports/catalog'

/**
 * ยามสิทธิ์ของเมนูรายงาน (`96` §10 Permission Matrix) — **pure ล้วน** ใช้ร่วม FE/BE
 *
 * | หมวด | การเงิน | บัญชี | ผู้จัดการทีม | บริหาร | Superadmin |
 * |---|---|---|---|---|---|
 * | F1–F5 | ✅ | ❌ | ❌ | ✅ | ✅ |
 * | O1–O5 | ❌ | ❌ | ✅ (เฉพาะทีมตัวเอง) | ✅ | ✅ |
 * | A1–A4 | ❌ | ✅ | ❌ | ✅ | ✅ |
 * | E1–E3 | ❌ | ❌ | ❌ | ✅ | ✅ |
 *
 * ### ทำไมประกอบจาก capability ไม่ใช่ชื่อ role
 * DEC-002/DEC-009 บังคับว่าสิทธิ์อยู่ที่ `role_capabilities` — เทียบชื่อ role ตรง ๆ จะพังทันที
 * ที่ลูกค้าเปลี่ยนชื่อ role หรือเพิ่ม role ใหม่ · `02` §12 ไม่มี capability "ดูรายงาน" แยกต่อหมวด
 * (มีแต่ `view_finance_dashboard` ของไฟล์ 14/21) จึงประกอบจาก capability ประจำหน้าที่ของแต่ละฝ่าย
 * แบบเดียวกับ `WAREHOUSE_READ_CAPABILITIES` (2.13) และ `CASE_READ_CAPABILITIES`
 *
 * ### จุดที่พลาดไม่ได้
 * - **การเงินเรียกรายงานหมวด E ต้อง 403** (`96` §14) ⇒ หมวด E ผูกกับ capability ที่ล็อกไว้กับ
 *   บริหารเท่านั้น ("✅ only" ของ `25` §7.4/§7.5) ซึ่งการเงิน/บัญชี/ผู้จัดการไม่มีทางมี
 * - **บัญชีต้องไม่เห็นหมวด F และการเงินต้องไม่เห็นหมวด A** ⇒ หมวด A ต้องเป็นระดับ `manage`
 *   เพราะการเงินถือ `view` ของงานบัญชีหลายตัว (`25` §7.5) การเช็คแค่ "มี capability" จะรั่ว
 * - **ผู้จัดการทีมเห็นหมวด O เฉพาะทีมตัวเอง** ⇒ scope ระดับแถวมาจาก `user.scope` (kind `team`)
 *   ยามตัวนี้ตอบแค่ "เข้าหน้าได้ไหม" — ตัวกรองแถวคือ `reportTeamScope()`
 *
 * ⚠️ `96` §5 (ตาราง Actors) เขียนว่าการเงิน/บัญชีดู E1 ได้ ซึ่ง**ขัดกับ §10 + §14** ของไฟล์เดียวกัน
 * — ยึด §10 (Permission Matrix) เพราะ §14 มี test case ระบุตรงตัวว่า "Finance ดู E1 → 403"
 */

/** capability ที่มีเฉพาะฝ่ายการเงิน (ระดับ manage) — `25` §7.3/§7.4 */
const FINANCE_REPORT_CAPABILITIES = [
  'manage_payout_batch',
  'manage_billing',
  'approve_expense_finance',
  'create_adjustment',
] as const

/** capability ที่มีเฉพาะฝ่ายบัญชี (ระดับ manage) — `25` §7.5 */
const ACCOUNTING_REPORT_CAPABILITIES = [
  'manage_accounting_period',
  'manage_tax_invoice',
  'manage_wht',
  'manage_sales_expenses',
  'export_accounting_pack',
] as const

/** capability ของผู้จัดการ/หัวหน้าทีมติดตามทรัพย์ — `25` §7.2 */
const OPERATIONS_REPORT_CAPABILITIES = ['assign_case', 'approve_expense_manager'] as const

/** capability ที่ล็อกไว้กับบริหารเท่านั้น ("✅ only" — `25` §7.4/§7.5 · `lib/roles/capability-locks.ts`) */
const EXECUTIVE_REPORT_CAPABILITIES = [
  'approve_expense_executive',
  'approve_adjustment_locked',
  'unlock_period',
  'authorize_exception',
] as const

function hasManage(user: SessionUser, capabilities: readonly string[]): boolean {
  return capabilities.some((code) => user.capabilities[code] === 'manage')
}

/** ผู้ใช้เป็น "ฝ่ายบริหาร" หรือไม่ — Superadmin นับด้วยโดยนิยาม (DEC-009) */
export function isExecutiveViewer(user: SessionUser): boolean {
  return user.isSuperadmin || hasManage(user, EXECUTIVE_REPORT_CAPABILITIES)
}

/** ดูรายงานหมวดนี้ได้ไหม (ระดับหน้า — scope ระดับแถวดูที่ `reportTeamScope()`) */
export function canViewReportCategory(user: SessionUser, category: ReportCategory): boolean {
  if (isExecutiveViewer(user)) return true

  switch (category) {
    case 'F':
      return hasManage(user, FINANCE_REPORT_CAPABILITIES)
    case 'A':
      return hasManage(user, ACCOUNTING_REPORT_CAPABILITIES)
    case 'O':
      return hasManage(user, OPERATIONS_REPORT_CAPABILITIES)
    case 'E':
      return false
  }
}

export function canViewReport(user: SessionUser, report: ReportDefinition): boolean {
  return canViewReportCategory(user, report.category)
}

/**
 * ยามของทุก endpoint รายงาน (DEC-002 — ตรวจที่ API layer เสมอ)
 *
 * @throws {AuthError} `PERMISSION_DENIED` (403) — `96` §12 เรียกกรณีนี้ว่า `REPORT_PERMISSION_DENIED`
 * แต่ใช้ code เดิมของ `24` §6.9 ไม่ประกาศซ้ำ (ดูหมายเหตุใน `lib/reports/errors.ts`)
 */
export function assertReportAccess(user: SessionUser, report: ReportDefinition): void {
  if (canViewReport(user, report)) return
  throw new AuthError('PERMISSION_DENIED', `report=${report.code} user=${user.id}`)
}

/** รายงานที่ผู้ใช้คนนี้เห็นได้ — ใช้ทั้งหน้ารวมรายงานและการซ่อนเมนู (UX เท่านั้น ยามจริงอยู่ที่ API) */
export function visibleReports(
  user: SessionUser,
  reports: readonly ReportDefinition[],
): readonly ReportDefinition[] {
  return reports.filter((report) => canViewReport(user, report))
}

/**
 * ทีมที่ผู้ใช้เห็นได้ในรายงานหมวด O — `null` = เห็นทุกทีมในองค์กร (บริหาร/Superadmin)
 * · array = กรองด้วย `teamId IN (...)` เสมอ (ผู้จัดการ/หัวหน้าทีม — `96` §14 "เห็นเฉพาะทีมตัวเอง")
 *
 * รายการว่าง = ไม่สังกัดทีมไหนเลย ⇒ ผู้เรียกต้องคืนผลลัพธ์ว่าง **ห้ามตีความว่า "เห็นทุกทีม"**
 */
export function reportTeamScope(user: SessionUser): readonly string[] | null {
  if (isExecutiveViewer(user)) return null
  return user.scope.kind === 'team' ? user.scope.teamIds : null
}
