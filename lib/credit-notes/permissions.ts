import { MANAGE_TAX_INVOICE, SALES_READ_CAPABILITIES } from '@/lib/sales/sales'

/**
 * สิทธิ์ของใบลดหนี้ (มติ PO U14) — **ไม่เพิ่ม capability ใหม่**: ใบลดหนี้เป็นเอกสารภาษีในหมวดเดียวกับใบกำกับ
 * ⇒ บันทึก/ยกเลิก = `manage_tax_invoice` (บัญชี manage · `25` §7.4) · ดู = ชุดเดียวกับรายการขาย (การเงิน view)
 */
export const MANAGE_CREDIT_NOTE = MANAGE_TAX_INVOICE
export const CREDIT_NOTE_READ_CAPABILITIES = SALES_READ_CAPABILITIES

/** ป้าย "รอใบลดหนี้" — ผู้เห็นหน้าใบกำกับ + ผู้เห็นหน้า Adjustment (สร้าง/อนุมัติ) */
export const AWAITING_CREDIT_NOTE_CAPABILITIES = [
  ...SALES_READ_CAPABILITIES,
  'create_adjustment',
  'approve_adjustment',
] as const
