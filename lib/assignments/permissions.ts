/**
 * Capability ที่ endpoint ของโมดูลมอบหมายงานใช้ (`40` §13 · `25` §7 · DEC-002)
 * **pure ล้วน** — ค่าคงที่อย่างเดียว ไม่แตะ Prisma
 *
 * `02` §12 มี capability เดียวของไฟล์ 40 คือ `assign_case` ("มอบหมาย/Reassign เคส")
 * — ตัวคุมเชิงลึกที่เหลือเป็น **scope ระดับแถว** (ผู้จัดการ = ทีมที่ดูแล · หัวหน้า = ทีมเดียวที่สังกัด)
 *   บวก settings ต่อ Role Group ของ §6.4 ที่ตรวจใน `canPerformAssignmentAction()`
 */

/** assign / reassign (`40` §13 — ผู้จัดการ + หัวหน้าทีมตาม settings) */
export const ASSIGNMENT_MANAGE_CAPABILITY = 'assign_case'

/**
 * อ่านหน้ามอบหมาย/Kanban/agent picker (`40` §13 — "ดูภาพรวมการมอบหมายทุกทีม" ของ Superadmin/บริหาร
 * ใช้ `view_master_data` ตาม `25` §7.1) · หัวหน้า/ผู้จัดการเห็นผ่าน `assign_case` เสมอไม่ผูก settings
 */
export const ASSIGNMENT_READ_CAPABILITIES = ['assign_case', 'view_master_data'] as const

/** กดรับงาน + ตอบคำขอเปลี่ยนผู้รับผิดชอบ = พนักงานติดตามทรัพย์ (`40` §13 · ไฟล์ 41) */
export const ASSIGNMENT_AGENT_CAPABILITY = 'perform_field_work'
