import { ModuleError, type ErrorMessage } from '@/lib/api/errors'

/**
 * Error code หมวดคลังสินค้า/ส่งมอบ (ไฟล์ 44 §12) — SSOT อยู่ที่ `docs/44-asset-custody-handover.md` §12
 *
 * ⚠️ Rule 04: ห้ามตั้ง code ใหม่ที่นี่โดยไม่เพิ่มลง `44` §12 + `lib/api/error-catalog.ts` ในคอมมิตเดียวกัน
 * code ที่เติมเข้า `44` §12 พร้อมงาน Phase 2.13: `ASSET_NOT_FOUND`, `ASSET_INVALID_STATUS`, `LOT_NOT_FOUND`
 * (ตาราง §12 เดิมมีแต่ code ของกติกาธุรกิจ ไม่ได้ลิสต์ code "ไม่พบ/สถานะไม่ตรง" ที่ทุก endpoint ต้องใช้)
 *
 * code ที่ **ไม่** ประกาศซ้ำที่นี่ (ใช้ของโมดูลเดิม):
 * - `PERMISSION_DENIED` → `AuthError` · `REQUIRED_MISSING` → ตัวห่อ validation ของ `lib/api/http.ts`
 * - `IMEI_MISMATCH` = **เตือน ไม่ block** (Rule 04) — เดินทางมากับ `warning` ของ envelope ไม่ใช่ error
 *   จึงไม่มีในรายการนี้ (ดู `imeiMismatchWarning()` ที่ `lib/warehouse/intake.ts`)
 *
 * **pure ล้วน** — ห้าม import อะไรที่แตะ Prisma (ฟอร์มฝั่ง client เรียกตัว assert ชุดเดียวกับ API)
 */

export const WAREHOUSE_ERROR_CODES = [
  'INTAKE_MISSING_CONDITION',
  'INTAKE_MISSING_NOTE',
  'REJECT_MISSING_REASON',
  'MIXED_COMPANY_LOT',
  'EMPTY_LOT',
  'ASSET_NOT_IN_CUSTODY',
  'ASSET_ALREADY_IN_LOT',
  'LOT_MISSING_SIGNED_DOC',
  'LOT_MISSING_DELIVERY_PROOF',
  'LOT_ALREADY_CONFIRMED',
  'CONFIRM_TRANSACTION_FAILED',
  'ASSET_NOT_FOUND',
  'ASSET_INVALID_STATUS',
  'LOT_NOT_FOUND',
] as const

export type WarehouseErrorCode = (typeof WAREHOUSE_ERROR_CODES)[number]

/**
 * 404 = ไม่พบเป้าหมาย (ใช้กับ "อยู่นอก scope" ด้วย — ห้าม leak ว่ามีของบริษัทอื่นอยู่จริง `44` §13)
 * 400 = ผิดกติกาคลัง (ผู้ใช้แก้เองได้) · 500 = side effect ใน `$transaction` ล้ม (ปัญหาฝั่งระบบ `44` §11)
 */
const HTTP_STATUS: Record<WarehouseErrorCode, number> = {
  INTAKE_MISSING_CONDITION: 400,
  INTAKE_MISSING_NOTE: 400,
  REJECT_MISSING_REASON: 400,
  MIXED_COMPANY_LOT: 400,
  EMPTY_LOT: 400,
  ASSET_NOT_IN_CUSTODY: 400,
  ASSET_ALREADY_IN_LOT: 400,
  LOT_MISSING_SIGNED_DOC: 400,
  LOT_MISSING_DELIVERY_PROOF: 400,
  LOT_ALREADY_CONFIRMED: 400,
  CONFIRM_TRANSACTION_FAILED: 500,
  ASSET_NOT_FOUND: 404,
  ASSET_INVALID_STATUS: 400,
  LOT_NOT_FOUND: 404,
}

