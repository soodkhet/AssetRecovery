/**
 * capability ของหน้าบันทึกการใช้งาน (`90` §12 "View audit") — แยกไฟล์เพราะทั้ง route (server)
 * และหน้าจอ (client) ต้องใช้ code เดียวกัน โดยไม่ลาก Prisma เข้าไปฝั่ง client
 *
 * ระดับสูงสุดของ capability นี้คือ `view` เสมอ — audit table เป็น read-only ตาม `90` §8/§10
 */
export const VIEW_AUDIT_LOG = 'view_audit_log'
