import { documentExtension } from '@/lib/warehouse/lot-documents'

/**
 * path ไฟล์สแกนใบลดหนี้ใน bucket `case-documents` (DEC-014 — server ประกอบ path เอง)
 * `tax-invoices/<taxInvoiceId>/credit-notes/<uuid>.<ext>` — ผูกกับใบกำกับเพราะอัปโหลดก่อนบันทึกใบลดหนี้
 * **pure** — ใช้ร่วม FE/BE
 */
export function creditNoteFilePrefix(taxInvoiceId: string): string {
  return `tax-invoices/${taxInvoiceId}/credit-notes/`
}

export function creditNoteFilePath(taxInvoiceId: string, fileName: string, uniqueKey: string): string {
  return `${creditNoteFilePrefix(taxInvoiceId)}${uniqueKey}.${documentExtension(fileName)}`
}
