import type { SessionUser } from '@/lib/auth/types'

/**
 * Capability ที่ endpoint ของโมดูลคลังใช้ (`44` §13 · DEC-002) — **pure ล้วน** ไม่แตะ Prisma
 *
 * `02` §12 มี capability ของไฟล์ 44 อยู่ 4 ตัว (`intake_asset`, `reject_asset_intake`,
 * `create_handover_lot`, `confirm_handover_lot`) และ **ไม่มี "ดูคลัง" แยกต่างหาก** —
 * สิทธิ์ดูจึงมาจาก capability ของหน้าที่ที่ทำให้ต้องเห็นคลัง (แนวเดียวกับ `CASE_READ_CAPABILITIES`)
 * ให้ตรงกับผู้ที่เห็นเมนู `warehouse` ใน `06` §7.1.1:
 *  - `intake_asset` / `create_handover_lot` / `confirm_handover_lot` — ธุรการ (คนทำงานคลัง ระดับ `manage`)
 *  - `intake_asset` ระดับ `view` — ผู้จัดการ/หัวหน้าทีม อ่านอย่างเดียวเฉพาะทรัพย์ของทีมตัวเอง (มติ PO U22)
 *  - `view_master_data` — บริหาร/การเงิน/บัญชี (ดูอย่างเดียว — `44` §13 แถวแรก)
 *  - ~~`view_own_company_data`~~ — **ถอดแล้ว** (มติ PO 05/10/2569 U6/O43 D2): ผู้ใช้บริษัทไฟแนนซ์ใช้พอร์ทัล
 *    ทางเดียว (`/api/portal/*`) — route ภายในปฏิเสธที่ `checkPermission()` · โค้ด redaction ฝั่งบริษัทยังคงไว้
 *
 * ⚠️ capability เปิดประตูแค่ "เข้าถึง endpoint ได้" — **ขอบเขตแถว**บังคับซ้ำเสมอที่ `assetScopeWhere()` /
 *    `lotScopeWhere()` (scope `company` ยังกรองเฉพาะบริษัทตัวเอง · T15 — ใช้ซ้ำได้ในชั้นข้อมูลของพอร์ทัล)
 * Superadmin ผ่านทุกตัวโดยนิยาม (ไม่มี record — `07` §6)
 */

/**
 * ผู้ใช้ scope ทีม/ตัวเอง (ผู้จัดการ/หัวหน้าทีม — มติ PO 05/10/2569 U22 · BUG-076) เห็นล็อตได้เฉพาะ "ผ่านเครื่องของทีม"
 * ⇒ ล็อตเดียวมีเครื่องหลายทีมปนกัน (1 ล็อต = 1 บริษัท ไม่ใช่ 1 ทีม) จึงต้องตัดเครื่อง/ไฟล์ทั้งล็อตของทีมอื่นออก
 */
export function isTeamScopedViewer(user: Pick<SessionUser, 'scope'>): boolean {
  return user.scope.kind === 'team' || user.scope.kind === 'self'
}

export const WAREHOUSE_READ_CAPABILITIES = [
  'intake_asset',
  'create_handover_lot',
  'confirm_handover_lot',
  'view_master_data',
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
 * Export PDF / Excel (`44` §13 แถวสุดท้าย — ธุรการ, การเงิน, บัญชี, บริหาร)
 * - ธุรการผ่าน `create_handover_lot` · การเงิน/บัญชี/บริหาร ผ่าน `view_master_data` (บริหาร = อ่านอย่างเดียว
 *   ไม่แก้ล็อต — มติ PO 05/10/2569 U23 · BUG-084)
 * - **ไม่รวม `intake_asset`** (มติ PO U22): ผู้จัดการ/หัวหน้าทีมถือ `intake_asset` ระดับ `view` เพื่ออ่านคลัง
 *   ของทีมตัวเอง — ใบส่งมอบทั้งล็อตมีเครื่องของทีมอื่นปนอยู่ จึงห้าม export
 * - **ไม่รวม `view_own_company_data`**: บริษัทไฟแนนซ์รับเอกสารผ่าน Client Portal (ไฟล์ 97) ทางเดียว
 */
export const WAREHOUSE_EXPORT_CAPABILITIES = ['create_handover_lot', 'view_master_data'] as const
