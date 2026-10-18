import { EXPENSE_TYPE_LABEL } from '@/lib/field/expense-ui'
import { fmtSatangSymbol } from '@/lib/format/money'
import type { RoleGroup } from '@/lib/generated/prisma/enums'
import type { UserApprovalQueueDto, UserPendingWorkDto } from '@/lib/users/types'

/**
 * งานค้างของผู้ใช้ — **pure** (ใช้ทั้ง service และหน้าจอ)
 *
 * มติ D7-03 (mytester7 S7-AG7-01): ย้ายทีม/กลุ่มขณะมีงานภาคสนามเปิดอยู่ ⇒ **ปฏิเสธ** พร้อมรายชื่อเคสที่ต้องมอบใหม่
 * — งานค้างผูกแผนค่าตอบแทน/ผู้อนุมัติ/ภาษีของทีมเดิม ย้ายเงียบ ๆ ทำให้สายอนุมัติและภาษีเปลี่ยนโดยไม่มีใครรู้
 * ขยาย (S7-AG7-03 — เลือกทางเข้มกว่า): ใบเบิกที่**ไม่ผูกงาน**ซึ่งยังรออนุมัติ/ถูกตีกลับก็กันการย้ายด้วย
 * เพราะผู้อนุมัติขั้นผู้จัดการของใบแบบนี้คิดจากทีมปัจจุบันของผู้เบิก ⇒ ย้ายแล้วคิวย้ายไปผู้จัดการทีมใหม่เงียบ ๆ
 * (ผู้อนุมัติใหม่ไม่ได้แจ้งเตือน · แจ้งเตือนเดิมค้างกดแล้วไม่เจอรายการ) — ให้ผู้อนุมัติเดิมพิจารณาให้จบก่อน
 * ส่วนใบเบิกที่ผูกงานยึดทีมของงานเสมอ จึงไม่ถูกนับ
 */

/** จำนวนเลขเคสที่แสดงในข้อความ — เกินนี้สรุปเป็น "และอีก N เคส" */
const MAX_LISTED = 10

/** การแก้ไขนี้ย้ายทีมหรือย้ายกลุ่มผู้ใช้หรือไม่ */
export function isTeamOrGroupChange(
  before: { teamId: string | null; roleGroup: RoleGroup },
  after: { teamId: string | null; roleGroup: RoleGroup },
): boolean {
  return before.teamId !== after.teamId || before.roleGroup !== after.roleGroup
}

/** มีงานที่กันการย้ายทีม/กลุ่มไหม */
export function blocksTeamChange(work: Pick<UserPendingWorkDto, 'openAssignments' | 'pendingClaims'>): boolean {
  return work.openAssignments.length > 0 || work.pendingClaims.length > 0
}

function listed(items: readonly string[], unit: string): string {
  const shown = items.slice(0, MAX_LISTED).join(', ')
  const rest = items.length - MAX_LISTED
  return rest > 0 ? `${shown} และอีก ${rest} ${unit}` : shown
}

/** สรุปงานที่กันการย้าย (ไม่มีงาน = `null`) — ใช้ทั้งข้อความ error และกล่องเตือนบนฟอร์ม */
export function teamChangeBlockers(work: Pick<UserPendingWorkDto, 'openAssignments' | 'pendingClaims'>): string[] {
  const parts: string[] = []
  if (work.openAssignments.length > 0) {
    const refs = [...new Set(work.openAssignments.map((item) => item.caseRef))]
    parts.push(`งานภาคสนามที่ยังไม่จบ ${refs.length} เคส (${listed(refs, 'เคส')})`)
  }
  if (work.pendingClaims.length > 0) {
    const claims = work.pendingClaims.map(
      (item) => `${EXPENSE_TYPE_LABEL[item.expenseType]} ${fmtSatangSymbol(item.grossSatang)}`,
    )
    parts.push(`ใบเบิกที่ไม่ผูกเคสซึ่งรออนุมัติ/ถูกตีกลับ ${claims.length} รายการ (${listed(claims, 'รายการ')})`)
  }
  return parts
}

/** ข้อความปฏิเสธการย้ายทีม/กลุ่ม (ห้ามมีเลขอ้างอิงสเปค — Rule 05) */
export function teamChangeBlockMessage(work: Pick<UserPendingWorkDto, 'openAssignments' | 'pendingClaims'>): string {
  return (
    `ผู้ใช้คนนี้ยังมี${teamChangeBlockers(work).join(' และ')} — ` +
    'มอบหมายงานให้คนอื่นต่อ และให้ผู้อนุมัติพิจารณาใบเบิกให้จบก่อน จึงจะย้ายทีม/กลุ่มได้'
  )
}

function queueCountText(queue: Pick<UserApprovalQueueDto, 'count' | 'capped'>): string {
  return queue.capped ? `${queue.count}+` : String(queue.count)
}

/**
 * บรรทัดเตือนในกล่องยืนยันระงับผู้ใช้ (S7-AG7-04) — งานภาคสนาม + ใบเบิกของตัวเอง + คิวรออนุมัติที่ผู้ใช้เป็นผู้ลงมือ
 * คิวที่ผู้ใช้เป็นผู้อนุมัติคนเดียวระบุชัดว่าระหว่างระงับจะไม่มีใครทำต่อ (นอกจาก Superadmin)
 */
export function suspendWarnings(work: UserPendingWorkDto): string[] {
  const lines: string[] = []
  if (work.openAssignments.length > 0) {
    const refs = [...new Set(work.openAssignments.map((item) => item.caseRef))]
    lines.push(`งานภาคสนามที่ยังไม่จบ ${refs.length} เคส (${listed(refs, 'เคส')}) — ต้องมอบหมายให้คนอื่นต่อ`)
  }
  if (work.pendingClaims.length > 0) {
    lines.push(`ใบเบิกของผู้ใช้ที่รออนุมัติ/ถูกตีกลับ ${work.pendingClaims.length} รายการ`)
  }
  for (const queue of work.approvalQueues) {
    if (queue.count <= 0) continue
    const sole = queue.soleApprover ? ' — เป็นผู้อนุมัติคนเดียวที่ใช้งานอยู่ ระหว่างระงับจะไม่มีใครพิจารณาต่อ (นอกจาก Superadmin)' : ''
    lines.push(`${queue.label} ${queueCountText(queue)} รายการ${sole}`)
  }
  return lines
}
