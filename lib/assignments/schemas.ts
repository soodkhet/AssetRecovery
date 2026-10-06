import { z } from 'zod'

/**
 * Zod ชุดเดียวใช้ร่วม FE/BE ของโมดูลมอบหมายงาน (`40` §17.1 · `45` §6.2)
 *
 * คีย์ของ query ต้องตรงกับ `query` ใน `API_CONTRACT` เป๊ะ (มีเทสต์ยาม) — body ใช้ camelCase ตามโค้ด
 */

const trimmedText = z.string().trim()

/** สถานะระดับเคสของหน้ามอบหมาย (`40` §10) — ไม่ใช่ `assignment_status` ดิบของ DB */
export const ASSIGNMENT_STATE_FILTERS = ['ready_to_assign', 'assigned', 'accepted'] as const

/** `POST /api/cases/:id/assign` — เลือกพนักงาน 1 คน (`40` §8) */
export const assignCaseSchema = z.object({
  agentId: z.guid('พนักงานไม่ถูกต้อง'),
})

export type AssignCaseInput = z.infer<typeof assignCaseSchema>

/**
 * ความยาวขั้นต่ำของเหตุผลเปลี่ยนผู้รับผิดชอบ — เท่ากับ `reasonSchema` กลาง (`90` §13) · FE ใช้ค่าเดียวกัน
 * ปิดปุ่มจนกว่าจะครบ (มติ PO 03/10/2569 UAT Q18 · BUG-042)
 */
export const ASSIGNMENT_REASON_MIN = 5
export const ASSIGNMENT_REASON_MAX = 500

/** เหตุผลผ่านเกณฑ์ขั้นต่ำหรือยัง — ใช้ทั้งปุ่มฝั่ง FE และยามฝั่ง BE (`assertReassignReason`) */
export function isAssignmentReasonLongEnough(reason: string | null | undefined): boolean {
  return (reason ?? '').trim().length >= ASSIGNMENT_REASON_MIN
}

/**
 * `POST /api/cases/:id/reassign` — reason บังคับทุกกรณี (`40` §12 `ASSIGNMENT_REASON_REQUIRED`)
 * schema ปล่อยเหตุผลสั้น/ว่างผ่าน (คุมแค่ความยาวสูงสุด) เพื่อให้ตัวบังคับจริง `assertReassignReason()`
 * ตอบ `ASSIGNMENT_REASON_REQUIRED` ตาม `40` §12 ไม่ใช่ `REQUIRED_MISSING` (UAT Q18 · BUG-042) —
 * แนวเดียวกับ `declineReason` ด้านล่าง
 */
export const reassignCaseSchema = z.object({
  agentId: z.guid('พนักงานไม่ถูกต้อง'),
  reason: trimmedText.max(ASSIGNMENT_REASON_MAX, `เหตุผลยาวเกิน ${ASSIGNMENT_REASON_MAX} ตัวอักษร`).optional(),
})

export type ReassignCaseInput = z.infer<typeof reassignCaseSchema>

/**
 * `POST /api/cases/:id/reassignment/respond` — พนักงานคนเดิมตอบคำขอ
 * `declineReason` บังคับเมื่อ `decline` (ตัวบังคับจริงอยู่ `assertDeclineReason()` — schema ปล่อยผ่านเพื่อให้
 * error ที่ผู้ใช้เห็นเป็น `DECLINE_REASON_REQUIRED` ตาม `40` §12 ไม่ใช่ `REQUIRED_MISSING`)
 */
export const respondReassignmentSchema = z.object({
  decision: z.enum(['consent', 'decline']),
  declineReason: trimmedText.max(1000).optional(),
})

export type RespondReassignmentInput = z.infer<typeof respondReassignmentSchema>

/** query ของ `GET /api/assignments` — คีย์ต้องตรงกับ `query` ของ `assignment.list` (`45` §6.2) */
export const assignmentListQuerySchema = z.object({
  team: z.guid().optional(),
  status: z.enum(ASSIGNMENT_STATE_FILTERS).optional(),
  search: trimmedText.min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export type AssignmentListQuery = z.infer<typeof assignmentListQuerySchema>

/** query ของ `GET /api/teams/:team_id/kanban` (`45` §6.2) — filter ระดับการ์ด ไม่ซ่อนคอลัมน์ */
export const kanbanQuerySchema = z.object({
  search: trimmedText.min(1).max(100).optional(),
  province: trimmedText.min(1).max(100).optional(),
})

export type KanbanQuery = z.infer<typeof kanbanQuerySchema>
