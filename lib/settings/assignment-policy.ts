/**
 * นโยบายการมอบหมายงานระดับองค์กร (`40` §6.4 · §11 · §13) — **pure ล้วน ไม่มี I/O**
 *
 * ค่าตั้งชุดนี้อยู่ตาราง `assignment_policy_settings` แถวเดียวกับเกณฑ์ SLA (`13` §6.14) แต่คนละหน้าที่:
 * - `reassign_timeout_hours` — เวลารอความยินยอมก่อนระบบ auto-resolve (default 3 ชม.) ·
 *   **snapshot ลง `pending_reassignments.expires_at` ตอนส่งคำขอ** ⇒ เปลี่ยนค่าแล้วมีผลกับคำขอใหม่เท่านั้น
 * - `supervisor_can_assign_*` — หัวหน้าทีมแต่ละ Role Group ทำ assign/reassign ได้ไหม (default เปิด)
 *   คุมเฉพาะ**การกระทำ** ไม่คุมการมองเห็น
 * - `accept_deadline_hours` — เส้นตายกดรับงานครั้งแรก · `null` = ไม่จำกัด (default) ·
 *   รอบนี้**ยังไม่บังคับใช้** — เป็นช่อง config เผื่อเปิดใช้ในอนาคต (`40` §11 · §22 ข้อ 1)
 *
 * ตั้งค่าได้เฉพาะ Superadmin (`40` §13) — UAT BUG-002 · มติ PO 03/10/2569
 */

import { DEFAULT_ASSIGNMENT_POLICY, type AssignmentPolicy } from '@/lib/assignments/policy'

/** 1 ชั่วโมงขั้นต่ำ — 0 ทำให้คำขอหมดเวลาทันทีที่ส่ง (`reassignmentExpiresAt()` ปฏิเสธ ≤ 0 อยู่แล้ว) */
export const MIN_REASSIGN_TIMEOUT_HOURS = 1
/**
 * 7 วัน — สเปคไม่กำหนดเพดาน · คำขอที่ค้างรอความยินยอมนานเกินสัปดาห์ทำให้เคสค้างระหว่างสองคน
 * จึงตั้งเพดานกันพิมพ์ผิดหลัก (เช่น 30 → 300) ไว้ที่ 168 ชม.
 */
export const MAX_REASSIGN_TIMEOUT_HOURS = 168
export const MIN_ACCEPT_DEADLINE_HOURS = 1
/** 30 วัน — เพดานกันพิมพ์ผิดของเส้นตายกดรับงาน (สเปคไม่กำหนด) */
export const MAX_ACCEPT_DEADLINE_HOURS = 720

/** ค่าที่หน้าจอนี้แก้ได้ — ไม่รวม `slaAlertHours` (เป็นของแท็บเกณฑ์ SLA `13` §6.14) */
export type AssignmentPolicyValues = Omit<AssignmentPolicy, 'slaAlertHours'>

export const DEFAULT_ASSIGNMENT_POLICY_VALUES: AssignmentPolicyValues = {
  reassignTimeoutHours: DEFAULT_ASSIGNMENT_POLICY.reassignTimeoutHours,
  supervisorCanAssignSystem: DEFAULT_ASSIGNMENT_POLICY.supervisorCanAssignSystem,
  supervisorCanAssignInhouse: DEFAULT_ASSIGNMENT_POLICY.supervisorCanAssignInhouse,
  supervisorCanAssignOutsource: DEFAULT_ASSIGNMENT_POLICY.supervisorCanAssignOutsource,
  acceptDeadlineHours: DEFAULT_ASSIGNMENT_POLICY.acceptDeadlineHours,
}

/** payload ที่ลง audit — ชื่อคอลัมน์จริง (snake_case) และไม่แตะ `sla_alert_hours` */
export function toAssignmentPolicyAuditPayload(
  values: AssignmentPolicyValues,
): Record<string, number | boolean | null> {
  return {
    reassign_timeout_hours: values.reassignTimeoutHours,
    supervisor_can_assign_system: values.supervisorCanAssignSystem,
    supervisor_can_assign_inhouse: values.supervisorCanAssignInhouse,
    supervisor_can_assign_outsource: values.supervisorCanAssignOutsource,
    accept_deadline_hours: values.acceptDeadlineHours,
  }
}

/** ป้ายเส้นตายกดรับงาน — `null` = ไม่จำกัดเวลา */
export function describeAcceptDeadline(hours: number | null): string {
  return hours === null ? 'ไม่จำกัดเวลา' : `${hours.toLocaleString('th-TH')} ชั่วโมง`
}
