import { sanitizeFileName } from '@/lib/cases/document-upload'
import { documentExtension } from '@/lib/warehouse/lot-documents'

/**
 * path ไฟล์ใน bucket `case-documents` ของงานมติ PO U40/U41 (DEC-014 — server ประกอบ path เอง) — **pure** ใช้ร่วม FE/BE
 *
 * - สแกนหนังสือรับรอง 50 ทวิ ที่ลูกค้าหักเรา: `customer-wht/<certificateId>/<uuid>-<ชื่อไฟล์เดิม>.<ext>` (U40 ·
 *   mytester H-07/E-066 — เก็บชื่อไฟล์ที่ผู้ใช้อัปโหลด (ตัดอักขระนอก A-Z0-9._-) ให้ชุดส่งบัญชีอ้างถึงได้ · ไฟล์เก่า = `<uuid>.<ext>`)
 * - หลักฐานคืนเงินผู้โอน (เงินรับรอตรวจสอบ): `bank-transactions/<transactionId>/refund/<uuid>.<ext>` (U41)
 */
export function customerWhtFilePrefix(certificateId: string): string {
  return `customer-wht/${certificateId}/`
}

export function customerWhtFilePath(certificateId: string, fileName: string, uniqueKey: string): string {
  const extension = documentExtension(fileName)
  const sanitized = sanitizeFileName(fileName)
  const base = sanitized.includes('.') ? sanitized.slice(0, sanitized.lastIndexOf('.')) : sanitized
  // ชื่อที่เหลือแต่ค่าว่าง/"file" (เช่น ชื่อภาษาไทยล้วน) ไม่ช่วยอ้างถึง ⇒ ใช้รูปเดิม
  const suffix = base === '' || base === 'file' ? '' : `-${base}`
  return `${customerWhtFilePrefix(certificateId)}${uniqueKey}${suffix}.${extension}`
}

export function bankRefundFilePrefix(transactionId: string): string {
  return `bank-transactions/${transactionId}/refund/`
}

export function bankRefundFilePath(transactionId: string, fileName: string, uniqueKey: string): string {
  return `${bankRefundFilePrefix(transactionId)}${uniqueKey}.${documentExtension(fileName)}`
}
