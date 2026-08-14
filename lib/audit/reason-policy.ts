import type { AuditAction } from '@/lib/generated/prisma/enums'
import { normalizeFieldName } from '@/lib/audit/diff'

/**
 * นโยบาย "เมื่อไหร่ต้องมี `reason`" (`90` §13 · Rule 03)
 *
 *   "ข้อมูลที่กระทบเงิน สิทธิ์ ธนาคาร ภาษี หรือการ lock period ต้องบันทึก reason เสมอ"
 *
 * pure ล้วน — ห้าม import อะไรที่แตะ DB (ทดสอบได้โดยไม่ต้องมี Postgres)
 *
 * แปลงประโยคข้างบนเป็นกติกาที่ implement ได้ 4 ข้อ:
 *  1. **action ที่เป็นการแทรกแซง** (`delete`/`reject`/`lock`/`unlock`) → ต้องมี reason ทุกตาราง
 *     (ตรงกับ error code ที่มีอยู่แล้วในไฟล์ 24: `REJECT_REASON_REQUIRED`, `UNLOCK_REQUIRES_EXECUTIVE`, `PERIOD_LOCKED_DIRECT_EDIT`)
 *  2. **ตาราง master/ตั้งค่า** ที่ทุกฟิลด์คืออัตราเงิน/สิทธิ์/บัญชีธนาคาร/ภาษี → ต้องมี reason ทุก mutation
 *  3. **ตารางธุรกรรม** (เอกสารเงิน/ภาษี/ธนาคารที่ระบบสร้างตาม flow ปกติ) → flow ปกติไม่ต้องมี
 *     แต่ **แก้/ลบย้อนหลัง** (`update`/`delete`) = การแทรกแซงมนุษย์ → ต้องมี reason
 *  4. **ตารางที่ sensitivity ขึ้นกับฟิลด์** (users/teams/finance_companies/organizations/cases) →
 *     ต้องมี reason เมื่อฟิลด์ที่เปลี่ยนอยู่ในรายการอ่อนไหว (เช่น เปลี่ยน role, เปลี่ยน snapshot ค่าบริการ)
 *
 * ⚠️ เพิ่มตารางใหม่ใน `02` แล้วต้องมาจัดหมวดที่นี่ด้วย — `reason-policy.test.ts` มียามบังคับให้ทุก
 *    `@@map` ใน `schema.prisma` ถูกจัดหมวดครบ (ไม่งั้นเทสต์แดง)
 * ⚠️ module ใดต้องการเข้มกว่านี้ (เช่น `SUSPEND_REASON_REQUIRED` ของไฟล์ 10) ให้ validate เพิ่มในโมดูลนั้น
 *    — ที่นี่คือ "พื้นขั้นต่ำ" ที่ทุก mutation ต้องผ่าน
 */

export type AuditSensitivity = 'money' | 'permission' | 'bank' | 'tax' | 'period_lock'

/** ข้อ 1 — action ที่ถือเป็นการแทรกแซง ต้องมีเหตุผลเสมอไม่ว่าตารางไหน */
export const REASON_REQUIRED_ACTIONS: readonly AuditAction[] = ['delete', 'reject', 'lock', 'unlock']

/** action ที่ถือว่าเป็น "แก้ย้อนหลังด้วยมือ" ของตารางธุรกรรม (ข้อ 3) */
const MANUAL_EDIT_ACTIONS: readonly AuditAction[] = ['update', 'delete']

/**
 * action ที่เป็นการ "แก้ของเดิม" (ข้อ 4) — `create` ไม่นับ เพราะการสร้างระเบียนใหม่ยังอยู่ใน flow ปกติ
 * ของโมดูลนั้น (ฟอร์มสร้าง user/ทีม/บริษัท ตามไฟล์ 08/09/10 ไม่มีช่องเหตุผล)
 */
const RECORD_CHANGE_ACTIONS: readonly AuditAction[] = ['update', 'delete', 'status_change']

