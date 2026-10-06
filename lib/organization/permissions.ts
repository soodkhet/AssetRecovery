/**
 * สิทธิ์ของหน้า "ข้อมูลองค์กร" (มติ PO U99) — **ไม่เพิ่ม capability ใหม่**
 *
 * - แก้ = `manage_invoice_numbering` — 1 ใน 9 รายการ "✅ only" ที่ล็อกกับ Superadmin (ค่าตั้งระดับองค์กรของ
 *   เอกสารภาษี · ตัวเดียวกับสาขาผู้ขายของมติ U82) ⇒ "Superadmin เท่านั้น" ตาม mockup โดยไม่ต้องมีมติล็อกเพิ่ม
 * - ดู = `view_master_data` (บริหาร/การเงิน/บัญชี/ธุรการ ระดับ view)
 */
export const MANAGE_ORGANIZATION_PROFILE = 'manage_invoice_numbering'
export const VIEW_ORGANIZATION_PROFILE = 'view_master_data'
