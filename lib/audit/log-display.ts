import { fmtDate, fmtDateTime } from '@/lib/format/datetime'
import { auditEnumValueLabel } from '@/lib/audit/field-display'
import {
  AUDIT_LIST_REF_DISPLAY_LIMIT,
  auditListFieldRefType,
  auditReplaceNestedRefs,
  auditReplaceTextRefs,
  isAuditRefField,
} from '@/lib/audit/target-refs'
import { fmtSatangSymbol } from '@/lib/format/money'
import type { AuditAction } from '@/lib/generated/prisma/enums'
import type { AuditLoginFailure } from '@/lib/audit/log-types'
import type { StatusBadgeGroup } from '@/lib/ui/status-badge'

/**
 * ป้ายภาษาไทยของหน้าบันทึกการใช้งาน (`90` §8 · mockup `settings.html` แท็บ `auditlog`) — **pure ล้วน**
 *
 * ชื่อ action/ตารางบนหน้าจอต้องอ่านรู้เรื่องโดยไม่ต้องเปิดสคีมา แต่ **ค่าที่เก็บยังเป็น enum/ชื่อตารางเดิม**
 * (`02` §10) — ที่นี่แปลงเพื่อแสดงผลเท่านั้น ห้ามเอาไปใช้เป็นเงื่อนไขทางธุรกิจ
 */

export const AUDIT_ACTION_LABEL: Readonly<Record<AuditAction, string>> = {
  create: 'สร้าง',
  update: 'แก้ไข',
  delete: 'ลบ',
  status_change: 'เปลี่ยนสถานะ',
  approve: 'อนุมัติ',
  reject: 'ปฏิเสธ/ตีกลับ',
  confirm: 'ยืนยัน',
  lock: 'ล็อกงวด',
  unlock: 'ปลดล็อกงวด',
  export: 'ส่งออกข้อมูล',
  import: 'นำเข้าข้อมูล',
  login: 'เข้าสู่ระบบ',
  logout: 'ออกจากระบบ',
  access_denied: 'ถูกปฏิเสธการเข้าถึง',
  view_as: 'ดูพอร์ทัลในฐานะลูกค้า',
  view: 'เปิดดูเอกสารข้อมูลส่วนบุคคล',
}

/** กลุ่มสีของ action — ใช้ 10 กลุ่มสีของ `04` §8.1 เท่านั้น (ห้ามตั้งสีเอง) */
export const AUDIT_ACTION_GROUP: Readonly<Record<AuditAction, StatusBadgeGroup>> = {
  create: 'sent',
  update: 'sent',
  delete: 'critical',
  status_change: 'sent',
  approve: 'success',
  reject: 'warning',
  confirm: 'success',
  lock: 'superseded',
  unlock: 'warning',
  export: 'info',
  import: 'info',
  login: 'neutral',
  logout: 'neutral',
  access_denied: 'warning',
  view_as: 'info',
  view: 'info',
}