/** ข้อ 2 — ตาราง master/ตั้งค่า: ทุก mutation ต้องมี reason */
export const ALWAYS_SENSITIVE_TARGETS: Readonly<Record<string, AuditSensitivity>> = {
  // อัตรา/นโยบายที่แปลงเป็นเงินโดยตรง
  compensation_plans: 'money',
  service_fee_templates: 'money',
  billing_payout_cycles: 'money',
  finance_policy_settings: 'money',
  cost_centers: 'money',
  // สิทธิ์
  roles: 'permission',
  capabilities: 'permission',
  role_capabilities: 'permission',
  team_managers: 'permission',
  approval_matrices: 'permission',
  // ธนาคาร
  bank_accounts: 'bank',
  bank_file_formats: 'bank',
  payee_profiles: 'bank',
  // ภาษี
  tax_profiles: 'tax',
  vat_rate_history: 'tax',
  tax_document_template_settings: 'tax',
  // ปิด/เปิดงวด
  accounting_periods: 'period_lock',
}

/** ข้อ 3 — ตารางธุรกรรม: ต้องมี reason เมื่อ `update`/`delete` (flow ปกติที่ระบบสร้างเองไม่ต้อง) */
export const TRANSACTIONAL_SENSITIVE_TARGETS: Readonly<Record<string, AuditSensitivity>> = {
  expenses: 'money',
  advances: 'money',
  payout_batches: 'money',
  payout_batch_items: 'money',
  revenues: 'money',
  billing_batches: 'money',
  adjustments: 'money',
  sales_records: 'money',
  cash_receipts: 'money',
  expense_records: 'money',
  tax_invoices: 'tax',
  wht_certificates: 'tax',
  customer_wht_certificates: 'tax',
  wht_filing_summaries: 'tax',
  bank_transactions: 'bank',
  bank_transaction_allocations: 'bank',
}

/** ข้อ 4 — ตารางที่อ่อนไหวเฉพาะบางฟิลด์ */
export const FIELD_SENSITIVE_TARGETS: Readonly<
  Record<string, { sensitivity: AuditSensitivity; fields: readonly string[] }>
> = {
  // ย้าย role / ปิดใช้งาน / ย้ายทีม-บริษัท = เปลี่ยนสิทธิ์และ scope ที่มองเห็น (`07` §6)
  users: { sensitivity: 'permission', fields: ['role_id', 'status', 'team_id', 'company_id', 'supabase_uid'] },
  // ย้าย supervisor / เปลี่ยนแผนค่าตอบแทนของทีม = กระทบสิทธิ์ + เงินของทั้งทีม
  teams: { sensitivity: 'permission', fields: ['supervisor_id', 'compensation_plan_id', 'side', 'status'] },
  finance_companies: {
    sensitivity: 'money',
    fields: [
      'service_fee_template_id',
      'vat_mode',
      'vat_registered',
      'wht_withheld_by_customer_pct',
      'payment_due_days',
      'billing_day',
      'status',
      'tax_id',
      // `10` §13 — ผู้มีอำนาจลงนามกระทบเอกสารทางการ (สัญญา/ใบส่งมอบ) จึงต้องมีเหตุผลเสมอ
      'signer_name',
    ],
  },
  organizations: {
    sensitivity: 'tax',
    fields: [
      'tax_id',
      'vat_registered',
      'tax_invoice_prefix',
      'tax_invoice_seq',
      'tax_invoice_numbering_mode',
      'tax_invoice_digit_length',
      'tax_invoice_last_reset_year',
    ],
  },
  // snapshot ค่าบริการของเคส (`10` §9.2 — snapshot ตอน approved) ห้ามขยับโดยไม่มีเหตุผล
  cases: {
    sensitivity: 'money',
    fields: [
      'service_fee_template_id',
      'service_fee_model_snapshot',
      'service_fee_base_satang',
      'service_fee_rate_pct',
      'service_fee_basis_snapshot',
      'service_fee_charge_on_fail',
    ],
  },
}

/**
 * ตารางที่ไม่กระทบ 5 หมวด — ระบุไว้ให้ครบเพื่อให้ยามในเทสต์จับตารางใหม่ที่ยังไม่ถูกจัดหมวด
 * (`reason` ยังบังคับได้จากข้อ 1 เช่น `delete`/`reject` เสมอ)
 */
