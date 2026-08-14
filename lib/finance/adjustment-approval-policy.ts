import { FinanceError } from '@/lib/finance/errors'
import type { AccountingPeriodStatus } from '@/lib/generated/prisma/enums'

/**
 * ระดับผู้อนุมัติ Adjustment ตามสถานะรอบบัญชีของ**รายการต้นทาง** (`20` §6.2 · `13` §6.11)
 * — **pure ล้วน ไม่มี I/O**
 *
 * | สถานะรอบของรายการต้นทาง | ผู้อนุมัติที่ต้องมี |
 * |---|---|
 * | `collecting` | การเงิน (อนุมัติตัวเองได้ — ถือเป็นการแก้ไขปกติ) |
 * | `sent_to_accountant` | การเงิน **+** บริหาร |
 * | `locked` | บริหาร (+ audit log แยกชัดเจน) |
 *
 * ⚠️ ใช้ **`adjustments.period_status_at_target`** ที่ snapshot ไว้ตอนสร้างรายการ ไม่ใช่สถานะรอบ
 * ปัจจุบัน — รอบอาจถูกปิดเพิ่มระหว่างรออนุมัติ ระดับที่ต้องใช้ต้องนิ่งตั้งแต่วันที่สร้าง (`92` §7.1)
 *
 * ชื่อ role ตรงกับ seed (`prisma/seed.ts` — `07` §5) และชุดเดียวกับ `PERIOD_LOCK_POLICY.unlockApprovers`
 */

export const FINANCE_ROLE = 'การเงิน'
export const EXECUTIVE_ROLE = 'บริหาร'

export interface AdjustmentApprovalPolicy {
  periodStatus: AccountingPeriodStatus
  /** role ที่ต้องอนุมัติ **ครบทุกตัว** จึงจะถือว่าอนุมัติสมบูรณ์ */
  requiredRoles: readonly string[]
  /** `true` = ผู้สร้างรายการอนุมัติเองได้ (`20` §6.2 — รอบ `collecting` เท่านั้น) */
  selfApprovalAllowed: boolean
  /** `true` = ต้องบันทึก audit log แยกชัดเจนเพิ่มจาก log ปกติ (`20` §6.2 แถว `locked`) */
  separateAuditEntry: boolean
  /** ข้อความอธิบายบนหน้าจอ (`20` §8 — ผู้ใช้ต้องเห็นว่าทำไมต้องใช้ระดับนี้) */
  label: string
}

const POLICIES: Record<AccountingPeriodStatus, AdjustmentApprovalPolicy> = {
  collecting: {
    periodStatus: 'collecting',
    requiredRoles: [FINANCE_ROLE],
    selfApprovalAllowed: true,
    separateAuditEntry: false,
    label: 'รอบยังเก็บข้อมูลอยู่ — การเงินอนุมัติได้เอง',
  },
  sent_to_accountant: {
    periodStatus: 'sent_to_accountant',
    requiredRoles: [FINANCE_ROLE, EXECUTIVE_ROLE],
    selfApprovalAllowed: false,
    separateAuditEntry: false,
    label: 'ส่งสำนักงานบัญชีแล้ว — ต้องผ่านทั้งการเงินและผู้บริหาร',
  },
  locked: {
    periodStatus: 'locked',
    requiredRoles: [EXECUTIVE_ROLE],
    selfApprovalAllowed: false,
    separateAuditEntry: true,
    label: 'รอบปิดแล้ว — ผู้บริหารอนุมัติเท่านั้น พร้อมบันทึก audit แยก',
  },
}

/**
 * นโยบายของสถานะหนึ่ง — `null` (ยังไม่มีงวดบัญชีของเดือนนั้น) ถือเป็น `collecting`
 * ตามนิยามของ `13` §6.11 (ยังอยู่ระหว่างเก็บข้อมูล)
 */
export function adjustmentApprovalPolicyFor(
  periodStatus: AccountingPeriodStatus | null,
): AdjustmentApprovalPolicy {
  return POLICIES[periodStatus ?? 'collecting']
}

/** role ที่ยังขาดอยู่ก่อนอนุมัติได้สมบูรณ์ (ว่าง = ครบแล้ว) */
export function missingApproverRoles(
  periodStatus: AccountingPeriodStatus | null,
  approverRoles: readonly string[],
): string[] {
  const required = adjustmentApprovalPolicyFor(periodStatus).requiredRoles
  return required.filter((role) => !approverRoles.includes(role))
}

/**
 * `20` §11 — `INSUFFICIENT_APPROVAL_LEVEL` เมื่อผู้อนุมัติที่มีอยู่ยังไม่ครบระดับที่รอบนั้นต้องใช้
 * (เช่น รายการของรอบ `locked` แต่ผู้อนุมัติไม่ใช่ผู้บริหาร)
 */
export function assertApprovalLevelSufficient(input: {
  periodStatus: AccountingPeriodStatus | null
  /** role ของผู้ที่อนุมัติรายการนี้แล้วทั้งหมด (รวมคนที่กำลังจะกดในครั้งนี้) */
  approverRoles: readonly string[]
}): void {
  const missing = missingApproverRoles(input.periodStatus, input.approverRoles)
  if (missing.length === 0) return
  throw new FinanceError('INSUFFICIENT_APPROVAL_LEVEL', {
    detail: `period_status=${input.periodStatus ?? 'collecting'} missing=${missing.join(',')}`,
    context: { missingRoles: missing },
  })
}

/** `20` §6.2 — รายการของรอบที่ปิดแล้วต้องมี audit log แยก (ไม่ใช่แค่ log ปกติของ mutation) */
export function requiresSeparateAuditEntry(periodStatus: AccountingPeriodStatus | null): boolean {
  return adjustmentApprovalPolicyFor(periodStatus).separateAuditEntry
}
