import { AuditError } from '@/lib/audit/errors'
import { changedFieldNames, toAuditJsonRecord } from '@/lib/audit/diff'
import { reasonRequirement } from '@/lib/audit/reason-policy'
import type { AuditEntry } from '@/lib/audit/types'

/**
 * ยามของ audit entry ก่อนเขียนลง DB (`90` §13 · Rule 03) — pure ล้วน
 * ตรวจ 2 เรื่อง: (1) 9 fields บังคับมีจริง ไม่ใช่ค่าว่าง (2) `reason` ครบตามนโยบาย `reason-policy.ts`
 */

function requireNonBlank(value: string, field: string): void {
  if (value.trim() === '') {
    throw new AuditError('REQUIRED_MISSING', `audit field '${field}' ห้ามว่าง`)
  }
}

/** `reason` ที่มีแต่ช่องว่าง = ไม่มี */
export function normalizeReason(reason: string | null | undefined): string | null {
  const trimmed = reason?.trim() ?? ''
  return trimmed === '' ? null : trimmed
}

/**
 * ตรวจ entry แล้วคืน `reason` ที่ normalize แล้ว — ผิดกติกาโยน `AuditError`
 * เรียกจาก `emitAudit()` เสมอ ไม่ต้องเรียกเองจากโมดูล
 */
export function validateAuditEntry(entry: AuditEntry): string | null {
  requireNonBlank(entry.organizationId, 'organization_id')
  requireNonBlank(entry.targetType, 'target_type')

  const reason = normalizeReason(entry.reason)
  const requirement = reasonRequirement({
    action: entry.action,
    targetType: entry.targetType,
    actorId: entry.actorId,
    changedFields: resolveChangedFields(entry),
  })

  if (requirement.required && reason === null) {
    throw new AuditError(
      'AUDIT_REASON_REQUIRED',
      `${entry.action} ${entry.targetType} (rule=${requirement.rule ?? 'unknown'}${
        requirement.sensitivity ? `, sensitivity=${requirement.sensitivity}` : ''
      })`,
    )
  }

  return reason
}

/**
 * ฟิลด์ที่เปลี่ยนจริง — `undefined` เมื่อผู้เรียกไม่ส่ง snapshot มาเลย
 * (policy จะถือว่า "อาจแตะฟิลด์อ่อนไหว" แล้วบังคับ reason ไว้ก่อน)
 */
function resolveChangedFields(entry: AuditEntry): string[] | undefined {
  const before = toAuditJsonRecord(entry.before)
  const after = toAuditJsonRecord(entry.after)
  if (before === null && after === null) return undefined
  return changedFieldNames(entry.before, entry.after)
}