const MESSAGES: Record<WarehouseErrorCode, ErrorMessage> = {
  INTAKE_MISSING_CONDITION: {
    title: 'ยังไม่ได้เลือกสภาพเครื่อง',
    message: 'ต้องเลือกสภาพเครื่อง (ปกติ / ชำรุด / อุปกรณ์ขาดหาย) ก่อนยืนยันรับเข้าคลัง (`44` §12)',
  },
  INTAKE_MISSING_NOTE: {
    title: 'ต้องระบุรายละเอียดสภาพเครื่อง',
    message: 'สภาพ "ชำรุด" หรือ "อุปกรณ์ขาดหาย" ต้องกรอกรายละเอียดกำกับเสมอ (`44` §10)',
  },
  REJECT_MISSING_REASON: {
    title: 'ต้องระบุเหตุผลที่ตีกลับ',
    message: 'การตีกลับเครื่องต้องกรอกเหตุผลทุกครั้ง ห้ามเว้นว่าง (`44` §10)',
  },
  MIXED_COMPANY_LOT: {
    title: 'ล็อตเดียวมีได้บริษัทเดียว',
    message: 'ไม่สามารถสร้างล็อตที่มีเครื่องจากบริษัทไฟแนนซ์ต่างกันได้ — แยกล็อตตามบริษัท (`44` §6.2)',
  },
  EMPTY_LOT: {
    title: 'ยังไม่ได้เลือกเครื่อง',
    message: 'ต้องเลือกเครื่องอย่างน้อย 1 เครื่องก่อนสร้างล็อตส่งมอบ (`44` §10)',
  },
  ASSET_NOT_IN_CUSTODY: {
    title: 'มีเครื่องที่ยังไม่อยู่ในคลัง',
    message: 'ใส่ได้เฉพาะเครื่องที่รับเข้าคลังแล้ว (สถานะ "ในคลัง") เท่านั้น (`44` §10)',
  },
  ASSET_ALREADY_IN_LOT: {
    title: 'มีเครื่องที่อยู่ในล็อตอื่นแล้ว',
    message: 'เครื่องที่ถูกจัดเข้าล็อตแล้วต้องนำออกจากล็อตเดิมก่อน จึงจะย้ายเข้าล็อตใหม่ได้ (`44` §10)',
  },
  LOT_MISSING_SIGNED_DOC: {
    title: 'ยังไม่ได้แนบใบส่งมอบที่มีลายเซ็น',
    message: 'ต้องแนบใบส่งมอบที่ผู้รับเซ็นแล้วก่อนยืนยันส่งมอบ — บังคับทุกรูปแบบการส่งมอบ (`44` §6.3)',
  },
  LOT_MISSING_DELIVERY_PROOF: {
    title: 'ยังไม่ได้แนบหลักฐานการจัดส่ง',
    message: 'ล็อตแบบ "เราจัดส่งไปให้" ต้องแนบหลักฐานการจัดส่งเพิ่มจากใบเซ็นรับ (`44` §6.3)',
  },
  LOT_ALREADY_CONFIRMED: {
    title: 'ล็อตนี้ยืนยันส่งมอบแล้ว',
    message: 'ล็อตที่ยืนยันแล้วเป็นสถานะสุดท้าย แก้ไข/เพิ่ม/ลดเครื่องไม่ได้ทุกกรณี (`44` §10)',
  },
  CONFIRM_TRANSACTION_FAILED: {
    title: 'ยืนยันส่งมอบไม่สำเร็จ',
    message: 'ระบบยกเลิกการยืนยันทั้งชุดแล้ว (ไม่มีข้อมูลใดถูกเปลี่ยน) — ลองใหม่อีกครั้ง (`44` §11)',
  },
  ASSET_NOT_FOUND: {
    title: 'ไม่พบเครื่อง',
    message: 'ไม่พบเครื่องที่ระบุ หรือเครื่องนี้อยู่นอกขอบเขตข้อมูลของคุณ (`44` §13)',
  },
  ASSET_INVALID_STATUS: {
    title: 'สถานะของเครื่องไม่รองรับการกระทำนี้',
    message: 'สถานะเครื่องเปลี่ยนไปแล้ว — รีเฟรชหน้าจอเพื่อดูสถานะล่าสุดแล้วลองใหม่ (`44` §9.1)',
  },
  LOT_NOT_FOUND: {
    title: 'ไม่พบล็อตส่งมอบ',
    message: 'ไม่พบล็อตที่ระบุ หรือล็อตนี้อยู่นอกขอบเขตข้อมูลของคุณ (`44` §13)',
  },
}

export function warehouseErrorStatus(code: WarehouseErrorCode): number {
  return HTTP_STATUS[code]
}

export function warehouseErrorMessage(code: WarehouseErrorCode): ErrorMessage {
  return MESSAGES[code]
}

export class WarehouseError extends ModuleError<WarehouseErrorCode> {
  constructor(code: WarehouseErrorCode, options?: { detail?: string; context?: Record<string, unknown> }) {
    super(code, MESSAGES[code], HTTP_STATUS[code], options)
    this.name = 'WarehouseError'
  }
}
