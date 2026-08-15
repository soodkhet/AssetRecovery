import { fmtDateTime } from '@/lib/format/datetime'
import { fmtSatangSymbol } from '@/lib/format/money'
import type { AuditAction } from '@/lib/generated/prisma/enums'
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
}

/** ชื่อไทยของตารางปลายทางเท่าที่ระบบมีจริง — ตารางที่ยังไม่ได้ตั้งชื่อจะแสดง code ดิบ (ไม่พัง) */
const TARGET_TYPE_LABEL: Readonly<Record<string, string>> = {
  users: 'ผู้ใช้งาน',
  roles: 'บทบาท',
  role_capabilities: 'สิทธิ์ของบทบาท',
  teams: 'ทีมติดตามทรัพย์',
  finance_companies: 'บริษัทไฟแนนซ์',
  compensation_plans: 'แผนค่าตอบแทน',
  service_fee_templates: 'เทมเพลตค่าบริการ',
  cases: 'เคส',
  case_documents: 'เอกสารเคส',
  case_assignments: 'การมอบหมายงาน',
  pending_reassignments: 'คำขอเปลี่ยนผู้รับผิดชอบ',
  recycle_requests: 'คำขอรีไซเกิลเคส',
  case_evidences: 'หลักฐานปิดงาน',
  check_ins: 'การเช็คอิน',
  assets: 'ทรัพย์ในคลัง',
  handover_lots: 'ล็อตส่งมอบ',
  expenses: 'รายการเบิก',
  advances: 'เงินทดรองจ่าย',
  payout_batches: 'รอบจ่ายเงิน',
  payee_profiles: 'ข้อมูลผู้รับเงิน',
  revenues: 'รายได้',
  billing_batches: 'รอบวางบิล',
  adjustments: 'รายการปรับปรุง',
  accounting_periods: 'รอบบัญชี',
  exceptions: 'ข้อยกเว้น',
  accountant_questions: 'ข้อซักถามสำนักงานบัญชี',
  tax_invoices: 'ใบกำกับภาษี',
  wht_certificates: 'หนังสือรับรองหัก ณ ที่จ่าย',
  wht_filing_summaries: 'สรุปยื่น ภ.ง.ด.',
  sales_records: 'รายการขาย',
  expense_records: 'รายการค่าใช้จ่าย',
  bank_transactions: 'รายการเดินบัญชี',
  export_records: 'ประวัติการส่งออก',
  vat_rate_history: 'อัตรา VAT',
  tax_profiles: 'โปรไฟล์ภาษี',
  bank_accounts: 'บัญชีธนาคาร',
  approval_matrices: 'สายอนุมัติ',
  finance_policy_settings: 'นโยบายการเงิน',
  billing_payout_cycles: 'รอบวางบิล/รอบจ่าย',
  cost_centers: 'ศูนย์ต้นทุน',
  bank_file_formats: 'รูปแบบไฟล์โอนเงิน',
  organizations: 'องค์กร',
  sessions: 'การเข้าใช้งาน',
}

export function auditTargetLabel(targetType: string): string {
  return TARGET_TYPE_LABEL[targetType] ?? targetType
}

export function auditActionLabel(action: AuditAction): string {
  return AUDIT_ACTION_LABEL[action]
}

/** ผู้ดำเนินการที่แสดงบนตาราง — job ของระบบไม่มีชื่อผู้ใช้ (`02` §10 `actor_id` NULL) */
export function auditActorLabel(actorName: string | null, actorRole: string | null): string {
  if (actorName !== null && actorName !== '') return actorRole === null ? actorName : `${actorName} (${actorRole})`
  return 'ระบบ (งานอัตโนมัติ)'
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
    return ISO_DATETIME.test(value) ? fmtDateTime(value) : value
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}
