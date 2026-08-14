/**
 * Capability ที่ endpoint ของโมดูลรับเคสใช้ (`38` §13 · `25` §7 · DEC-002)
 * **pure ล้วน** — ค่าคงที่อย่างเดียว ไม่แตะ Prisma
 *
 * `02` §12 ไม่มี capability ชื่อ "ดูเคส" แยกต่างหาก — สิทธิ์ดูเคสจึงมาจาก capability ของหน้าที่
 * ที่ทำให้ต้องเห็นเคส (ตรงกับผู้ที่เห็นเมนู `cases.submit` ใน `06` §7.1.1):
 *  - `record_admin_data` — ธุรการ (คนคีย์เคส/แนบเอกสาร)
 *  - `approve_case` — เจ้าหน้าที่อนุมัติเคส (คนพิจารณา)
 *  - `assign_case` — ผู้จัดการ/หัวหน้าทีม (เห็นเฉพาะเคสของทีมตัวเองผ่าน scope)
 *  - `view_master_data` — บริหาร/การเงิน/บัญชี (ดูอย่างเดียว)
 *  - `view_own_company_data` — ผู้ใช้ฝั่งบริษัทไฟแนนซ์ (เห็นเฉพาะบริษัทตัวเองผ่าน scope)
 *
 * Superadmin ผ่านทุกตัวโดยนิยาม (ไม่มี record — `07` §6)
 */
export const CASE_READ_CAPABILITIES = [
  'record_admin_data',
  'approve_case',
  'assign_case',
  'view_master_data',
  'view_own_company_data',
] as const

/** สร้างเคส + อัปโหลดเอกสาร = ธุรการ/แอดมิน (`38` §13 — 2 แถวแรกของตาราง) */
export const CASE_WRITE_CAPABILITY = 'record_admin_data'

/**
 * แก้ไขเคส (`38` §8/§13) — "Admin/ธุรการ/Manager ตาม scope เดียวกับสิทธิ์สร้าง/พิจารณา"
 * ⇒ ธุรการ (คนคีย์) + เจ้าหน้าที่อนุมัติเคส (คนพิจารณา) + ผู้จัดการทีม (เห็นเฉพาะทีมตัวเองผ่าน scope)
 */
export const CASE_EDIT_CAPABILITIES = ['record_admin_data', 'approve_case', 'assign_case'] as const