/** ชื่อไทยของตารางปลายทางเท่าที่ระบบมีจริง — ตารางที่ยังไม่ได้ตั้งชื่อจะแสดง code ดิบ (ไม่พัง) */
const TARGET_TYPE_LABEL: Readonly<Record<string, string>> = {
  users: 'ผู้ใช้งาน',
  roles: 'บทบาท',
  role_capabilities: 'สิทธิ์ของบทบาท',
  teams: 'ทีมติดตามทรัพย์',
  finance_companies: 'บริษัทไฟแนนซ์',
  finance_company_documents: 'เอกสารบริษัทไฟแนนซ์',
  compensation_plans: 'แผนค่าตอบแทน',
  service_fee_templates: 'เทมเพลตค่าบริการ',
  cases: 'เคส',
  case_documents: 'เอกสารเคส',
  case_assignments: 'การมอบหมายงาน',
  pending_reassignments: 'คำขอเปลี่ยนผู้รับผิดชอบ',
  recycle_requests: 'คำขอรีไซเคิลเคส',
  case_evidences: 'หลักฐานปิดงาน',
  check_ins: 'การเช็คอิน',
  assets: 'ทรัพย์ในคลัง',
  handover_lots: 'ล็อตส่งมอบ',
  expenses: 'รายการเบิก',
  field_day_settlements: 'ค่าน้ำมันเหมา/เบี้ยเลี้ยงรายวัน',
  advances: 'เงินทดรองจ่าย',
  advance_returns: 'การคืนยอดเงินทดรอง',
  payee_recoveries: 'ยอดเรียกคืนจากผู้รับ',
  payee_recovery_collections: 'การหักคืนยอดเรียกคืน',
  substitute_receipts: 'ใบรับรองแทนใบเสร็จรับเงิน',
  substitute_receipt_lines: 'รายการในใบรับรองแทนใบเสร็จ',
  payout_batches: 'รอบจ่ายเงิน',
  payee_profiles: 'ข้อมูลผู้รับเงิน',
  revenues: 'รายได้',
  billing_batches: 'รอบวางบิล',
  document_number_series: 'เลขที่เอกสาร',
  adjustments: 'รายการปรับปรุง',
  accounting_periods: 'รอบบัญชี',
  exceptions: 'ข้อยกเว้น',
  accountant_questions: 'ข้อซักถามสำนักงานบัญชี',
  tax_invoices: 'ใบกำกับภาษี',
  // mytester6 T-024 — ตารางเดียวเก็บทั้งสองชนิด (ป้ายรายแถวแยกด้วย `auditTargetLabelOf()`)
  credit_notes: 'ใบลดหนี้/ใบเพิ่มหนี้',
  wht_certificates: 'หนังสือรับรองหัก ณ ที่จ่าย',
  wht_filing_summaries: 'สรุปยื่น ภ.ง.ด.',
  sales_records: 'รายการขาย',
  expense_records: 'รายการค่าใช้จ่าย',
  bank_transactions: 'รายการเดินบัญชี',
  export_records: 'ประวัติการส่งออก',
  vat_rate_history: 'อัตรา VAT',
  wht_policy_history: 'ค่าตั้งภาษีหัก ณ ที่จ่าย',
  tax_profile_default_history: 'Tax Profile ค่าเริ่มต้นตามประเภทผู้รับ',
  tax_profiles: 'โปรไฟล์ภาษี',
  bank_accounts: 'บัญชีธนาคาร',
  approval_matrices: 'สายอนุมัติ',
  finance_policy_settings: 'นโยบายการเงิน',
  billing_payout_cycles: 'รอบวางบิล/รอบจ่าย',
  billing_cycle_companies: 'บริษัทในรอบวางบิล',
  cost_centers: 'ศูนย์ต้นทุน',
  public_holidays: 'ปฏิทินวันหยุด',
  bank_file_formats: 'รูปแบบไฟล์โอนเงิน',
  organizations: 'องค์กร',
  sessions: 'การเข้าใช้งาน',
  // UAT BUG-131 — ตารางที่ยังไม่มีป้าย (ตัวกรองโชว์ชื่อตารางดิบ)
  capabilities: 'รายการสิทธิ์',
  team_managers: 'ผู้จัดการทีม',
  case_contacts: 'ผู้ติดต่อของเคส',
  case_edit_history: 'ประวัติแก้ไขเคส',
  reassignment_history: 'ประวัติเปลี่ยนผู้รับผิดชอบ',
  assignment_policy_settings: 'นโยบายการมอบหมายงาน',
  data_retention_settings: 'ระยะเก็บเอกสารลูกหนี้',
  device_brands: 'Model Phone — แบรนด์',
  device_models: 'Model Phone — รุ่น',
  device_catalog_settings: 'Model Phone — ค่าตั้ง',
  device_tacs: 'Model Phone — TAC (ยี่ห้อ/รุ่นจาก IMEI)',
  device_tac_updates: 'Model Phone — ประวัติการอัปเดต TAC',
  travel_origins: 'จุดเริ่มเดินทาง',
  close_case_drafts: 'ร่างปิดงาน',
  payout_batch_items: 'รายการในรอบจ่าย',
  cash_receipts: 'รายการรับเงิน',
  bank_transaction_allocations: 'การจับคู่รายการเดินบัญชี',
  customer_wht_certificates: 'หนังสือรับรองหัก ณ ที่จ่ายจากลูกค้า',
  tax_document_template_settings: 'เทมเพลตเอกสาร',
  setting_assumption_confirmations: 'ยืนยันค่าตั้งที่รอนักบัญชี',
  audit_logs: 'บันทึกการใช้งาน',
  notifications: 'การแจ้งเตือน',
  push_subscriptions: 'การรับแจ้งเตือนบนอุปกรณ์',
  report_cache_entries: 'แคชรายงาน',
  notification_outbox: 'คิวแจ้งเตือน',
  jobs: 'งานเบื้องหลังของระบบ',
  files: 'ไฟล์แนบ',
  // ชื่อเป้าหมายแบบเอกพจน์ที่บางโมดูลใช้ใน audit
  revenue: 'รายได้',
  expense: 'รายการเบิก',
  billing_batch: 'รอบวางบิล',
  // ไม่ใช่ตาราง — การเปิดดู/ดาวน์โหลดผ่านพอร์ทัลลูกค้า (mytester2 J2-02: ตัวกรองโชว์ "portal" ดิบ)
  portal: 'พอร์ทัลลูกค้า',
}

