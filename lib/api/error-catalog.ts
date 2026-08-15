/**
 * Error Code Catalog รวมทั้งระบบ — ทะเบียนกลางของ **ทุก code ที่ระบบมีสิทธิ์ส่งออก**
 *
 * SSOT: `docs/24-finance-validation-rules.md` §6.1–6.10 (หมวดการเงิน/ระบบ) +
 * ไฟล์ต้นทางของโมดูล Case/Warehouse ที่มี code เฉพาะตัว (`38` §12 · `40` §12 · `41` §12 · `44` §12)
 *
 * ⚠️ Rule 04: ห้ามตั้ง code ใหม่ที่โค้ดอย่างเดียว — ต้องเพิ่มลงเอกสารต้นทางในคอมมิตเดียวกัน
 * (เทสต์ `error-catalog.test.ts` อ่าน `docs/24` + `38`/`40`/`41`/`44` มาเทียบกับไฟล์นี้ตัวต่อตัว)
 *
 * ไฟล์นี้เก็บ **metadata** (status/ความรุนแรง/ที่มา) เท่านั้น — ข้อความไทยอยู่ที่ error module
 * ของแต่ละโมดูล (`lib/<module>/errors.ts`) เพื่อไม่ให้ข้อความซ้ำสองที่แล้วเพี้ยนกัน
 */

/** `reject` = ปฏิเสธคำขอ · `warn` = เตือนแต่ทำงานต่อได้ (Rule 04 — มี 5 ตัวเท่านั้นทั้งระบบ) */
export type ErrorSeverity = 'reject' | 'warn'

export interface ErrorCodeContract {
  /** HTTP status ที่ต้องใช้เมื่อส่ง code นี้ออก (`warn` = 200 เพราะเดินทางมากับ `warning` ไม่ใช่ error) */
  readonly status: number
  readonly severity: ErrorSeverity
  readonly source: string
}

