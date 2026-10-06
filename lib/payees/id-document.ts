import { documentExtension } from '@/lib/warehouse/lot-documents'

/**
 * เอกสารยืนยันตัวตนของผู้รับเงิน (มติ PO 07/10/2569 U150) — **pure ล้วน** ใช้ร่วม FE/BE
 *
 * path ใน bucket `case-documents`: `payees/<organizationId>/id-documents/<uuid>.<ext>` — ผูกกับ **องค์กร**
 * ไม่ใช่ตัวผู้รับ เพราะฟอร์มผู้ใช้ (U131) อัปโหลดก่อนที่ผู้ใช้/ผู้รับเงินจะเกิด · server ประกอบ path เอง (DEC-014)
 * · ความเป็นเจ้าของตอนเปิดดูตัดสินจากแถว `payee_profiles` ที่อ้าง path นี้ (`lib/uploads/access.ts`)
 *
 * ข้อมูลเก่าที่เป็น URL พิมพ์เอง ถูกทำเครื่องหมาย `id_document_unverified` ⇒ เกตยืนยันถือว่าไม่มีเอกสาร
 */

/** เพดานขนาดเท่าเอกสารเคส (10 MB) — รับรูป/PDF */
export const PAYEE_ID_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024

export const PAYEE_ID_DOCUMENT_ACCEPT = 'image/*,application/pdf'

export function payeeIdDocumentPrefix(organizationId: string): string {
  return `payees/${organizationId}/id-documents/`
}

export function payeeIdDocumentPath(organizationId: string, fileName: string, uniqueKey: string): string {
  return `${payeeIdDocumentPrefix(organizationId)}${uniqueKey}.${documentExtension(fileName)}`
}

export interface IdDocumentState {
  idDocumentUrl: string | null
  idDocumentHash: string | null
  idDocumentUnverified: boolean
}

/** เอกสารผ่านการตรวจของ server ไหม — ไม่มี path / ไม่มี hash / ข้อมูลเก่าที่ทำเครื่องหมายไว้ = ไม่ผ่าน */
export function isIdDocumentVerified(state: IdDocumentState): boolean {
  const path = state.idDocumentUrl?.trim() ?? ''
  return path !== '' && state.idDocumentHash !== null && !state.idDocumentUnverified
}

/** ตรวจไฟล์ก่อนขอโทเคนอัปโหลด (UX — ตัวบังคับจริงคือการตรวจตอนบันทึก) · `null` = ผ่าน */
export function checkPayeeIdDocumentCandidate(file: { name: string; type: string; size: number }): string | null {
  const type = file.type.toLowerCase()
  if (type !== '' && !type.startsWith('image/') && type !== 'application/pdf') {
    return `เอกสารยืนยันตัวตนรับเฉพาะไฟล์รูปภาพหรือ PDF — ไฟล์ ${file.name} ไม่รองรับ`
  }
  if (file.size > PAYEE_ID_DOCUMENT_MAX_BYTES) return `ไฟล์ ${file.name} ใหญ่เกิน 10 MB`
  if (file.size <= 0) return `ไฟล์ ${file.name} ว่างเปล่า`
  return null
}
