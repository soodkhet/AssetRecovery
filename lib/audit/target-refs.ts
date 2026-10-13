/**
 * known H-06 (mytester) — ชื่อ/เลขเอกสารที่อ่านได้ของ "เป้าหมาย" และค่าอ้างอิงในบันทึกการใช้งาน
 * (เลขเคส · เลขล็อต · เลขรอบวางบิล · ชื่องวด "ตุลาคม 2569" ฯลฯ) แทน UUID — UUID ยังดูได้ใน tooltip/รายละเอียด
 *
 * ส่วนนี้เป็น **pure** (รวบรวมว่าต้องค้นอะไร) · การค้นจริงอยู่ `target-ref-queries.ts` (batch ทีละชนิด ไม่ N+1)
 */

/** ชนิดเป้าหมายที่ระบบแปลงเป็นชื่อที่อ่านได้ (ชื่อตาราง snake_case ตาม `02`) */
export const AUDIT_REF_TYPES = [
  'cases',
  'assets',
  'handover_lots',
  'billing_batches',
  'accounting_periods',
  'exceptions',
  'payout_batches',
  'tax_invoices',
  'credit_notes',
  'wht_certificates',
  'advances',
  'substitute_receipts',
  'users',
  'teams',
  'finance_companies',
  'compensation_plans',
  // ทดสอบซ้ำ local LR5-01 — ชุดส่งบัญชี · แบรนด์ Model Phone · รายการเดินบัญชี · รายการรับเงิน
  'export_records',
  'device_brands',
  'bank_transactions',
  'cash_receipts',
  // mytester5 A5-01 — รายการตั้งค่า (ตั้งค่าระบบจากศูนย์แล้วบันทึกการใช้งานยังเป็น id ย่อ)
  'tax_profiles',
  'tax_profile_default_history',
  'bank_accounts',
  'billing_payout_cycles',
  'approval_matrices',
  'cost_centers',
  'document_number_series',
  'bank_file_formats',
  'service_fee_templates',
  'finance_company_documents',
  'payee_profiles',
  'public_holidays',
  'tax_document_template_settings',
  'device_models',
  'jobs',
  // mytester5 H5-01 — ธุรกรรม/ภาคสนาม/ค่าตั้งที่เหลือ (ครอบทุก target_type ที่โค้ดเขียน audit — ล็อกด้วยเทสต์)
  'expenses',
  'expense_records',
  'adjustments',
  'advance_returns',
  'customer_wht_certificates',
  'sales_records',
  'revenues',
  'case_documents',
  'case_evidences',
  'check_ins',
  'case_assignments',
  'close_case_drafts',
  'field_day_settlements',
  'pending_reassignments',
  'payee_recoveries',
  'payee_recovery_collections',
  'payout_batch_items',
  'accountant_questions',
  'wht_filing_summaries',
  'wht_policy_history',
  'vat_rate_history',
  'setting_assumption_confirmations',
  'device_tacs',
  'roles',
  'role_capabilities',
  'push_subscriptions',
] as const

export type AuditRefType = (typeof AUDIT_REF_TYPES)[number]

const REF_TYPE_SET: ReadonlySet<string> = new Set(AUDIT_REF_TYPES)

/** ชื่อเป้าหมายแบบเอกพจน์ที่บางโมดูลใช้ใน audit → ตารางจริง */
const TARGET_TYPE_ALIAS_MAP = {
  billing_batch: 'billing_batches',
  revenue: 'revenues',
  expense: 'expenses',
  payout_batch: 'payout_batches',
} as const satisfies Record<string, AuditRefType>

export type AuditTargetTypeAlias = keyof typeof TARGET_TYPE_ALIAS_MAP

const TARGET_TYPE_ALIAS: Readonly<Record<string, AuditRefType>> = TARGET_TYPE_ALIAS_MAP

/** ชื่อเป้าหมายเอกพจน์ทั้งหมดที่รู้จัก (ใช้ในเทสต์ความครบ) */
export const AUDIT_TARGET_TYPE_ALIASES: readonly string[] = Object.keys(TARGET_TYPE_ALIAS)

