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
] as const

export type AuditRefType = (typeof AUDIT_REF_TYPES)[number]

const REF_TYPE_SET: ReadonlySet<string> = new Set(AUDIT_REF_TYPES)

/** ชื่อเป้าหมายแบบเอกพจน์ที่บางโมดูลใช้ใน audit → ตารางจริง */
const TARGET_TYPE_ALIAS: Readonly<Record<string, AuditRefType>> = {
  billing_batch: 'billing_batches',
}

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

export function auditFieldRefType(field: string): AuditRefType | null {
  return FIELD_REF_TYPE[field] ?? null
}

/** เป้าหมายของแถว (ชนิดที่รู้จัก + id เป็น UUID) — ไม่รู้จัก = `null` (แสดง id ย่อเหมือนเดิม) */
export function auditTargetRef(row: { targetType: string; targetId: string | null }): AuditRef | null {
  if (row.targetId === null || !UUID.test(row.targetId)) return null
  const type = auditRefTypeOf(row.targetType)
  return type === null ? null : { type, id: row.targetId }
}

/** ค่าอ้างอิงใน before/after ระดับบนสุด (ฟิลด์ที่รู้จัก + ค่าเป็น UUID) */
export function auditValueRefs(data: unknown): AuditRef[] {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return []
  const refs: AuditRef[] = []
  for (const [field, value] of Object.entries(data as Record<string, unknown>)) {
    const type = auditFieldRefType(field)
    if (type !== null && typeof value === 'string' && UUID.test(value)) refs.push({ type, id: value })
  }
  return refs
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
const ORG_LEVEL_TARGET_LABEL: Readonly<Record<string, string>> = {
  organizations: 'ข้อมูลองค์กร',
  finance_policy_settings: 'นโยบายการเงิน',
  assignment_policy_settings: 'นโยบายการมอบหมายงาน / SLA',
  data_retention_settings: 'ระยะเก็บเอกสารลูกหนี้',
  device_catalog_settings: 'ค่าตั้ง Model Phone',
}

/** ป้ายของค่าตั้งระดับองค์กร — `target_id` ไม่ใช่ id ขององค์กรผู้เรียก = `null` (ใช้ตัวแปลงปกติ) */
export function auditOrgLevelTargetLabel(
  row: { targetType: string; targetId: string | null },
  organizationId: string,
): string | null {
  if (row.targetId === null || row.targetId.toLowerCase() !== organizationId.toLowerCase()) return null
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
