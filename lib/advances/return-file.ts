import { documentExtension } from '@/lib/warehouse/lot-documents'

/**
 * path หลักฐานการรับคืนเงินทดรองแยก (มติ PO 05/10/2569 UAT U30) ใน bucket `case-documents`
 * `advances/<advanceId>/returns/<uuid>.<ext>` — server ประกอบ path เอง (DEC-014) · **pure** ใช้ร่วม FE/BE
 */
export function advanceReturnFilePrefix(advanceId: string): string {
  return `advances/${advanceId}/returns/`
}

export function advanceReturnFilePath(advanceId: string, fileName: string, uniqueKey: string): string {
  return `${advanceReturnFilePrefix(advanceId)}${uniqueKey}.${documentExtension(fileName)}`
}