/** ฟิลด์ใน before/after ที่เก็บ id ของตารางอื่น (ทั้ง snake_case และ camelCase ที่โมดูลต่าง ๆ ใช้) */
const FIELD_REF_TYPE: Readonly<Record<string, AuditRefType>> = {
  period_id: 'accounting_periods',
  periodId: 'accounting_periods',
  case_id: 'cases',
  caseId: 'cases',
  lot_id: 'handover_lots',
  lotId: 'handover_lots',
  asset_id: 'assets',
  assetId: 'assets',
  removedAssetId: 'assets',
  billing_batch_id: 'billing_batches',
  billingBatchId: 'billing_batches',
  payout_batch_id: 'payout_batches',
  payoutBatchId: 'payout_batches',
  company_id: 'finance_companies',
  companyId: 'finance_companies',
  team_id: 'teams',
  teamId: 'teams',
  tax_invoice_id: 'tax_invoices',
  taxInvoiceId: 'tax_invoices',
  advance_id: 'advances',
  advanceId: 'advances',
  bank_transaction_id: 'bank_transactions',
  bankTransactionId: 'bank_transactions',
  cash_receipt_id: 'cash_receipts',
  cashReceiptId: 'cash_receipts',
  brand_id: 'device_brands',
  brandId: 'device_brands',
  export_record_id: 'export_records',
  exportRecordId: 'export_records',
  // mytester5 A5-01 — id ของรายการตั้งค่าในค่าก่อน/หลัง
  tax_profile_id: 'tax_profiles',
  taxProfileId: 'tax_profiles',
  inhouse_individual_tax_profile_id: 'tax_profiles',
  inhouse_corporate_tax_profile_id: 'tax_profiles',
  outsource_individual_tax_profile_id: 'tax_profiles',
  outsource_corporate_tax_profile_id: 'tax_profiles',
  bank_account_id: 'bank_accounts',
  bankAccountId: 'bank_accounts',
  cost_center_id: 'cost_centers',
  costCenterId: 'cost_centers',
  cycle_id: 'billing_payout_cycles',
  cycleId: 'billing_payout_cycles',
  service_fee_template_id: 'service_fee_templates',
  serviceFeeTemplateId: 'service_fee_templates',
  statement_format_id: 'bank_file_formats',
  payment_file_format_id: 'bank_file_formats',
  device_model_id: 'device_models',
  deviceModelId: 'device_models',
  payee_id: 'payee_profiles',
  payeeId: 'payee_profiles',
  // mytester5 H5-01 — ฟิลด์อ้างอิงที่พบบ่อยในค่าก่อน/หลัง (เก็บจากข้อมูลจริงของบันทึกการใช้งาน)
  plan_id: 'compensation_plans',
  planId: 'compensation_plans',
  comp_plan_id: 'compensation_plans',
  compPlanId: 'compensation_plans',
  compensation_plan_id: 'compensation_plans',
  compensationPlanId: 'compensation_plans',
  approval_matrix_id: 'approval_matrices',
  approvalMatrixId: 'approval_matrices',
  suggested_team_id: 'teams',
  suggestedTeamId: 'teams',
  assigned_team_id: 'teams',
  assignedTeamId: 'teams',
  finance_company_id: 'finance_companies',
  financeCompanyId: 'finance_companies',
  view_as_company_id: 'finance_companies',
  user_id: 'users',
  userId: 'users',
  agent_id: 'users',
  agentId: 'users',
  from_agent_id: 'users',
  fromAgentId: 'users',
  new_agent_id: 'users',
  newAgentId: 'users',
  supervisor_id: 'users',
  supervisorId: 'users',
  shared_with_user_id: 'users',
  sharedWithUserId: 'users',
  on_behalf_of_user_id: 'users',
  recorded_by: 'users',
  verified_by: 'users',
  approved_by: 'users',
  approvedBy: 'users',
  requested_by: 'users',
  requestedBy: 'users',
  created_by: 'users',
  createdBy: 'users',
  role_id: 'roles',
  roleId: 'roles',
  expense_id: 'expenses',
  expenseId: 'expenses',
  excess_claim_id: 'expenses',
  superseded_by_expense_id: 'expenses',
  supersededByExpenseId: 'expenses',
  expense_record_id: 'expense_records',
  expenseRecordId: 'expense_records',
  adjustment_id: 'adjustments',
  adjustmentId: 'adjustments',
  revenue_id: 'revenues',
  revenueId: 'revenues',
  sales_record_id: 'sales_records',
  salesRecordId: 'sales_records',
  return_id: 'advance_returns',
  returnId: 'advance_returns',
  advance_return_id: 'advance_returns',
  assignment_id: 'case_assignments',
  assignmentId: 'case_assignments',
  new_assignment_id: 'case_assignments',
  newAssignmentId: 'case_assignments',
  evidence_id: 'case_evidences',
  evidenceId: 'case_evidences',
  evidence_approved_id: 'case_evidences',
  evidenceApprovedId: 'case_evidences',
  field_day_settlement_id: 'field_day_settlements',
  fieldDaySettlementId: 'field_day_settlements',
  settlement_id: 'field_day_settlements',
  settlementId: 'field_day_settlements',
  recovery_id: 'payee_recoveries',
  recoveryId: 'payee_recoveries',
  payout_batch_item_id: 'payout_batch_items',
  payoutBatchItemId: 'payout_batch_items',
  matched_billing_id: 'billing_batches',
  matchedBillingId: 'billing_batches',
  matched_payout_id: 'payout_batches',
  matchedPayoutId: 'payout_batches',
  wht_certificate_id: 'wht_certificates',
  whtCertificateId: 'wht_certificates',
  replaces_certificate_id: 'wht_certificates',
  replaces_tax_invoice_id: 'tax_invoices',
  credit_note_id: 'credit_notes',
  creditNoteId: 'credit_notes',
  substitute_receipt_id: 'substitute_receipts',
  substituteReceiptId: 'substitute_receipts',
  replaces_receipt_id: 'substitute_receipts',
  replaces_substitute_receipt_id: 'substitute_receipts',
  replaces_document_id: 'finance_company_documents',
  customer_wht_certificate_id: 'customer_wht_certificates',
  summary_id: 'wht_filing_summaries',
  wht_policy_id: 'wht_policy_history',
  tax_profile_default_id: 'tax_profile_default_history',
  billing_cycle_id: 'billing_payout_cycles',
  billingCycleId: 'billing_payout_cycles',
  bank_file_format_id: 'bank_file_formats',
  job_id: 'jobs',
  jobId: 'jobs',
  question_id: 'accountant_questions',
  questionId: 'accountant_questions',
  exception_id: 'exceptions',
  exceptionId: 'exceptions',
  handover_lot_id: 'handover_lots',
  handoverLotId: 'handover_lots',
  // ทดสอบซ้ำ local LR6-01 — ผู้จัดการทีม (ใช้กับรายการ `manager_ids` ด้วย)
  manager_id: 'users',
  managerId: 'users',
  // ตรวจซ้ำ staging SV5-R-02 — ผู้สั่งงานใน payload ของงานเบื้องหลัง
  actor_id: 'users',
  actorId: 'users',
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface AuditRef {
  type: AuditRefType
  id: string
}

export function auditRefTypeOf(targetType: string): AuditRefType | null {
  const aliased = TARGET_TYPE_ALIAS[targetType]
  if (aliased !== undefined) return aliased
  return REF_TYPE_SET.has(targetType) ? (targetType as AuditRefType) : null
}

/**
 * ฟิลด์ลงท้าย `By`/`_by` ที่**ไม่ใช่**ผู้ใช้ — ตัวเลือกการค้น (`orderBy`/`groupBy`) หรือความสัมพันธ์ไปเอกสารอื่น
 * (`replacedBy`/`supersededBy` ชี้ใบที่มาแทน · `blockedBy` = เหตุที่บล็อก)
 */
const NON_ACTOR_BY_FIELDS: ReadonlySet<string> = new Set([
  'orderBy',
  'order_by',
  'groupBy',
  'group_by',
  'sortBy',
  'sort_by',
  'blockedBy',
  'blocked_by',
  'replacedBy',
  'replaced_by',
  'supersededBy',
  'superseded_by',
])

/**
 * staging SV5-02 — ฟิลด์ "ผู้ทำ" (`uploadedBy`/`cancelled_by`/`managerApprovedBy` ฯลฯ) เก็บ id ผู้ใช้ ⇒ แปลงเป็นชื่อผู้ใช้
 * ทุกตัว ไม่ต้องไล่เพิ่มทีละชื่อในแผนที่ (ค่าที่ไม่ใช่ UUID ไม่ถูกค้นชื่ออยู่แล้ว)
 */
function actorFieldRefType(field: string): AuditRefType | null {
  if (NON_ACTOR_BY_FIELDS.has(field)) return null
  return /^[a-z][A-Za-z0-9]*[a-z0-9]By$/.test(field) || /^[a-z][a-z0-9_]*[a-z0-9]_by$/.test(field) ? 'users' : null
}

export function auditFieldRefType(field: string): AuditRefType | null {
  return FIELD_REF_TYPE[field] ?? actorFieldRefType(field)
}

/** เป้าหมายของแถว (ชนิดที่รู้จัก + id เป็น UUID) — ไม่รู้จัก = `null` (แสดง id ย่อเหมือนเดิม) */
export function auditTargetRef(row: { targetType: string; targetId: string | null }): AuditRef | null {
  if (row.targetId === null || !UUID.test(row.targetId)) return null
  const type = auditRefTypeOf(row.targetType)
  return type === null ? null : { type, id: row.targetId }
}

/**
 * ทดสอบซ้ำ local LR6-01 — ฟิลด์ที่เก็บ **รายการ id** (`manager_ids`/`assetIds`/`approval_flow_role_ids`/
 * `released_expense_ids` ฯลฯ) ⇒ ชนิดของ id ในรายการ จากชื่อเอกพจน์ (`*_ids` → `*_id` · `*Ids` → `*Id`)
 * ถ้าชื่อเต็มไม่รู้จัก ลองตัดคำนำหน้าทีละคำ (`approval_flow_role_id` → `role_id` · `managedTeamId` → `teamId`)
 */
export function auditListFieldRefType(field: string): AuditRefType | null {
  // staging SV5-02 — ชื่อที่มีคำขยายต่อท้ายรายการ (`assetIdsHandedOver`/`revenue_ids_created`) ⇒ ตัดคำขยายทิ้งก่อน
  const snakeSuffixed = /^([a-z][a-z0-9_]*?)_ids_[a-z0-9_]+$/.exec(field)
  const camelSuffixed = /^([a-z][A-Za-z0-9]*?[a-z0-9])Ids[A-Z][A-Za-z0-9]*$/.exec(field)
  const base = snakeSuffixed !== null ? `${snakeSuffixed[1]}_ids` : camelSuffixed !== null ? `${camelSuffixed[1]}Ids` : field
  let singular: string
  if (base.endsWith('_ids')) singular = base.slice(0, -1)
  else if (/[a-z0-9]Ids$/.test(base)) singular = base.slice(0, -1)
  else return null
  const direct = auditFieldRefType(singular)
  if (direct !== null) return direct
  if (singular.includes('_')) {
    const parts = singular.split('_')
    for (let start = 1; start < parts.length - 1; start += 1) {
      const type = auditFieldRefType(parts.slice(start).join('_'))
      if (type !== null) return type
    }
    return null
  }
  const words = singular.split(/(?=[A-Z])/)
  for (let start = 1; start < words.length - 1; start += 1) {
    const rest = words.slice(start).join('')
    const type = auditFieldRefType(`${rest.charAt(0).toLowerCase()}${rest.slice(1)}`)
    if (type !== null) return type
  }
  return null
}

/** ฟิลด์ id แบบ polymorphic — ชนิดอยู่ในฟิลด์ข้างกัน (`target_type`) เช่นค่าหลังของรายการปรับปรุง */
const POLYMORPHIC_REF_FIELDS = [
  { idField: 'target_id', typeField: 'target_type' },
  { idField: 'targetId', typeField: 'targetType' },
] as const

export function isAuditPolymorphicRefField(field: string): boolean {
  return POLYMORPHIC_REF_FIELDS.some((entry) => entry.idField === field)
}

/** จำนวนชื่อสูงสุดที่แสดงต่อรายการ — ที่เหลือย่อเป็น "+n รายการ" (ค้นชื่อเฉพาะที่แสดง) */
export const AUDIT_LIST_REF_DISPLAY_LIMIT = 5

/** ฟิลด์นี้แสดงเป็นชื่อได้ (ค่าเดี่ยว · รายการ id · id แบบ polymorphic) — ใช้ฝั่งหน้าจอ */
export function isAuditRefField(field: string): boolean {
  return auditFieldRefType(field) !== null || auditListFieldRefType(field) !== null || isAuditPolymorphicRefField(field)
}

/**
 * ตรวจซ้ำ staging SV5-R-02 — ความลึกสูงสุดที่ไล่ค่าซ้อน (object/array ของ object เช่น `revenueByCase[].caseId` ·
 * `payload.actorId`) · ระดับบนสุด = 0 · ลึกกว่านี้แสดงค่าดิบ
 */
export const AUDIT_NESTED_REF_MAX_DEPTH = 4

/** จำนวน object สูงสุดต่อ array ที่ไล่หา id (กันค้นชื่อมากเกินในรายการยาว) */
export const AUDIT_NESTED_REF_ITEM_LIMIT = 50

/** ค่านี้เป็น object ธรรมดา (ไม่ใช่ array/null) */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * ค่าอ้างอิงใน before/after (ฟิลด์ที่รู้จัก + ค่าเป็น UUID · รายการ id · id แบบ polymorphic) — ใช้กติกาชื่อฟิลด์เดียวกัน
 * ทุกระดับ และไล่ object/array ของ object ที่ซ้อนอยู่ลึกไม่เกิน {@link AUDIT_NESTED_REF_MAX_DEPTH} (SV5-R-02)
 */
export function auditValueRefs(data: unknown): AuditRef[] {
  if (!isPlainRecord(data)) return []
  const refs: AuditRef[] = []
  collectRecordRefs(data, 0, refs)
  return refs
}

function collectRecordRefs(record: Record<string, unknown>, depth: number, refs: AuditRef[]): void {
  for (const [field, value] of Object.entries(record)) {
    const type = auditFieldRefType(field)
    if (type !== null && typeof value === 'string' && UUID.test(value)) {
      refs.push({ type, id: value })
      continue
    }
    if (typeof value === 'string') {
      refs.push(...auditTextRefs(value))
      continue
    }
    const listType = Array.isArray(value) ? auditListFieldRefType(field) : null
    if (listType !== null && Array.isArray(value)) {
      for (const item of value.slice(0, AUDIT_LIST_REF_DISPLAY_LIMIT)) {
        if (typeof item === 'string' && UUID.test(item)) refs.push({ type: listType, id: item })
      }
      continue
    }
    collectNestedRefs(value, depth + 1, refs)
  }
  for (const { idField, typeField } of POLYMORPHIC_REF_FIELDS) {
    const id = record[idField]
    const targetType = record[typeField]
    if (typeof id !== 'string' || !UUID.test(id) || typeof targetType !== 'string') continue
    const type = auditRefTypeOf(targetType)
    if (type !== null) refs.push({ type, id })
  }
}

function collectNestedRefs(value: unknown, depth: number, refs: AuditRef[]): void {
  if (depth > AUDIT_NESTED_REF_MAX_DEPTH) return
  if (isPlainRecord(value)) {
    collectRecordRefs(value, depth, refs)
    return
  }
  if (!Array.isArray(value)) return
  for (const item of value.slice(0, AUDIT_NESTED_REF_ITEM_LIMIT)) {
    if (isPlainRecord(item)) collectRecordRefs(item, depth, refs)
  }
}

/**
 * ค่าซ้อน (object/array) ที่แทน id ด้วยชื่อแล้ว — ใช้ตอนแสดงผลเท่านั้น (ข้อมูล audit ไม่ถูกแก้)
 * กติกาเดียวกับ {@link auditValueRefs}: ฟิลด์ id เดี่ยว · รายการ id · `target_id` ที่ server ใส่ป้ายให้ · id ที่หาชื่อไม่พบคงเดิม
 * `depth` = ระดับของ `value` (ค่าของฟิลด์ระดับบนสุด = 1)
 */
export function auditReplaceNestedRefs(
  value: unknown,
  refLabels: Readonly<Record<string, string>>,
  depth = 1,
): unknown {
  if (depth > AUDIT_NESTED_REF_MAX_DEPTH) return value
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      index < AUDIT_NESTED_REF_ITEM_LIMIT && isPlainRecord(item) ? auditReplaceNestedRefs(item, refLabels, depth) : item,
    )
  }
  if (!isPlainRecord(value)) return value
  const out: Record<string, unknown> = {}
  for (const [field, fieldValue] of Object.entries(value)) {
    if (typeof fieldValue === 'string' && UUID.test(fieldValue) && isAuditRefField(field)) {
      out[field] = refLabels[fieldValue.toLowerCase()] ?? fieldValue
    } else if (Array.isArray(fieldValue) && auditListFieldRefType(field) !== null) {
      out[field] = fieldValue.map((item) =>
        typeof item === 'string' && UUID.test(item) ? (refLabels[item.toLowerCase()] ?? item) : item,
      )
    } else if (fieldValue !== null && typeof fieldValue === 'object') {
      out[field] = auditReplaceNestedRefs(fieldValue, refLabels, depth + 1)
    } else {
      out[field] = fieldValue
    }
  }
  return out
}

