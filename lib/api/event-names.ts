/**
 * รายชื่อ Domain Event ทั้งระบบ (Case/Assignment/Field/Warehouse) — **ทะเบียนเดียวของชื่อ event**
 *
 * ⚠️ ไฟล์นี้ถูกอ่านด้วย regex โดยกฎ ESLint `assetrecovery/no-unregistered-event`
 * (`tools/eslint-rules/no-unregistered-event.mjs`) — เก็บรูปแบบไว้เป็น **string literal ตรง ๆ
 * บรรทัดละตัว** เท่านั้น ห้ามใช้ตัวแปร/template string/spread มาประกอบ
 *
 * ที่มาและคำอธิบายต่อ event อยู่ที่ `lib/api/events.ts` (`EVENT_REGISTRY`)
 * เพิ่ม event ใหม่ = ต้องเพิ่มใน `45` §7 + ไฟล์ต้นทางของโมดูลในคอมมิตเดียวกัน (Rule 04)
 */

export const EVENT_NAMES = [
  // Case Submission (38 §17.2)
  'case.created',
  'case.updated',
  'case.document_uploaded',
  'case.status_changed',
  'case.approved',
  'case.rejected',
  'case.need_info_requested',
  'case.recycle_approved',
  // Case Assignment & Routing (40 §17.2)
  'assignment.created',
  'assignment.reassigned',
  'assignment.reassignment_requested',
  'assignment.reassignment_consented',
  'assignment.reassignment_declined',
  'assignment.reassignment_timeout_resolved',
  'assignment.accepted',
  // Field Tracker (41 §17.2)
  'case.accepted',
  'case.scheduled',
  'case.reordered',
  'case.checkin_recorded',
  'case.close_draft_saved',
  'case.closed_success',
  'case.closed_fail',
  'case.evidence_rejected',
  'case.close_resubmitted',
  'expense.case_bound_created',
  'expense.hotel_claim_submitted',
  'expense.resubmitted',
  'reassignment.consented',
  'reassignment.declined',
  // Warehouse (44 §14)
  'asset.intake',
  'asset.intake_rejected',
  'asset.intake_retry',
  'lot.created',
  'lot.doc_attached',
  'lot.confirmed',
] as const

export type DomainEventName = (typeof EVENT_NAMES)[number]
