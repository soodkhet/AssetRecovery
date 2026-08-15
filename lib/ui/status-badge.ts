/**
 * Status Badge Color Map — **10 กลุ่มความหมายตายตัว** (`04` §8.1, §17)
 *
 * ห้ามใช้สีสุ่มนอกระบบ (`04` §10) — ทุกโมดูลต้องผ่าน mapper ตัวนี้เท่านั้น
 * สถานะที่ไม่รู้จักตกกลุ่ม `neutral` (เทา) — ถ้าเป็นสถานะจาก enum ของ `02` §3 ที่ยังไม่มีในตาราง
 * ให้เพิ่มลง `STATUS_GROUP` ที่นี่ หรือส่ง `group` เข้ามาตรง ๆ จากโมดูล ไม่ใช่ไปใส่คลาสสีเอง
 */

export type StatusBadgeGroup =
  /** สำเร็จ/อนุมัติ/ปิดงาน (เขียว) */
  | 'success'
  /** ส่งแล้ว/รอดำเนินการขั้นถัดไป (น้ำเงิน) */
  | 'sent'
  /** ชำระบางส่วน/ตอบแล้ว (ฟ้าอมเขียว) */
  | 'partial'
  /** รออนุมัติ/กำลังรวบรวม (เหลือง) */
  | 'pending'
  /** เคลียร์แล้ว/รอคลังยืนยัน (ม่วง) */
  | 'cleared'
  /** ร่าง/ยังไม่ export (เทา) */
  | 'neutral'
  /** ปัญหา/ปฏิเสธ/ระงับ (แดง) */
  | 'critical'
  /** ต้องแก้ไข/คำเตือน (ส้ม) */
  | 'warning'
  /** ถูกแทนที่ (เทาเข้ม) */
  | 'superseded'
  /** ข้อมูลทั่วไป (ฟ้าอ่อน) */
  | 'info'

/** คลาส Tailwind จริงตาม `04` §8.1 — ห้ามแก้ค่าโดยไม่แก้ mockup + เอกสารคู่กัน */
export const STATUS_BADGE_CLASS: Readonly<Record<StatusBadgeGroup, string>> = {
  success: 'bg-emerald-100 text-emerald-800',
  sent: 'bg-blue-100 text-blue-800',
  partial: 'bg-cyan-100 text-cyan-800',
  pending: 'bg-amber-100 text-amber-800',
  cleared: 'bg-purple-100 text-purple-800',
  neutral: 'bg-slate-100 text-slate-700',
  critical: 'bg-red-100 text-red-800',
  warning: 'bg-orange-100 text-orange-800',
  superseded: 'bg-slate-200 text-slate-500',
  info: 'bg-blue-50 text-blue-600',
}

/** สถานะ → กลุ่มสี ตามตาราง `04` §8.1 (คอลัมน์ "สถานะที่ใช้") */
const STATUS_GROUP: Readonly<Record<string, StatusBadgeGroup>> = {
  // เขียว
  completed: 'success',
  locked: 'success',
  matched: 'success',
  /** `35` §8 — จับคู่อัตโนมัติ = เขียว · จับคู่โดยคน = ฟ้า · ปิดรายการแล้ว = เทา */
  auto_matched: 'success',
  verified: 'success',
  paid: 'success',
  closed: 'success',
  approved: 'success',
  active: 'success',
  accepted: 'success',
  /** `33` §8 — รอบนำส่ง WHT ที่ยื่นแบบแล้ว */
  filed: 'success',
  // น้ำเงิน
  sent: 'sent',
  ready_for_billing: 'sent',
  billed: 'sent',
  file_generated: 'sent',
  manual_matched: 'sent',
  exported: 'sent',
  // ฟ้าอมเขียว
  partially_paid: 'partial',
  answered: 'partial',
  // เหลือง
  checking: 'pending',
  collecting: 'pending',
  pending: 'pending',
  pending_approval: 'pending',
  // ม่วง
  cleared: 'cleared',
  pending_warehouse_confirm: 'cleared',
  // เทา
  draft: 'neutral',
  in_progress: 'neutral',
  not_exported: 'neutral',
  unmatched_resolved: 'neutral',
  // แดง
  critical: 'critical',
  open: 'critical',
  unmatched: 'critical',
  suspended: 'critical',
  deactivated: 'critical',
  rejected: 'critical',
  unverified: 'critical',
  /** `31` §9.1 · `33` §10 — ใบกำกับภาษี/ใบ 50 ทวิ ที่ถูกยกเลิก (terminal ห้ามลบ) */
  cancelled: 'critical',
  // ส้ม
  needs_revision: 'warning',
  warning: 'warning',
  // เทาเข้ม
  superseded: 'superseded',
  // ฟ้าอ่อน
  info: 'info',
}

/** กลุ่มสีเริ่มต้นของสถานะที่ยังไม่ถูกจัดหมวด — เทากลาง ไม่สื่อความหมายผิด */
export const DEFAULT_STATUS_GROUP: StatusBadgeGroup = 'neutral'

/** สถานะ (enum `02` §3 — snake_case) → กลุ่มสี */
export function statusBadgeGroup(status: string | null | undefined): StatusBadgeGroup {
  if (!status) return DEFAULT_STATUS_GROUP
  return STATUS_GROUP[status.trim().toLowerCase()] ?? DEFAULT_STATUS_GROUP
}

/** สถานะ → คลาสสีพร้อมใช้ (`bg-… text-…`) — ใช้คู่กับ `<StatusBadge>` ใน UI Kit */
export function statusBadgeClass(status: string | null | undefined): string {
  return STATUS_BADGE_CLASS[statusBadgeGroup(status)]
}

/** รายการสถานะทั้งหมดที่ mapper รู้จัก — ใช้ในเทสต์/หน้าตรวจสอบ design system */
export function knownBadgeStatuses(): readonly string[] {
  return Object.keys(STATUS_GROUP)
}