export function auditTargetLabel(targetType: string): string {
  return TARGET_TYPE_LABEL[targetType] ?? targetType
}

/**
 * mytester6 T-024 — ป้ายชนิดเป้าหมายของ "แถว" ที่ขึ้นกับชนิดเอกสาร: `credit_notes` เก็บทั้งใบลดหนี้และใบเพิ่มหนี้
 * (`note_type` = credit/debit — มติ PO U19) ⇒ อ่าน `note_type` ใน after/before · ไม่มีข้อมูล = ป้ายของตาราง
 * (server คำนวณใส่ `targetLabel` ของ DTO — รายการไม่ได้ส่ง before/after มาหน้าจอ)
 */
export function auditTargetLabelOf(targetType: string, after: unknown, before: unknown = null): string {
  if (targetType === 'credit_notes') {
    const noteType = payloadString(after, 'note_type') ?? payloadString(before, 'note_type')
    if (noteType === 'debit') return 'ใบเพิ่มหนี้'
    if (noteType === 'credit') return 'ใบลดหนี้'
  }
  return auditTargetLabel(targetType)
}

function payloadString(payload: unknown, key: string): string | null {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null
  const value = (payload as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : null
}

/**
 * ป้าย action ที่ขึ้นกับเป้าหมาย (UAT BUG-127) — `unlock` บน `adjustments` คือ "audit แยก" ของการอนุมัติ
 * รายการปรับปรุงในงวดที่ล็อก (`20` §6.2) **ไม่ใช่การปลดล็อกงวด** — งวดยังล็อกอยู่
 */
const ACTION_LABEL_BY_TARGET: Partial<Record<AuditAction, Readonly<Record<string, string>>>> = {
  unlock: { adjustments: 'อนุมัติปรับปรุงในงวดที่ล็อก' },
}

export function auditActionLabel(action: AuditAction, targetType?: string): string {
  const byTarget = targetType === undefined ? undefined : ACTION_LABEL_BY_TARGET[action]?.[targetType]
  return byTarget ?? AUDIT_ACTION_LABEL[action]
}

/** ป้ายของตัวกรอง action — ตัวกรองไม่รู้เป้าหมาย จึงต้องครอบทุกความหมายของ action นั้น */
export const AUDIT_ACTION_FILTER_LABEL: Readonly<Record<AuditAction, string>> = {
  ...AUDIT_ACTION_LABEL,
  unlock: 'ปลดล็อกงวด / อนุมัติปรับปรุงในงวดที่ล็อก',
}

/**
 * ผู้ดำเนินการที่แสดงบนตาราง — job ของระบบไม่มีชื่อผู้ใช้ (`02` §10 `actor_id` NULL)
 * login ที่ล้มเหลวก็ไม่มี actor แต่ไม่ใช่งานอัตโนมัติ ⇒ แสดงชื่อที่พิมพ์เข้ามา (preship R3-016)
 */
export function auditActorLabel(
  actorName: string | null,
  actorRole: string | null,
  loginFailure: AuditLoginFailure | null = null,
): string {
  if (actorName !== null && actorName !== '') return actorRole === null ? actorName : `${actorName} (${actorRole})`
  if (loginFailure !== null) {
    return loginFailure.identifier === null || loginFailure.identifier === '<invalid>'
      ? 'ไม่ระบุตัวตน'
      : `ไม่ระบุตัวตน (${loginFailure.identifier})`
  }
  return 'ระบบ (งานอัตโนมัติ)'
}

/** แถว audit ของ login/ยืนยันรหัสที่ล้มเหลว — อ่านจาก `after` ที่ `auth-service.ts` ลงไว้ */
export function auditLoginFailureOf(action: AuditAction, after: unknown): AuditLoginFailure | null {
  if (action !== 'login' && action !== 'update') return null
  if (after === null || typeof after !== 'object' || Array.isArray(after)) return null
  const record = after as Record<string, unknown>
  if (record.result !== 'failed' || typeof record.code !== 'string') return null
  return {
    code: record.code,
    identifier: typeof record.identifier === 'string' ? record.identifier : null,
  }
}

const LOGIN_FAILURE_REASON: Readonly<Record<string, string>> = {
  INVALID_CREDENTIALS: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
  LOGIN_RATE_LIMITED: 'ถูกพักชั่วคราว — ใส่รหัสผิดหลายครั้ง',
  ACCOUNT_INACTIVE: 'บัญชีถูกปิดใช้งาน',
  COMPANY_SUSPENDED: 'บริษัทถูกระงับ',
  USER_NOT_PROVISIONED: 'ยังไม่ได้ตั้งค่าบัญชีในระบบ',
}

/** ป้าย + สี + คำอธิบายของแถว — login ที่ล้มเหลวแยกจากสำเร็จ (สีเตือน) */
export function auditRowDisplay(row: {
  action: AuditAction
  targetType: string
  reason: string | null
  loginFailure: AuditLoginFailure | null
}): { label: string; group: StatusBadgeGroup; detail: string } {
  if (row.loginFailure !== null) {
    const label = row.action === 'login' ? 'เข้าสู่ระบบไม่สำเร็จ' : 'ยืนยันรหัสผ่านไม่สำเร็จ'
    const detail = LOGIN_FAILURE_REASON[row.loginFailure.code] ?? row.loginFailure.code
    return {
      label,
      group: row.loginFailure.code === 'LOGIN_RATE_LIMITED' ? 'critical' : 'warning',
      detail: row.reason ?? detail,
    }
  }
  return {
    label: auditActionLabel(row.action, row.targetType),
    group: AUDIT_ACTION_GROUP[row.action],
    detail: row.reason ?? '—',
  }
}

export interface AuditFieldChange {
  field: string
  before: unknown
  after: unknown
}

/**
 * รวม before/after ให้เป็นรายการ "ฟิลด์ที่เปลี่ยน" สำหรับ drawer รายละเอียด
 *
 * - `emitAudit()` action `update` เก็บเฉพาะฟิลด์ที่เปลี่ยนอยู่แล้ว ส่วน action อื่นเก็บ snapshot เต็ม
 *   ⇒ ที่นี่รวมคีย์ของทั้งสองฝั่งแล้วเรียงตามชื่อ เพื่อให้ผู้ตรวจอ่านเทียบได้เสมอ
 * - ค่าที่ไม่ใช่ object (เช่น string ล้วน) ถูกห่อเป็นฟิลด์ชื่อ `value` เพื่อไม่ให้หน้าจอพัง
 */
export function auditFieldChanges(before: unknown, after: unknown): AuditFieldChange[] {
  const beforeMap = toRecord(before)
  const afterMap = toRecord(after)
  const keys = [...new Set([...Object.keys(beforeMap), ...Object.keys(afterMap)])].sort()

  return keys.map((field) => ({
    field,
    before: beforeMap[field] ?? null,
    after: afterMap[field] ?? null,
  }))
}

function toRecord(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) return {}
  if (typeof value !== 'object' || Array.isArray(value)) return { value }
  return value as Record<string, unknown>
}

