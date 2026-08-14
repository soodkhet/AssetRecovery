/**
 * Error code หมวด Audit (Platform) — SSOT อยู่ที่ `docs/24-finance-validation-rules.md` §6.10
 * ⚠️ ห้ามตั้ง code ใหม่ที่นี่โดยไม่เพิ่มลงไฟล์ 24 ใน commit เดียวกัน (Rule 04)
 */

export const AUDIT_ERROR_CODES = ['AUDIT_REASON_REQUIRED', 'AUDIT_IMMUTABLE', 'REQUIRED_MISSING'] as const

export type AuditErrorCode = (typeof AUDIT_ERROR_CODES)[number]

/** 400 = ข้อมูลที่ส่งมาไม่ครบ · 403 = นโยบายห้ามทุกคนรวม Superadmin (`90` §17) */
const HTTP_STATUS: Record<AuditErrorCode, number> = {
  AUDIT_REASON_REQUIRED: 400,
  AUDIT_IMMUTABLE: 403,
  REQUIRED_MISSING: 400,
}

const MESSAGES: Record<AuditErrorCode, { title: string; message: string }> = {
  /** ใช้ร่วมกับ §6.1 ของไฟล์ 24 — audit entry ที่ field บังคับไม่ครบ (bug ฝั่งโค้ด ไม่ใช่ผู้ใช้) */
  REQUIRED_MISSING: { title: 'ข้อมูลไม่ครบ', message: 'บันทึกประวัติไม่สำเร็จ เพราะข้อมูลที่จำเป็นไม่ครบ' },
  AUDIT_REASON_REQUIRED: {
    title: 'ต้องระบุเหตุผล',
    message: 'รายการที่กระทบเงิน สิทธิ์ ธนาคาร ภาษี หรือการปิดงวด ต้องระบุเหตุผลทุกครั้ง',
  },
  AUDIT_IMMUTABLE: {
    title: 'แก้ไข Audit Log ไม่ได้',
    message: 'ประวัติการใช้งาน (Audit Log) ห้ามแก้ไขหรือลบย้อนหลังทุกกรณี',
  },
}

export function auditErrorStatus(code: AuditErrorCode): number {
  return HTTP_STATUS[code]
}

export function auditErrorMessage(code: AuditErrorCode): { title: string; message: string } {
  return MESSAGES[code]
}

/** error กลางของชั้น audit — route handler จับแล้วแปลงเป็น response */
export class AuditError extends Error {
  readonly code: AuditErrorCode
  readonly status: number
  /** รายละเอียดสำหรับ log ฝั่ง server เท่านั้น — ห้ามส่งออก response */
  readonly detail?: string

  constructor(code: AuditErrorCode, detail?: string) {
    super(`${code}: ${MESSAGES[code].message}${detail ? ` (${detail})` : ''}`)
    this.name = 'AuditError'
    this.code = code
    this.status = HTTP_STATUS[code]
    this.detail = detail
  }
}

export function isAuditError(error: unknown): error is AuditError {
  return error instanceof AuditError
}

export interface AuditErrorBody {
  error: {
    code: AuditErrorCode
    title: string
    message: string
  }
}

export function toAuditErrorBody(code: AuditErrorCode): AuditErrorBody {
  return { error: { code, ...MESSAGES[code] } }
}
