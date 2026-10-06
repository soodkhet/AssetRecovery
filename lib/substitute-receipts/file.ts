import { documentExtension } from '@/lib/warehouse/lot-documents'

/**
 * path ไฟล์ใบรับรองแทนใบเสร็จ **ฉบับเซ็นแล้ว** (มติ PO U103) ใน bucket `case-documents`
 * `substitute-receipts/<substituteReceiptId>/signed/<uuid>.<ext>` — server ประกอบ path เอง (DEC-014) · **pure** ใช้ร่วม FE/BE
 */
export function substituteReceiptFilePrefix(substituteReceiptId: string): string {
  return `substitute-receipts/${substituteReceiptId}/signed/`
}

export function substituteReceiptFilePath(substituteReceiptId: string, fileName: string, uniqueKey: string): string {
  return `${substituteReceiptFilePrefix(substituteReceiptId)}${uniqueKey}.${documentExtension(fileName)}`
}
