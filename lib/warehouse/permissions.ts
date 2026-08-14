/**
 * Capability ที่ endpoint ของโมดูลคลังใช้ (`44` §13 · DEC-002) — **pure ล้วน** ไม่แตะ Prisma
 *
 * `02` §12 มี capability ของไฟล์ 44 อยู่ 4 ตัว (`intake_asset`, `reject_asset_intake`,
 * `create_handover_lot`, `confirm_handover_lot`) และ **ไม่มี "ดูคลัง" แยกต่างหาก** —
 * สิทธิ์ดูจึงมาจาก capability ของหน้าที่ที่ทำให้ต้องเห็นคลัง (แนวเดียวกับ `CASE_READ_CAPABILITIES`)
 * ให้ตรงกับผู้ที่เห็นเมนู `warehouse` ใน `06` §7.1.1:
 *  - `intake_asset` / `create_handover_lot` / `confirm_handover_lot` — ธุรการ + ผู้จัดการทีม (คนทำงานคลัง)
 *  - `view_master_data` — บริหาร/การเงิน/บัญชี (ดูอย่างเดียว — `44` §13 แถวแรก)
 *  - `view_own_company_data` — ผู้ใช้ฝั่งบริษัทไฟแนนซ์ (เห็นเฉพาะบริษัทตัวเองผ่าน scope ระดับแถว)
 *
 * ⚠️ capability เปิดประตูแค่ "เข้าถึง endpoint ได้" — **ขอบเขตแถว**บังคับซ้ำเสมอที่ `assetScopeWhere()` /
 *    `lotScopeWhere()` (Company User ที่ถือ `view_own_company_data` ยังเห็นเฉพาะบริษัทตัวเอง · T15)
 * Superadmin ผ่านทุกตัวโดยนิยาม (ไม่มี record — `07` §6)
 */

export const WAREHOUSE_READ_CAPABILITIES = [
  'intake_asset',
  'create_handover_lot',
  'confirm_handover_lot',
  'view_master_data',
  'view_own_company_data',
] as const

/** รับเครื่องเข้าคลัง (`44` §13 — ธุรการ, ผู้จัดการทีม) */
export const WAREHOUSE_INTAKE_CAPABILITY = 'intake_asset'

/** ตีกลับตอนรับเข้า — capability แยกจากการรับเข้า (`02` §12) เพราะเป็นการปฏิเสธงานของฝั่งสนาม */
export const WAREHOUSE_REJECT_INTAKE_CAPABILITY = 'reject_asset_intake'

/** สร้างล็อต + นัดวัน (`44` §13 — ธุรการ) */
export const WAREHOUSE_CREATE_LOT_CAPABILITY = 'create_handover_lot'

/** ยืนยันส่งมอบ = จุดที่ปลดล็อก expense + เปิดเกต Revenue (`44` §11) จึงเป็น capability ของตัวเอง */
export const WAREHOUSE_CONFIRM_LOT_CAPABILITY = 'confirm_handover_lot'

/**
 * Export PDF / Excel (`44` §13 แถวสุดท้าย — ธุรการ, การเงิน, บัญชี)
 * **ไม่รวม `view_own_company_data`**: บริษัทไฟแนนซ์ดูสถานะได้ แต่เอกสารส่งมอบออกจากฝั่งเราเท่านั้น
 * (ช่องทางของบริษัทคือ Client Portal ไฟล์ 97)
 */
export const WAREHOUSE_EXPORT_CAPABILITIES = ['create_handover_lot', 'intake_asset', 'view_master_data'] as const
