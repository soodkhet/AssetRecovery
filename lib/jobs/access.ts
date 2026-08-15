/**
 * capability ของงานเบื้องหลัง (`91` §12) — แยกไฟล์เพราะทั้ง route (server) และหน้าจอ (client)
 * ต้องใช้ code เดียวกันโดยไม่ลาก Prisma เข้าไปฝั่ง client
 *
 * - `view`   = ดูหน้า Job Log + รายละเอียดงาน
 * - `manage` = สั่งงานใหม่ (`POST /api/jobs`, dev trigger) — "Trigger job" ของ §12
 * - **retry ล็อก Superadmin เท่านั้น** (§12 "Retry job: Superadmin/Owner") — ตรวจแยกจาก
 *   access_level ที่ `assertJobRetryAllowed()` เพราะ role อื่นที่ได้ `manage` ก็ยัง retry ไม่ได้
 */
export const MANAGE_JOBS = 'manage_jobs'