export const NON_SENSITIVE_TARGETS: readonly string[] = [
  'case_documents',
  'case_contacts',
  // `38` §6.4 — append-only ประวัติการแก้เคส (ตัว audit จริงของการแก้ยังอยู่ที่ `audit_logs` targetType `cases`)
  'case_edit_history',
  'recycle_requests',
  'case_assignments',
  'check_ins',
  'case_evidences',
  'assets',
  'handover_lots',
  'exceptions',
  'accountant_questions',
  'export_records',
  'notifications',
  'jobs',
  'files',
  'audit_logs',
]

export interface ReasonRequirementInput {
  action: AuditAction
  targetType: string
  /** ฟิลด์ที่เปลี่ยนจริง (จาก `diffRecords`) — ใช้กับตารางกลุ่มข้อ 4 */
  changedFields?: readonly string[]
  /** NULL = background job (`02` §10 — ต้องระบุ job id ใน reason) */
  actorId?: string | null
}

export interface ReasonRequirement {
  required: boolean
  sensitivity?: AuditSensitivity
  /** เหตุผลที่บังคับ — ใส่ลง detail ของ error เพื่อให้ dev รู้ว่าติดกติกาข้อไหน */
  rule?: string
}

const NOT_REQUIRED: ReasonRequirement = { required: false }

/** action ที่ระบบใช้บันทึกเหตุการณ์ auth — ไม่ใช่ mutation ข้อมูลธุรกิจ */
const AUTH_ACTIONS: readonly AuditAction[] = ['login', 'logout']

function matchesSensitiveField(target: string, changedFields: readonly string[] | undefined): boolean {
  const config = FIELD_SENSITIVE_TARGETS[target]
  if (!config) return false
  // ไม่รู้ว่าเปลี่ยนฟิลด์ไหน (ไม่ส่ง before/after มา) → ถือว่าอาจแตะฟิลด์อ่อนไหว = ต้องมี reason
  if (changedFields === undefined) return true
  const sensitive = new Set(config.fields.map(normalizeFieldName))
  return changedFields.some((field) => sensitive.has(normalizeFieldName(field)))
}

/** จัดหมวดตารางตามนโยบาย — `null` = ไม่อยู่ใน 5 หมวดอ่อนไหว */
export function targetSensitivity(targetType: string): AuditSensitivity | null {
  return (
    ALWAYS_SENSITIVE_TARGETS[targetType] ??
    TRANSACTIONAL_SENSITIVE_TARGETS[targetType] ??
    FIELD_SENSITIVE_TARGETS[targetType]?.sensitivity ??
    null
  )
}

/** ตัดสินว่า audit entry นี้ต้องมี `reason` หรือไม่ (ตามกติกา 4 ข้อหัวไฟล์) */
export function reasonRequirement(input: ReasonRequirementInput): ReasonRequirement {
  const { action, targetType, changedFields } = input

  // background job ต้อง trace กลับไปผู้สั่งงานได้เสมอ (`90` §13) — ยกเว้น login ที่ยังระบุตัวตนไม่ได้
  if (input.actorId === null && !AUTH_ACTIONS.includes(action)) {
    return { required: true, rule: 'system_actor' }
  }

  if (REASON_REQUIRED_ACTIONS.includes(action)) {
    return { required: true, sensitivity: targetSensitivity(targetType) ?? undefined, rule: `action:${action}` }
  }

  const always = ALWAYS_SENSITIVE_TARGETS[targetType]
  if (always) return { required: true, sensitivity: always, rule: `master_data:${targetType}` }

  const transactional = TRANSACTIONAL_SENSITIVE_TARGETS[targetType]
  if (transactional && MANUAL_EDIT_ACTIONS.includes(action)) {
    return { required: true, sensitivity: transactional, rule: `manual_edit:${targetType}` }
  }

  if (RECORD_CHANGE_ACTIONS.includes(action) && matchesSensitiveField(targetType, changedFields)) {
    const config = FIELD_SENSITIVE_TARGETS[targetType]
    if (config) return { required: true, sensitivity: config.sensitivity, rule: `sensitive_field:${targetType}` }
  }

  return NOT_REQUIRED
}