export const ERROR_CATALOG = {
  // ── 24 §6.1 ข้อมูลพื้นฐาน (Master Data) ────────────────────────────────
  REQUIRED_MISSING: { status: 400, severity: 'reject', source: '24 §6.1' },
  DUPLICATE_TAX_ID: { status: 400, severity: 'reject', source: '24 §6.1' },
  INVALID_TAX_ID_FORMAT: { status: 400, severity: 'reject', source: '24 §6.1' },
  SUSPEND_REASON_REQUIRED: { status: 400, severity: 'reject', source: '24 §6.1' },
  SUSPENDED_COMPANY_NEW_CASE: { status: 400, severity: 'reject', source: '24 §6.1' },
  INVALID_RATE_RANGE: { status: 400, severity: 'reject', source: '24 §6.1' },
  TEMPLATE_IN_USE: { status: 400, severity: 'reject', source: '24 §6.1' },
  DUPLICATE_TEMPLATE_NAME: { status: 400, severity: 'reject', source: '24 §6.1' },
  PLAN_NOT_FOUND: { status: 404, severity: 'reject', source: '24 §6.1' },
  TEMPLATE_NOT_FOUND: { status: 404, severity: 'reject', source: '24 §6.1' },
  VERSION_NOT_CURRENT: { status: 400, severity: 'reject', source: '24 §6.1' },
  PLAN_IN_USE: { status: 400, severity: 'reject', source: '24 §6.1' },
  COMPANY_NOT_FOUND: { status: 404, severity: 'reject', source: '24 §6.1' },
  TEAM_NOT_FOUND: { status: 404, severity: 'reject', source: '24 §6.1' },
  DUPLICATE_TEAM_NAME: { status: 400, severity: 'reject', source: '24 §6.1' },
  TEAM_HAS_ACTIVE_CASES: { status: 400, severity: 'reject', source: '24 §6.1' },
  SUPERVISOR_ALREADY_ASSIGNED: { status: 400, severity: 'reject', source: '24 §6.1' },
  INVALID_TEAM_MEMBER: { status: 400, severity: 'reject', source: '24 §6.1' },
  INVALID_PROVINCE: { status: 400, severity: 'reject', source: '24 §6.1' },
  USER_NOT_FOUND: { status: 404, severity: 'reject', source: '24 §6.1' },
  DUPLICATE_USER_EMAIL: { status: 400, severity: 'reject', source: '24 §6.1' },
  DUPLICATE_USER_PHONE: { status: 400, severity: 'reject', source: '24 §6.1' },
  USER_HAS_HISTORY: { status: 400, severity: 'reject', source: '24 §6.1' },
  INVALID_USER_STATUS_TRANSITION: { status: 400, severity: 'reject', source: '24 §6.1' },
  // 502 = ปลายทางภายนอก (Supabase Auth) ไม่ตอบ ไม่ใช่ข้อมูลผู้เรียกผิด (`08` §14 · D1)
  INVITE_SEND_FAILED: { status: 502, severity: 'reject', source: '24 §6.1' },
  INVALID_USER_SCOPE: { status: 400, severity: 'reject', source: '24 §6.1' },
  BANK_ACCOUNT_NAME_MISMATCH: { status: 200, severity: 'warn', source: '24 §6.1' },
  CYCLE_NOT_FOUND: { status: 404, severity: 'reject', source: '24 §6.1' },
  DUPLICATE_CYCLE_NAME: { status: 400, severity: 'reject', source: '24 §6.1' },
  APPROVAL_MATRIX_NOT_FOUND: { status: 404, severity: 'reject', source: '24 §6.1' },
  COST_CENTER_NOT_FOUND: { status: 404, severity: 'reject', source: '24 §6.1' },
  COST_CENTER_IN_USE: { status: 400, severity: 'reject', source: '24 §6.1' },

  // ── 24 §6.2 ภาษี/VAT ───────────────────────────────────────────────────
  INVALID_WHT_RATE: { status: 400, severity: 'reject', source: '24 §6.2' },
  VAT_RATE_OVERLAP: { status: 400, severity: 'reject', source: '24 §6.2' },
  VAT_RATE_NOT_FOUND: { status: 404, severity: 'reject', source: '24 §6.2' },
  TAX_PROFILE_NOT_FOUND: { status: 404, severity: 'reject', source: '24 §6.2' },
  DUPLICATE_TAX_PROFILE_NAME: { status: 400, severity: 'reject', source: '24 §6.2' },
  TAX_PROFILE_IN_USE: { status: 400, severity: 'reject', source: '24 §6.2' },
  NUMBERING_SEQ_NOT_EDITABLE: { status: 400, severity: 'reject', source: '24 §6.2' },

  // ── 24 §6.3 ธนาคาร/ไฟล์ ────────────────────────────────────────────────
  BANK_FILE_NOT_TESTED: { status: 400, severity: 'reject', source: '24 §6.3' },
  BANK_FILE_FORMAT_NOT_FOUND: { status: 404, severity: 'reject', source: '24 §6.3' },
  BANK_ACCOUNT_NOT_FOUND: { status: 404, severity: 'reject', source: '24 §6.3' },
  DUPLICATE_BANK_ACCOUNT: { status: 400, severity: 'reject', source: '24 §6.3' },
  BANK_ACCOUNT_IN_USE: { status: 400, severity: 'reject', source: '24 §6.3' },
  DUPLICATE_PAYMENT_FILE: { status: 200, severity: 'warn', source: '24 §6.3' },
  MIXED_SIDE_BATCH: { status: 400, severity: 'reject', source: '24 §6.3' },
  MATCH_NOTE_REQUIRED: { status: 400, severity: 'reject', source: '24 §6.3' },
  ALREADY_MATCHED: { status: 200, severity: 'warn', source: '24 §6.3' },
  // เติมเข้า `24` §6.3 พร้อม Phase 4.2 (Rule 04 — doc + code คอมมิตเดียวกัน)
  BANK_TRANSACTION_NOT_FOUND: { status: 404, severity: 'reject', source: '24 §6.3' },
  BANK_TRANSACTION_INVALID_STATUS: { status: 400, severity: 'reject', source: '24 §6.3' },
  STATEMENT_FILE_INVALID: { status: 400, severity: 'reject', source: '24 §6.3' },

  // ── 24 §6.4 Claim/Advance/Approval ─────────────────────────────────────
  ADVANCE_PENDING_SETTLEMENT: { status: 400, severity: 'reject', source: '24 §6.4' },
  ADVANCE_EXCEEDS_MAX: { status: 400, severity: 'reject', source: '24 §6.4' },
  ADVANCE_NOT_FOUND: { status: 404, severity: 'reject', source: '24 §6.4' },
  ADVANCE_INVALID_STATUS: { status: 400, severity: 'reject', source: '24 §6.4' },
  USED_EXCEEDS_REQUEST_NO_TOPUP: { status: 400, severity: 'reject', source: '24 §6.4' },
  REJECTION_REASON_REQUIRED: { status: 400, severity: 'reject', source: '24 §6.4' },
  REJECT_REASON_REQUIRED: { status: 400, severity: 'reject', source: '24 §6.4' },
  APPROVAL_STEP_OUT_OF_ORDER: { status: 400, severity: 'reject', source: '24 §6.4' },
  SEGREGATION_OF_DUTIES_VIOLATION: { status: 403, severity: 'reject', source: '24 §6.4' },

  // ── 24 §6.5 Payout/Payee ───────────────────────────────────────────────
  UNVERIFIED_PAYEE_IN_PAYOUT: { status: 400, severity: 'reject', source: '24 §6.5' },
  PAYEE_NOT_FOUND: { status: 404, severity: 'reject', source: '24 §6.5' },
  PAYEE_ALREADY_EXISTS: { status: 400, severity: 'reject', source: '24 §6.5' },
  PAYEE_ID_DOCUMENT_REQUIRED: { status: 400, severity: 'reject', source: '24 §6.5' },
  /** เตือนไม่บล็อก — Payee ยังไม่มี Tax Profile ⇒ ใช้อัตรา WHT ของ Plan เป็นค่าสำรอง (`18` §6.3) */
  WHT_RATE_FALLBACK_TO_PLAN: { status: 200, severity: 'warn', source: '24 §6.5' },
  PAYOUT_BATCH_NOT_FOUND: { status: 404, severity: 'reject', source: '24 §6.5' },
  PAYOUT_BATCH_INVALID_STATUS: { status: 400, severity: 'reject', source: '24 §6.5' },
  NO_ITEMS_TO_PAY: { status: 400, severity: 'reject', source: '24 §6.5' },
  PAYMENT_FILE_NOT_GENERATED: { status: 404, severity: 'reject', source: '24 §6.5' },

  // ── 24 §6.6 Revenue/Billing ────────────────────────────────────────────
  NO_REVENUE_TO_BILL: { status: 400, severity: 'reject', source: '24 §6.6' },
  EDIT_BILLED_REVENUE: { status: 400, severity: 'reject', source: '24 §6.6' },
  BILLING_BATCH_NOT_FOUND: { status: 404, severity: 'reject', source: '24 §6.6' },
  BILLING_BATCH_INVALID_STATUS: { status: 400, severity: 'reject', source: '24 §6.6' },

  // ── 24 §6.7 Adjustment / Period Lock ───────────────────────────────────
  PERIOD_LOCKED_DIRECT_EDIT: { status: 400, severity: 'reject', source: '24 §6.7' },
  REASON_REQUIRED: { status: 400, severity: 'reject', source: '24 §6.7' },
  INSUFFICIENT_APPROVAL_LEVEL: { status: 403, severity: 'reject', source: '24 §6.7' },
  ADJUSTMENT_NOT_FOUND: { status: 404, severity: 'reject', source: '24 §6.7' },
  ADJUSTMENT_INVALID_STATUS: { status: 400, severity: 'reject', source: '24 §6.7' },
  ADJUSTMENT_TARGET_NOT_FOUND: { status: 404, severity: 'reject', source: '24 §6.7' },
  PERIOD_NOT_FOUND: { status: 404, severity: 'reject', source: '24 §6.7' },
  PERIOD_INVALID_STATUS: { status: 400, severity: 'reject', source: '24 §6.7' },
  NOT_READY_CRITICAL_OPEN: { status: 400, severity: 'reject', source: '24 §6.7' },
  NOT_READY_RECONCILE_INCOMPLETE: { status: 400, severity: 'reject', source: '24 §6.7' },
  NOT_READY_BILLING_REVENUE_MISMATCH: { status: 400, severity: 'reject', source: '24 §6.7' },
  UNLOCK_REQUIRES_EXECUTIVE: { status: 403, severity: 'reject', source: '24 §6.7' },

  // ── 24 §6.8 เอกสารทางการ/บัญชี ─────────────────────────────────────────
  SALES_RECORD_NOT_FOUND: { status: 404, severity: 'reject', source: '24 §6.8' },
  TAX_INVOICE_NOT_FOUND: { status: 404, severity: 'reject', source: '24 §6.8' },
  TAX_INVOICE_INVALID_STATUS: { status: 400, severity: 'reject', source: '24 §6.8' },
  TAX_INVOICE_ALREADY_ISSUED: { status: 400, severity: 'reject', source: '24 §6.8' },
  TAX_INVOICE_FIELD_MISSING: { status: 400, severity: 'reject', source: '24 §6.8' },
  INVOICE_NUMBER_GAP: { status: 500, severity: 'reject', source: '24 §6.8' },
  CANCEL_REQUIRES_REASON: { status: 400, severity: 'reject', source: '24 §6.8' },
  EDIT_AMOUNT_DIRECTLY: { status: 400, severity: 'reject', source: '24 §6.8' },
  COST_CENTER_AUTO_EDIT: { status: 400, severity: 'reject', source: '24 §6.8' },
  EXPENSE_RECORD_NOT_FOUND: { status: 404, severity: 'reject', source: '24 §6.8' },
  ACCOUNTANT_QUESTION_NOT_FOUND: { status: 404, severity: 'reject', source: '24 §6.8' },
  ACCOUNTANT_QUESTION_ALREADY_ANSWERED: { status: 400, severity: 'reject', source: '24 §6.8' },
  EXPORT_BLOCKED_CRITICAL: { status: 400, severity: 'reject', source: '24 §6.8' },
  EXPORT_RECORD_NOT_FOUND: { status: 404, severity: 'reject', source: '24 §6.8' },
  EXPORT_INVALID_STATUS: { status: 400, severity: 'reject', source: '24 §6.8' },
  EXPORT_PAYEE_TAX_ID_MISSING: { status: 400, severity: 'reject', source: '24 §6.8' },
  // เติมเข้า `24` §6.8 พร้อม Phase 8.3 (Rule 04 — doc + code คอมมิตเดียวกัน)
  EXPORT_VERSION_CONFLICT: { status: 409, severity: 'reject', source: '24 §6.8' },
  AUTHORIZED_EXCEPTION_REASON_REQUIRED: { status: 400, severity: 'reject', source: '24 §6.8' },
  EXCEPTION_NOT_FOUND: { status: 404, severity: 'reject', source: '24 §6.8' },
  EXCEPTION_INVALID_STATUS: { status: 400, severity: 'reject', source: '24 §6.8' },
  FILING_OVERDUE_WARNING: { status: 200, severity: 'warn', source: '24 §6.8' },
  WHT_CANCEL_REQUIRES_REASON: { status: 400, severity: 'reject', source: '24 §6.8' },
  WHT_CERTIFICATE_NOT_FOUND: { status: 404, severity: 'reject', source: '24 §6.8' },
  WHT_CERTIFICATE_INVALID_STATUS: { status: 400, severity: 'reject', source: '24 §6.8' },
  WHT_FILING_SUMMARY_NOT_FOUND: { status: 404, severity: 'reject', source: '24 §6.8' },
  WHT_FILING_ALREADY_FILED: { status: 400, severity: 'reject', source: '24 §6.8' },

  // ── 24 §6.9 Auth & Access Control ──────────────────────────────────────
  UNAUTHENTICATED: { status: 401, severity: 'reject', source: '24 §6.9' },
  SESSION_EXPIRED: { status: 401, severity: 'reject', source: '24 §6.9' },
  INVALID_CREDENTIALS: { status: 401, severity: 'reject', source: '24 §6.9' },
  ACCOUNT_INACTIVE: { status: 403, severity: 'reject', source: '24 §6.9' },
  USER_NOT_PROVISIONED: { status: 403, severity: 'reject', source: '24 §6.9' },
  PERMISSION_DENIED: { status: 403, severity: 'reject', source: '24 §6.9' },
  LAST_SUPERADMIN_REMOVAL: { status: 400, severity: 'reject', source: '24 §6.9' },
  SEED_ROLE_DELETE: { status: 400, severity: 'reject', source: '24 §6.9' },
  SEED_ROLE_RENAME: { status: 400, severity: 'reject', source: '24 §6.9' },
  ROLE_NOT_EDITABLE: { status: 400, severity: 'reject', source: '24 §6.9' },
  CAPABILITY_LOCKED: { status: 400, severity: 'reject', source: '24 §6.9' },
  CAPABILITY_NOT_FOUND: { status: 400, severity: 'reject', source: '24 §6.9' },
  ROLE_IN_USE: { status: 400, severity: 'reject', source: '24 §6.9' },
  DUPLICATE_ROLE_NAME: { status: 400, severity: 'reject', source: '24 §6.9' },
  ROLE_NOT_FOUND: { status: 404, severity: 'reject', source: '24 §6.9' },

  // ── 24 §6.10 Audit (Platform) ──────────────────────────────────────────
  AUDIT_REASON_REQUIRED: { status: 400, severity: 'reject', source: '24 §6.10' },
  AUDIT_IMMUTABLE: { status: 403, severity: 'reject', source: '24 §6.10' },
  AUDIT_LOG_NOT_FOUND: { status: 404, severity: 'reject', source: '24 §6.10' },

  // ── 24 §6.11 Background Job (Platform — ไฟล์ 91) ───────────────────────
  JOB_NOT_FOUND: { status: 404, severity: 'reject', source: '24 §6.11' },
  JOB_INVALID_STATUS: { status: 400, severity: 'reject', source: '24 §6.11' },

  // ── 24 §6.12 รายงาน (Platform — ไฟล์ 96) ────────────────────────────────
  REPORT_DATE_INVALID: { status: 400, severity: 'reject', source: '24 §6.12' },
  REPORT_NOT_FOUND: { status: 404, severity: 'reject', source: '24 §6.12' },

  // ── 38 §12 Case Submission ─────────────────────────────────────────────
  CASE_REF_DUPLICATE: { status: 400, severity: 'reject', source: '38 §12' },
  CASE_DOCUMENT_INCOMPLETE: { status: 400, severity: 'reject', source: '38 §12' },
  // เติมเข้า `38` §12 พร้อม Phase 2.2 (Rule 04 — doc + code คอมมิตเดียวกัน)
  CASE_NOT_FOUND: { status: 404, severity: 'reject', source: '38 §12' },
  CASE_PRODUCT_PHOTO_LIMIT: { status: 400, severity: 'reject', source: '38 §12' },
  CASE_NO_TEAM_MATCH: { status: 400, severity: 'reject', source: '38 §12' },
  CASE_INVALID_NATIONAL_ID: { status: 400, severity: 'reject', source: '38 §12' },
  CASE_INVALID_PHONE_FORMAT: { status: 400, severity: 'reject', source: '38 §12' },
  CASE_POSTAL_CODE_NOT_FOUND: { status: 400, severity: 'reject', source: '38 §12' },
  API_VALIDATION_FAILED: { status: 400, severity: 'reject', source: '38 §12 (`01` §11)' },
  CASE_LOCKED_AFTER_APPROVAL: { status: 400, severity: 'reject', source: '38 §12' },
  // เติมเข้า `38` §12 พร้อม Phase 2.3 (Rule 04 — doc + code คอมมิตเดียวกัน)
  CASE_INVALID_STATUS_TRANSITION: { status: 400, severity: 'reject', source: '38 §12' },
  CASE_STATUS_REASON_REQUIRED: { status: 400, severity: 'reject', source: '38 §12' },
  CASE_RECYCLE_INVALID_STATUS: { status: 400, severity: 'reject', source: '38 §12' },
  CASE_RECYCLE_NOTE_REQUIRED: { status: 400, severity: 'reject', source: '38 §12' },
  CASE_RECYCLE_REJECT_REASON_REQUIRED: { status: 400, severity: 'reject', source: '38 §12' },

  // ── 40 §12 Case Assignment & Routing ───────────────────────────────────
  ASSIGNMENT_TEAM_MISMATCH: { status: 400, severity: 'reject', source: '40 §12' },
  ASSIGNMENT_ALREADY_EXISTS: { status: 400, severity: 'reject', source: '40 §12' },
  ASSIGNMENT_REASON_REQUIRED: { status: 400, severity: 'reject', source: '40 §12' },
  REASSIGNMENT_ALREADY_PENDING: { status: 400, severity: 'reject', source: '40 §12' },
  DECLINE_REASON_REQUIRED: { status: 400, severity: 'reject', source: '40 §12' },
  REASSIGNMENT_ALREADY_TIMED_OUT: { status: 400, severity: 'reject', source: '40 §12 · 41 §12' },
  // เติมเข้า `40` §12 พร้อม Phase 2.6 (Rule 04 — doc + code คอมมิตเดียวกัน)
  ASSIGNMENT_NOT_FOUND: { status: 404, severity: 'reject', source: '40 §12' },
  ASSIGNMENT_INVALID_STATUS: { status: 400, severity: 'reject', source: '40 §12' },

  // ── 41 §12 Field Tracker ───────────────────────────────────────────────
  CLOSE_OUTCOME_REQUIRED: { status: 400, severity: 'reject', source: '41 §12' },
  CLOSE_CHECKIN_REQUIRED: { status: 400, severity: 'reject', source: '41 §12' },
  CLOSE_TRAVEL_ORIGIN_REQUIRED: { status: 400, severity: 'reject', source: '41 §12' },
  CLOSE_PHOTO_REQUIRED: { status: 400, severity: 'reject', source: '41 §12' },
  CLOSE_VIDEO_REQUIRED: { status: 400, severity: 'reject', source: '41 §12' },
  CLOSE_PRODUCT_PHOTO_REQUIRED: { status: 400, severity: 'reject', source: '41 §12' },
  REASSIGNMENT_DECLINE_REASON_REQUIRED: { status: 400, severity: 'reject', source: '41 §12' },
  HOTEL_CLAIM_FIELD_REQUIRED: { status: 400, severity: 'reject', source: '41 §12' },
  HOTEL_CLAIM_INVALID_SHARED_AGENT: { status: 400, severity: 'reject', source: '41 §12' },
  CHECKIN_GPS_PERMISSION_DENIED: { status: 400, severity: 'reject', source: '41 §12' },
  // เติมเข้า `41` §12 พร้อม Phase 2.9 (Rule 04 — doc + code คอมมิตเดียวกัน)
  CLOSE_NO_EVIDENCE_REVISION: { status: 400, severity: 'reject', source: '41 §12' },
  // เติมเข้า `41` §12 พร้อม Phase 8.3 (Rule 04 — doc + code คอมมิตเดียวกัน)
  EVIDENCE_REJECT_AFTER_FINAL: { status: 400, severity: 'reject', source: '41 §12' },
  EXPENSE_NOT_FOUND: { status: 404, severity: 'reject', source: '41 §12' },
  EXPENSE_INVALID_STATUS: { status: 400, severity: 'reject', source: '41 §12' },

  // ── 44 §12 Warehouse (Assets + Handover Lots) ──────────────────────────
  IMEI_MISMATCH: { status: 200, severity: 'warn', source: '44 §12' },
  INTAKE_MISSING_CONDITION: { status: 400, severity: 'reject', source: '44 §12' },
  INTAKE_MISSING_NOTE: { status: 400, severity: 'reject', source: '44 §12' },
  REJECT_MISSING_REASON: { status: 400, severity: 'reject', source: '44 §12' },
  MIXED_COMPANY_LOT: { status: 400, severity: 'reject', source: '44 §12' },
  EMPTY_LOT: { status: 400, severity: 'reject', source: '44 §12' },
  ASSET_NOT_IN_CUSTODY: { status: 400, severity: 'reject', source: '44 §12' },
  ASSET_ALREADY_IN_LOT: { status: 400, severity: 'reject', source: '44 §12' },
  LOT_MISSING_SIGNED_DOC: { status: 400, severity: 'reject', source: '44 §12' },
  LOT_MISSING_DELIVERY_PROOF: { status: 400, severity: 'reject', source: '44 §12' },
  LOT_ALREADY_CONFIRMED: { status: 400, severity: 'reject', source: '44 §12' },
  // side effect ใน $transaction fail = ปัญหาฝั่งระบบ ไม่ใช่ข้อมูลผู้เรียกผิด (`44` §11)
  CONFIRM_TRANSACTION_FAILED: { status: 500, severity: 'reject', source: '44 §12' },
  // เติมเข้า `44` §12 (v2.1) พร้อม Phase 2.13 (Rule 04 — doc + code คอมมิตเดียวกัน)
  ASSET_NOT_FOUND: { status: 404, severity: 'reject', source: '44 §12' },
  ASSET_INVALID_STATUS: { status: 400, severity: 'reject', source: '44 §12' },
  LOT_NOT_FOUND: { status: 404, severity: 'reject', source: '44 §12' },
} as const satisfies Record<string, ErrorCodeContract>

export type ApiErrorCode = keyof typeof ERROR_CATALOG

const CATALOG = ERROR_CATALOG as Readonly<Record<string, ErrorCodeContract>>

export function isKnownErrorCode(code: string): code is ApiErrorCode {
  return Object.hasOwn(CATALOG, code)
}

/** status ตามทะเบียน — ใช้แทนการเขียนตัวเลขเองในโมดูล */
export function errorCodeStatus(code: ApiErrorCode): number {
  return ERROR_CATALOG[code].status
}

/** `true` = ต้อง reject คำขอ · `false` = เตือนอย่างเดียว (5 ตัวตาม Rule 04) */
export function isBlockingError(code: ApiErrorCode): boolean {
  return ERROR_CATALOG[code].severity === 'reject'
}

/** code ที่ "เตือน ไม่ block" — ห้ามเอาไปตอบเป็น error response */
export const WARNING_ONLY_CODES = Object.keys(CATALOG).filter(
  (code) => CATALOG[code]?.severity === 'warn',
) as readonly ApiErrorCode[]
