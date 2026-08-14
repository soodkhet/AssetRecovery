import type { AccountingPeriodStatus } from '@/lib/generated/prisma/enums'
import { SettingsError } from '@/lib/settings/errors'

/**
 * นโยบายล็อกรอบบัญชี (`13` §6.11) — **pure ล้วน**
 *
 * นโยบายนี้เป็น **กติกาตายตัวขององค์กร ไม่ใช่ค่าที่ตั้งได้รายแถว** — `02` ไม่มีตารางเก็บ
 * (ลำดับความสำคัญเอกสาร: `02` schema ชนะ API draft ใน `13` §13) ดังนั้น
 * `/api/settings/period-lock-policy` เป็น **GET อย่างเดียว** อ่านตารางนี้ออกไปแสดง
 * ส่วนการ "ปลดล็อก" รอบเป็น action ของไฟล์ 30 (`POST /api/periods/:id/unlock`, Phase 4.1)
 * ไม่ใช่การแก้ policy
 *
 * ⚠️ เฟสนี้ให้ **โครง** ของ interceptor เท่านั้น (`assertPeriodEditable`) — จุดเรียกจริงทุก write
 * ของสายการเงิน/บัญชีจะถูกต่อใน Phase 4.1 ตามแผน (`01_PLAN` §4.1)
 */

export interface PeriodLockPolicyRow {
  status: AccountingPeriodStatus
  statusLabel: string
  /** แก้เคส/รายการเดิมได้แค่ไหน */
  directEdit: 'free' | 'limited' | 'blocked'
  directEditLabel: string
  /** ต้องผ่าน Adjustment หรือไม่ */
  adjustmentRequired: 'no' | 'sometimes' | 'always'
  adjustmentLabel: string
  /** ผู้มีอำนาจอนุมัติปลดล็อก */
  unlockApprovers: readonly string[]
}

/** ตาราง `13` §6.11 ตรงทุกช่อง — เปลี่ยนที่นี่ = เปลี่ยนนโยบายองค์กร ต้องแก้ `13` คู่กัน */
export const PERIOD_LOCK_POLICY: readonly PeriodLockPolicyRow[] = [
  {
    status: 'collecting',
    statusLabel: 'กำลังรวบรวม',
    directEdit: 'free',
    directEditLabel: 'แก้ไขได้อิสระ',
    adjustmentRequired: 'no',
    adjustmentLabel: 'ไม่จำเป็น',
    unlockApprovers: ['การเงิน'],
  },
  {
    status: 'sent_to_accountant',
    statusLabel: 'ส่งสำนักงานบัญชีแล้ว',
    directEdit: 'limited',
    directEditLabel: 'จำกัด — เฉพาะฟิลด์ที่ไม่กระทบยอดที่ส่งไปแล้ว',
    adjustmentRequired: 'sometimes',
    adjustmentLabel: 'บางกรณี (เมื่อกระทบยอด)',
    unlockApprovers: ['การเงิน', 'บริหาร'],
  },
  {
    status: 'locked',
    statusLabel: 'ปิดรอบแล้ว',
    directEdit: 'blocked',
    directEditLabel: 'แก้ไขโดยตรงไม่ได้',
    adjustmentRequired: 'always',
    adjustmentLabel: 'บังคับใช้ Adjustment 100%',
    unlockApprovers: ['บริหาร'],
  },
]

export function periodLockPolicyFor(status: AccountingPeriodStatus): PeriodLockPolicyRow {
  const row = PERIOD_LOCK_POLICY.find((policy) => policy.status === status)
  if (!row) throw new Error(`periodLockPolicyFor: ไม่มีนโยบายของสถานะ ${status}`)
  return row
}

/** รอบที่ `locked` ห้ามแก้ต้นทางทุกกรณี (`13` §6.11 · `20` · `30`) */
export function isDirectEditBlocked(status: AccountingPeriodStatus): boolean {
  return periodLockPolicyFor(status).directEdit === 'blocked'
}

/**
 * **Interceptor (โครง)** — เรียกก่อนแก้ source record ทุกตัวที่ผูกกับงวดบัญชี
 * `periodStatus = null` = ยังไม่มีงวดของเดือนนั้น (ยังเก็บข้อมูลอยู่) → แก้ได้
 *
 * Phase 4.1 จะต่อตัวนี้เข้าทุก write endpoint ของสายการเงิน/บัญชี — เฟสนี้ export ไว้ให้เรียกได้แล้ว
 */
export function assertPeriodEditable(input: {
  periodStatus: AccountingPeriodStatus | null
  targetType: string
  targetId?: string | null
}): void {
  if (input.periodStatus === null) return
  if (!isDirectEditBlocked(input.periodStatus)) return
  throw new SettingsError('PERIOD_LOCKED_DIRECT_EDIT', {
    detail: `target=${input.targetType}:${input.targetId ?? '-'} period_status=${input.periodStatus}`,
    context: { targetType: input.targetType, periodStatus: input.periodStatus },
  })
}
