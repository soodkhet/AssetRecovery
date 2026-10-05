import { documentExtension } from '@/lib/warehouse/lot-documents'

/**
 * path ไฟล์ใน bucket `case-documents` ของงานมติ PO U40/U41 (DEC-014 — server ประกอบ path เอง) — **pure** ใช้ร่วม FE/BE
 *
 * - สแกนหนังสือรับรอง 50 ทวิ ที่ลูกค้าหักเรา: `customer-wht/<certificateId>/<uuid>.<ext>` (U40)
 * - หลักฐานคืนเงินผู้โอน (เงินรับรอตรวจสอบ): `bank-transactions/<transactionId>/refund/<uuid>.<ext>` (U41)
 */
export function customerWhtFilePrefix(certificateId: string): string {
  return `customer-wht/${certificateId}/`
}

export function customerWhtFilePath(certificateId: string, fileName: string, uniqueKey: string): string {
  return `${customerWhtFilePrefix(certificateId)}${uniqueKey}.${documentExtension(fileName)}`
}

export function bankRefundFilePrefix(transactionId: string): string {
  return `bank-transactions/${transactionId}/refund/`
}

export function bankRefundFilePath(transactionId: string, fileName: string, uniqueKey: string): string {
  return `${bankRefundFilePrefix(transactionId)}${uniqueKey}.${documentExtension(fileName)}`
}