/** ฟิลด์เงินใน payload ของ audit เขียนได้ทั้ง `net_satang` (snake) และ `netSatang` (camel) */
const SATANG_FIELD = /(^|_)satang$|Satang$/

/** ค่า `TIMESTAMPTZ` ที่ `emitAudit()` เก็บลง before/after เป็น ISO UTC เสมอ */
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/

/** ค่าวันที่ล้วนแบบ `YYYY-MM-DD` (บาง payload เก็บแบบนี้) */
const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/**
 * ทดสอบซ้ำ local LR5-04 — ฟิลด์ที่เป็นคอลัมน์ `DATE` (วันที่ล้วน) ในสคีมา: ลงท้าย `_date`/`Date` + `effective_from/to`
 * (ทุกคอลัมน์ชื่อ `*_date` เป็น `@db.Date`) — ค่า ISO เที่ยงคืน UTC ห้ามแสดงเวลา "07:00"
 */
const DATE_ONLY_FIELD = /(^|_)date$|[a-z]Date$|^effective_(from|to)$|^effective(From|To)$/

export function isAuditDateOnlyField(field: string): boolean {
  return DATE_ONLY_FIELD.test(field)
}

/**
 * ค่าในคอลัมน์ before/after ของ drawer — object/array แสดงเป็น JSON บรรทัดเดียว
 *
 * ⚠️ ค่าที่เก็บใน audit เป็น **satang** และ **ISO ค.ศ.** ตามที่ DB เก็บจริง ⇒ ต้องแปลงที่ชั้นแสดงผล
 * ก่อนขึ้นจอเสมอ ไม่งั้นผู้ตรวจอ่านเงินผิด 100 เท่า (`1250000` = ฿12,500.00) และเห็นปี ค.ศ.
 * (Rule 01 — `DISPLAY_CE_YEAR`) · `field` ไม่ระบุ = แสดงดิบเหมือนเดิม
 */
