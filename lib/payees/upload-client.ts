import { checkPayeeIdDocumentCandidate } from '@/lib/payees/id-document'
import { StorageUploadError, uploadToStorage } from '@/lib/uploads/client'

/**
 * อัปโหลดเอกสารยืนยันตัวตนผู้รับเงิน (มติ PO U150) แล้วคืน **path** ที่ส่งเข้าฟอร์มผู้รับเงิน/ฟอร์มผู้ใช้
 * — path ผูกกับองค์กรของผู้เรียก (server ประกอบเอง) · server ตรวจไฟล์ + SHA-256 อีกชั้นตอนบันทึก
 *
 * ⚠️ ฝั่ง browser เท่านั้น · error = `StorageUploadError` ข้อความพร้อมแสดงผู้ใช้
 */
export async function uploadPayeeIdDocument(file: File): Promise<string> {
  const problem = checkPayeeIdDocumentCandidate({ name: file.name, type: file.type, size: file.size })
  if (problem !== null) throw new StorageUploadError(problem)
  return uploadToStorage({ kind: 'payee_id_document' }, file)
}