/**
 * ตรวจซ้ำ staging SV5-R-03 — อ้างอิงรายการเดินบัญชีที่ฝังในข้อความ (`reason` / `source_ref`) ของข้อมูลเดิม:
 * `bank_transaction:<UUID>[:rematch]` และ "รายการเดินบัญชี <UUID>" ⇒ แปลงเป็นป้ายตอนแสดงเท่านั้น (audit immutable)
 */
const TEXT_BANK_TRANSACTION_REF =
  /(?:bank_transaction:|(?<=รายการเดินบัญชี ))([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(:rematch)?/gi

/** ส่วนท้ายของป้ายเมื่ออ้างถึงรอบวางบิลเดิมหลังเปลี่ยนการจับคู่ */
export const BANK_TRANSACTION_REMATCH_SUFFIX = ' (เปลี่ยนการจับคู่ — ปรับยอดรอบเดิม)'

/** id รายการเดินบัญชีที่อ้างในข้อความ */
export function auditTextRefs(text: string | null | undefined): AuditRef[] {
  if (text === null || text === undefined || text === '') return []
  return [...text.matchAll(TEXT_BANK_TRANSACTION_REF)].flatMap((match) =>
    match[1] === undefined ? [] : [{ type: 'bank_transactions' as const, id: match[1] }],
  )
}

/** แทนอ้างอิงในข้อความด้วยป้าย (`labelOf` คืน `null` = หาไม่พบ ⇒ คงข้อความเดิม) */
export function auditReplaceTextRefs(text: string, labelOf: (ref: AuditRef) => string | null): string {
  return text.replace(TEXT_BANK_TRANSACTION_REF, (whole, id: string, rematch: string | undefined) => {
    const label = labelOf({ type: 'bank_transactions', id })
    if (label === null) return whole
    return rematch === undefined ? label : `${label}${BANK_TRANSACTION_REMATCH_SUFFIX}`
  })
}

/** รวม id ต่อชนิด (ไม่ซ้ำ) — ใช้ค้นทีละชนิดครั้งเดียว */
export function groupAuditRefs(refs: readonly AuditRef[]): Map<AuditRefType, string[]> {
  const grouped = new Map<AuditRefType, Set<string>>()
  for (const ref of refs) {
    const set = grouped.get(ref.type) ?? new Set<string>()
    set.add(ref.id.toLowerCase())
    grouped.set(ref.type, set)
  }
  return new Map([...grouped].map(([type, ids]) => [type, [...ids]]))
}

/** ป้ายของชุดส่งบัญชี — "ชุดส่งบัญชี ตุลาคม 2569 v1.2" (`versionLabel` จาก `exportVersionLabel()`) */
export function exportRecordRefLabel(periodLabel: string, versionLabel: string): string {
  return `ชุดส่งบัญชี ${periodLabel} ${versionLabel}`
}

/** ป้ายของรายการเดินบัญชี — วันที่ · ยอด · ธนาคาร (ค่าที่จัดรูปแบบแล้ว) */
export function bankTransactionRefLabel(dateText: string, amountText: string, bankName: string): string {
  return `${dateText} · ${amountText} · ${bankName}`
}

/** ป้ายของรายการรับเงิน — เลขรอบวางบิล · ยอด */
export function cashReceiptRefLabel(batchNumber: string, amountText: string): string {
  return `รับเงิน ${batchNumber} · ${amountText}`
}

/**
 * mytester5 A5-01 — ค่าตั้งระดับองค์กร (1 แถวต่อองค์กร) ลง `target_id` = id ขององค์กร ⇒ ไม่มี "ชื่อรายการ"
 * ให้แสดง (เดิมขึ้น "00000000") — ใช้ชื่อหมวดของค่าตั้งแทน
 * เกณฑ์ SLA เก็บในตาราง `assignment_policy_settings` (`13` §6.14 — คอลัมน์ `sla_alert_hours`) จึงใช้ป้ายรวมทั้งสองหน้าจอ
 */
const ORG_LEVEL_TARGET_LABEL_MAP = {
  organizations: 'ข้อมูลองค์กร',
  finance_policy_settings: 'นโยบายการเงิน',
  assignment_policy_settings: 'นโยบายการมอบหมายงาน / SLA',
  data_retention_settings: 'ระยะเก็บเอกสารลูกหนี้',
  device_catalog_settings: 'ค่าตั้ง Model Phone',
} as const satisfies Record<string, string>

export type AuditOrgLevelTargetType = keyof typeof ORG_LEVEL_TARGET_LABEL_MAP

const ORG_LEVEL_TARGET_LABEL: Readonly<Record<string, string>> = ORG_LEVEL_TARGET_LABEL_MAP

/** ชนิดค่าตั้งระดับองค์กรที่แสดงชื่อหมวดแทนชื่อรายการ (ใช้ในเทสต์ความครบ) */
export const AUDIT_ORG_LEVEL_TARGET_TYPES: readonly string[] = Object.keys(ORG_LEVEL_TARGET_LABEL)

/**
 * mytester5 H5-01 — target_type ที่ **ตั้งใจไม่แปลงชื่อ** (แสดง id ย่อตามสเปก) พร้อมเหตุผล
 * เทสต์ความครบ (`target-refs.test.ts`) อนุญาตเฉพาะชุดนี้ — เพิ่มชนิดใหม่ใน audit ต้องมีตัวแปลงหรือเหตุผลที่นี่
 */
const TARGET_TYPES_WITHOUT_REF_MAP = {
  // `target_id` = id ที่ผู้ใช้พอร์ทัลส่งมา (สุ่ม/ของบริษัทอื่น) — ห้ามค้นชื่อ (ไม่ยืนยันว่ามีจริง) · ปกติเป็น null
  portal: 'ไม่ใช่ตาราง — การเข้าถึงพอร์ทัลที่ถูกปฏิเสธ',
} as const satisfies Record<string, string>

export const AUDIT_TARGET_TYPES_WITHOUT_REF: Readonly<Record<string, string>> = TARGET_TYPES_WITHOUT_REF_MAP

/**
 * mytester5 รีวิว H5-01 — `target_type` ที่เขียนลงบันทึกการใช้งานได้ (ตรวจตอน compile ผ่าน `AuditEntry.targetType`):
 * ชนิดที่มีตัวค้นชื่อ · ชื่อเอกพจน์ที่รู้จัก · ค่าตั้งระดับองค์กร · ชุดยกเว้นที่มีเหตุผล — เพิ่มชนิดใหม่ต้องเพิ่มตัวแปลงชื่อก่อน
 */
export type AuditTargetType =
  | AuditRefType
  | AuditTargetTypeAlias
  | AuditOrgLevelTargetType
  | keyof typeof TARGET_TYPES_WITHOUT_REF_MAP

/**
 * mytester5 H5-01 — เป้าหมายที่แถวต้นทางถูกลบจริงหลังใช้งาน (ร่างปิดงานถูกลบเมื่อส่งปิดงาน) ⇒ ใช้ค่าอ้างอิงใน
 * ค่าหลัง (เคสของร่าง) เป็นป้ายแทนเมื่อหาแถวเป้าหมายไม่พบ
 */
const TARGET_CONTEXT_FIELDS: Readonly<Partial<Record<AuditRefType, readonly string[]>>> = {
  close_case_drafts: ['caseId', 'case_id'],
}

/** ค่าอ้างอิงสำรองของเป้าหมาย (จาก `after`) — ชนิดที่ไม่มีฟิลด์สำรอง/ไม่มีค่า = `null` */
export function auditTargetContextRef(row: { targetType: string; afterData?: unknown }): AuditRef | null {
  const type = auditRefTypeOf(row.targetType)
  const fields = type === null ? undefined : TARGET_CONTEXT_FIELDS[type]
  const data = row.afterData
  if (fields === undefined || data === null || typeof data !== 'object' || Array.isArray(data)) return null
  for (const field of fields) {
    const value = (data as Record<string, unknown>)[field]
    const refType = auditFieldRefType(field)
    if (refType !== null && typeof value === 'string' && UUID.test(value)) return { type: refType, id: value }
  }
  return null
}

/** คีย์ของป้ายในผลค้น — แยกตามชนิด (id เดียวกันแปลงต่างกันได้ เช่น ผู้ใช้ กับ อุปกรณ์รับแจ้งเตือนของผู้ใช้) */
export function auditRefKey(ref: AuditRef): string {
  return `${ref.type}:${ref.id.toLowerCase()}`
}

/**
 * mytester5 รีวิว H5-01 — เปิดดูเอกสารยืนยันตัวตนที่ยังไม่ผูกผู้รับเงิน ลง audit ที่องค์กร (`buildPersonalFileViewAudit()`)
 * ⇒ ป้ายเฉพาะแทน "ข้อมูลองค์กร" (ไม่ได้แตะข้อมูลองค์กรจริง)
 */
export const UNLINKED_ID_DOCUMENT_TARGET_LABEL = 'เอกสารยืนยันตัวตน (ยังไม่ผูกผู้รับ)'

function isUnlinkedIdDocumentView(row: { targetType: string; action?: string; afterData?: unknown }): boolean {
  if (row.targetType !== 'organizations' || row.action !== 'view') return false
  const data = row.afterData
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return false
  return (data as Record<string, unknown>).kind === 'payee_id_document'
}

/** ป้ายของค่าตั้งระดับองค์กร — `target_id` ไม่ใช่ id ขององค์กรผู้เรียก = `null` (ใช้ตัวแปลงปกติ) */
export function auditOrgLevelTargetLabel(
  row: { targetType: string; targetId: string | null; action?: string; afterData?: unknown },
  organizationId: string,
): string | null {
  if (row.targetId === null || row.targetId.toLowerCase() !== organizationId.toLowerCase()) return null
  if (isUnlinkedIdDocumentView(row)) return UNLINKED_ID_DOCUMENT_TARGET_LABEL
  return ORG_LEVEL_TARGET_LABEL[row.targetType] ?? null
}

/** ป้ายของศูนย์ต้นทุน — "CC-001 ทีมติดตาม Inhouse" */
export function costCenterRefLabel(code: string, name: string): string {
  return `${code} ${name}`
}

/** ป้ายของรายการที่มีหลายฉบับ (เทมเพลตค่าบริการ) — "ชื่อ (ฉบับที่ n)" */
export function versionedRefLabel(name: string, version: number): string {
  return `${name} (ฉบับที่ ${version})`
}

/** ป้ายของวันหยุด — "13/10/2569 วันคล้ายวันสวรรคต ร.9" (`dateText` จัดรูปแบบ พ.ศ. แล้ว) */
export function holidayRefLabel(dateText: string, name: string): string {
  return `${dateText} ${name}`
}

/** ป้ายของบัญชีธนาคาร — ธนาคาร + เลขบัญชีที่ปิดบังแล้ว */
export function bankAccountRefLabel(bankName: string, maskedNumber: string): string {
  return `${bankName} ${maskedNumber}`
}

/** ป้ายของรูปแบบไฟล์ธนาคาร — "ไฟล์โอนเงิน กสิกรไทย" */
export function bankFileFormatRefLabel(purpose: 'statement' | 'payment', bankName: string): string {
  return `${purpose === 'statement' ? 'ไฟล์เดินบัญชี' : 'ไฟล์โอนเงิน'} ${bankName}`
}

/** ป้ายของเอกสารบริษัทไฟแนนซ์ — "หนังสือรับรองบริษัท · ไฟแนนซ์ A (ฉบับที่ 2)" */
export function companyDocumentRefLabel(documentLabel: string, companyName: string, version: number): string {
  return `${documentLabel} · ${companyName}${version > 1 ? ` (ฉบับที่ ${version})` : ''}`
}

/** ป้ายของประวัติค่าเริ่มต้น Tax Profile ตามประเภทผู้รับ — "ฉบับ 13/10/2569 10:00" */
export function taxProfileDefaultRefLabel(dateTimeText: string): string {
  return `ฉบับ ${dateTimeText}`
}

/** ป้ายของงานเบื้องหลัง — ชื่องาน · วันเวลาที่สั่ง */
export function jobRefLabel(jobLabel: string, dateTimeText: string): string {
  return `${jobLabel} · ${dateTimeText}`
}

/** ป้ายของเคส — รอบติดตามที่ 2 ขึ้นไปบอกรอบ */
export function caseRefLabel(caseRef: string, trackingRound: number): string {
  return trackingRound > 1 ? `${caseRef} (รอบที่ ${trackingRound})` : caseRef
}

// ── mytester5 H5-01 — ป้ายของธุรกรรม/ภาคสนาม (pure — รับค่าที่จัดรูปแบบแล้ว) ─────────────────

/** ข้อความสั้นของรายการ (ข้อซักถามนักบัญชี) — ยุบช่องว่าง · ยาวเกินตัดด้วย "…" */
export function shortRefText(text: string, max = 40): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

/** รายการเบิก — "ค่าน้ำมัน MTJ-2569-01 ฿72.36" (ไม่มีเคส = ชื่อผู้รับเงิน) */
export function expenseRefLabel(typeLabel: string, owner: string, amountText: string): string {
  return `${typeLabel} ${owner} ${amountText}`
}

/** ยอดปรับปรุงแบบมีทิศ (แสดงผลเท่านั้น) — ลดยอด = ติดลบ · ไม่ throw (หน้าบันทึกการใช้งานต้องไม่ล้ม) */
export function signedAdjustmentDisplaySatang(adjustmentType: 'increase' | 'decrease', amountSatang: number): number {
  return adjustmentType === 'decrease' ? -Math.abs(amountSatang) : Math.abs(amountSatang)
}

/** รายการปรับปรุง — "ลดยอด SPC-2569-0005 −฿100.00" (`signedAmountText` มีเครื่องหมายแล้ว) */
export function adjustmentRefLabel(typeLabel: string, targetRef: string, signedAmountText: string): string {
  return `${typeLabel} ${targetRef} ${signedAmountText}`
}

/** การมอบหมาย — "MTJ-2569-01 → อนันต์" */
export function assignmentRefLabel(caseLabel: string, agentName: string): string {
  return `${caseLabel} → ${agentName}`
}

/** คำขอเปลี่ยนผู้รับผิดชอบ — "MTJ-2569-01: สมชาย → อนันต์" */
export function reassignmentRefLabel(caseLabel: string, fromName: string, toName: string): string {
  return `${caseLabel}: ${fromName} → ${toName}`
}

/** รายการที่ผูกกับเคส — "MTJ-2569-01 · สำเนาสัญญา" */
export function caseScopedRefLabel(caseLabel: string, detail: string): string {
  return `${caseLabel} · ${detail}`
}

/** ค่าน้ำมันเหมา/เบี้ยเลี้ยงรายวัน — "อนันต์ 13/10/2569 ฿250.00" */
export function fieldDaySettlementRefLabel(agentName: string, dateText: string, amountText: string): string {
  return `${agentName} ${dateText} ${amountText}`
}

/** รายการที่ระบุด้วยผู้รับ + ยอด (+ ที่มา) — "สมชาย ฿500.00 · รอบจ่าย ต.ค. #1" */
export function payeeAmountRefLabel(payeeName: string, amountText: string, source?: string | null): string {
  const tail = source?.trim() ?? ''
  return tail === '' ? `${payeeName} ${amountText}` : `${payeeName} ${amountText} · ${tail}`
}

/** 50 ทวิจากลูกค้า — "ไฟแนนซ์ A ฿30.00 (เลขที่ 001/2569)" */
export function customerWhtRefLabel(companyName: string, amountText: string, certificateNumber: string | null): string {
  const number = certificateNumber?.trim() ?? ''
  return number === '' ? `${companyName} ${amountText}` : `${companyName} ${amountText} (เลขที่ ${number})`
}

/** อัตรา VAT — "7.00% ตั้งแต่ 01/01/2569" */
export function vatRateRefLabel(rateText: string, effectiveFromText: string): string {
  return `${rateText} ตั้งแต่ ${effectiveFromText}`
}

/** ฉบับของค่าตั้งที่มีผลตามวันที่ — "ฉบับมีผล 01/10/2569" */
export function effectiveVersionRefLabel(effectiveFromText: string): string {
  return `ฉบับมีผล ${effectiveFromText}`
}

/** TAC ของ Model Phone — "TAC 35391110 · Apple iPhone 15" */
export function deviceTacRefLabel(tac: string, brandName: string, modelName: string): string {
  return `TAC ${tac} · ${brandName} ${modelName}`
}
