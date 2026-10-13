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

/** ป้ายของเคส — รอบติดตามที่ 2 ขึ้นไปบอกรอบ */
export function caseRefLabel(caseRef: string, trackingRound: number): string {
  return trackingRound > 1 ? `${caseRef} (รอบที่ ${trackingRound})` : caseRef
}
