/**
 * ค่าคงที่ของระบบ Auth / Permission (`05`, `07`)
 * ⚠️ ค่าเชิง business rule อื่นๆ ต้องมาจาก settings (ไฟล์ 13) ไม่ใช่ที่นี่
 */

/** Session timeout = 24 ชั่วโมง — ยืนยันโดย Product Owner (`05` §10, §17) หลังหมดอายุบังคับ re-login */
export const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000

/**
 * อายุ cache ของ role+scope ต่อ instance — `01` §6.1 / `05` §17 กำหนดว่าห้าม query DB ทุก request
 * สั้นพอให้การเปลี่ยน role/สถานะมีผลไว และมี `invalidateSessionCache()` เรียกตรงเมื่อข้อมูลเปลี่ยน
 */
export const SESSION_CACHE_TTL_MS = 5 * 60 * 1000

/** ชื่อ role ตาม seed (`07` §5 · `prisma/seed.ts`) — ห้ามเปลี่ยน ชื่อนี้ผูกกับ record จริงใน DB */
export const SUPERADMIN_ROLE_NAME = 'Superadmin'
export const FIELD_AGENT_ROLE_NAME = 'พนักงานติดตามทรัพย์'
export const TEAM_MANAGER_ROLE_NAME = 'ผู้จัดการทีมติดตามทรัพย์'
export const TEAM_SUPERVISOR_ROLE_NAME = 'หัวหน้าทีมติดตามทรัพย์'

/** เส้นทางหน้า Login และปลายทางหลัง login (mockup `login.html` · `06` §7.2 · ไฟล์ 97) */
export const LOGIN_PATH = '/login'
export const DASHBOARD_PATH = '/dashboard'
export const FIELD_TRACKER_PATH = '/field'
export const CLIENT_PORTAL_PATH = '/portal'