export function auditValueText(value: unknown, field?: string): string {
  if (value === null || value === undefined) return '—'

  if (typeof value === 'number' && field !== undefined && SATANG_FIELD.test(field)) {
    return fmtSatangSymbol(value)
  }
  if (typeof value === 'string') {
    if (value === '') return '—'
    if (ISO_DATE_ONLY.test(value)) return fmtDate(`${value}T00:00:00Z`)
    if (!ISO_DATETIME.test(value)) return value
    return field !== undefined && isAuditDateOnlyField(field) ? fmtDate(value) : fmtDateTime(value)
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

/**
 * mytester H-06 → mytester6 T-009 — ชื่อฟิลด์ภาษาไทยในตาราง "ค่าก่อน / หลัง" ย้ายไป `lib/audit/field-display.ts`
 * (ป้ายเฉพาะ → แปลทีละคำ → ชื่อเดิม) · export ต่อจากที่นี่ให้ผู้เรียกเดิม
 */
export { auditFieldLabel } from '@/lib/audit/field-display'

/**
 * known H-06 — id ในค่าก่อน/หลังที่ระบบหาชื่อได้ (`refLabels` จาก server) ⇒ ชื่อ/เลขเอกสาร · ไม่พบ = `null`
 * (หน้าจอแสดง UUID ใน tooltip ของค่านั้น)
 */
export function auditRefLabel(value: unknown, field: string, refLabels: Readonly<Record<string, string>>): string | null {
  if (Array.isArray(value)) return auditRefListLabel(value, field, refLabels)
  // `target_id` แบบ polymorphic: server ใส่ป้ายให้เฉพาะเมื่อรู้ชนิดจาก `target_type` ข้างกัน (LR6-01)
  if (typeof value !== 'string' || !isAuditRefField(field)) return null
  return refLabels[value.toLowerCase()] ?? null
}

/**
 * ทดสอบซ้ำ local LR6-01 — รายการ id (`manager_ids` ฯลฯ) ⇒ ชื่อคั่นด้วย ", " · เกินที่แสดงย่อ "+n รายการ"
 * id ที่หาชื่อไม่พบแสดง id ย่อ 8 ตัว · ไม่พบชื่อเลยสักตัว = `null` (แสดงค่าดิบเหมือนเดิม)
 */
function auditRefListLabel(
  value: readonly unknown[],
  field: string,
  refLabels: Readonly<Record<string, string>>,
): string | null {
  if (auditListFieldRefType(field) === null || value.length === 0) return null
  if (!value.every((item): item is string => typeof item === 'string')) return null
  const shown = value.slice(0, AUDIT_LIST_REF_DISPLAY_LIMIT)
  const labels = shown.map((id) => refLabels[id.toLowerCase()] ?? null)
  if (labels.every((label) => label === null)) return null
  const text = shown.map((id, index) => labels[index] ?? id.slice(0, 8)).join(', ')
  const rest = value.length - shown.length
  return rest > 0 ? `${text} +${rest} รายการ` : text
}

/** `auditValueText()` + แปลค่า enum/boolean (`auditEnumValueLabel()`) + ชื่อของ id ที่อ้างถึง (known H-06) */
export function auditValueDisplay(
  value: unknown,
  field: string,
  targetType: string | null,
  refLabels: Readonly<Record<string, string>> = {},
): string {
  const refLabel = auditRefLabel(value, field, refLabels)
  if (refLabel !== null) return refLabel
  // mytester H-06 → mytester6 T-026 — enum/boolean ⇒ ป้ายไทยชุดเดียวกับหน้าจอ (สถานะแยกตามชนิดเป้าหมาย)
  const enumText = auditEnumValueLabel(value, field, targetType)
  if (enumText !== null) return enumText
  // ตรวจซ้ำ staging SV5-R-02 — id ในค่าซ้อน (`revenueByCase[].caseId` · `payload.actorId`) ⇒ ชื่อ (แปลงตอนแสดงเท่านั้น)
  if (value !== null && typeof value === 'object') return JSON.stringify(auditReplaceNestedRefs(value, refLabels))
  // ตรวจซ้ำ staging SV5-R-03 — `source_ref` "bank_transaction:<id>" ⇒ ป้ายรายการเดินบัญชี
  if (typeof value === 'string') {
    const replaced = auditReplaceTextRefs(value, (ref) => refLabels[ref.id.toLowerCase()] ?? null)
    if (replaced !== value) return replaced
  }
  return auditValueText(value, field)
}
