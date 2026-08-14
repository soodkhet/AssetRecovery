/**
 * ค่านโยบายการเงินระดับองค์กร (`13` §6.2.1 · DEC-006/D1) — **pure ล้วน ใช้ร่วม FE/BE**
 *
 * **1 record ต่อองค์กร** (`finance_policy_settings` PK = `organization_id`) — ไม่มี create/delete
 * มีแต่ `GET`/`PATCH` · แถวถูกสร้างจาก seed (`prisma/seed.ts`) และ upsert ให้เองถ้าหาย
 *
 * ค่าทุกตัวเป็นเงิน satang หรือธงนโยบายที่กระทบเงิน ⇒ `reason` บังคับทุก mutation
 * (`lib/audit/reason-policy.ts` จัด `finance_policy_settings` เป็น `money`)
 */

export interface FinancePolicyValues {
  /** `null` = ไม่จำกัดเพดาน (ไฟล์ 15 — `ADVANCE_EXCEEDS_MAX`) */
  advanceMaxAmountPerRequestSatang: number | null
  requirePayeeIdDocument: boolean
  /** ช่วงอายุหนี้ AR Aging เป็น "จำนวนวัน" (ไฟล์ 19 §6.4) */
  arAgingBuckets: number[]
  /** เพดานตัดส่วนต่างค่าธรรมเนียมธนาคารอัตโนมัติ (B4 — มติ PO 2026-08-12) */
  writeOffToleranceSatang: number
  /** D12 — ตัด advance ที่ไม่มีใบเสร็จเป็นลูกหนี้พนักงาน แล้วหักจาก payout รอบถัดไป */
  advanceUnclearedToEmployeeReceivable: boolean
}

/** ค่าเริ่มต้นมาตรฐาน (`13` §6.2.1) — ต้องตรงกับ `@default` ใน `schema.prisma` */
export const DEFAULT_AR_AGING_BUCKETS: readonly number[] = [30, 60, 90]
export const DEFAULT_WRITE_OFF_TOLERANCE_SATANG = 5_000

export const MIN_AGING_BUCKETS = 1
export const MAX_AGING_BUCKETS = 6
/** ช่วงอายุหนี้เกิน 5 ปีไม่มีความหมายทางบัญชี — กันพิมพ์ผิดหลัก */
export const MAX_AGING_BUCKET_DAYS = 1_825

/** ช่วงอายุหนี้ต้องเรียงน้อย→มาก และไม่ซ้ำ — normalize ให้ก่อนเก็บ ไม่ปล่อยให้รายงานเรียงเอง */
export function normalizeFinancePolicyValues(input: FinancePolicyValues): FinancePolicyValues {
  return {
    advanceMaxAmountPerRequestSatang: input.advanceMaxAmountPerRequestSatang,
    requirePayeeIdDocument: input.requirePayeeIdDocument,
    arAgingBuckets: [...new Set(input.arAgingBuckets)].sort((a, b) => a - b),
    writeOffToleranceSatang: input.writeOffToleranceSatang,
    advanceUnclearedToEmployeeReceivable: input.advanceUnclearedToEmployeeReceivable,
  }
}

export function isAgingBucketsValid(buckets: readonly number[]): boolean {
  if (buckets.length < MIN_AGING_BUCKETS || buckets.length > MAX_AGING_BUCKETS) return false
  if (new Set(buckets).size !== buckets.length) return false
  return buckets.every((days) => Number.isInteger(days) && days > 0 && days <= MAX_AGING_BUCKET_DAYS)
}

/**
 * ชื่อช่วงอายุหนี้ที่รายงาน AR Aging (ไฟล์ 19 §6.4) ใช้เป็นหัวคอลัมน์
 * `[30, 60, 90]` → `['0-30 วัน', '31-60 วัน', '61-90 วัน', '90+ วัน']`
 */
export function describeAgingBuckets(buckets: readonly number[]): string[] {
  const sorted = [...new Set(buckets)].sort((a, b) => a - b)
  const last = sorted.at(-1)
  if (last === undefined) return []
  const labels = sorted.map((upper, index) => {
    const previous = sorted[index - 1]
    const lower = previous === undefined ? 0 : previous + 1
    return `${lower}-${upper} วัน`
  })
  labels.push(`${last}+ วัน`)
  return labels
}

/** payload ที่ลง audit — ชื่อคอลัมน์ snake_case ตามตารางจริง (`90` §13) */
export function toFinancePolicyAuditPayload(values: FinancePolicyValues): Record<string, unknown> {
  return {
    advance_max_amount_per_request_satang: values.advanceMaxAmountPerRequestSatang,
    require_payee_id_document: values.requirePayeeIdDocument,
    ar_aging_buckets: values.arAgingBuckets,
    write_off_tolerance_satang: values.writeOffToleranceSatang,
    advance_uncleared_to_employee_receivable: values.advanceUnclearedToEmployeeReceivable,
  }
}
