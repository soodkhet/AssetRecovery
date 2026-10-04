import { apiPath } from '@/lib/api/contract'
import { callApi, jsonRequest } from '@/lib/api/types'
import { sha256Hex } from '@/lib/cases/document-upload'
import { checkFieldMediaCandidate } from '@/lib/field/media-upload'
import { StorageUploadError, uploadToStorage } from '@/lib/uploads/client'
import type { UploadTarget } from '@/lib/uploads/targets'
import type { IntakePhotoAngle } from '@/lib/warehouse/intake'
import { checkLotDocumentCandidate } from '@/lib/warehouse/lot-documents'
import type { LotDocument } from '@/lib/warehouse/lot-status'
import type { LotDetailDto } from '@/lib/warehouse/types'

/**
 * อัปโหลดรูปหลักฐานตอนรับเข้าคลัง (`44` §8.2 ขั้น 3/3) แล้วคืน **path** ที่จะส่งเข้า
 * `POST /api/assets/:id/intake` (`photos[]`)
 *
 * ⚠️ ฝั่ง browser เท่านั้น — ห้าม import เข้า route handler
 * ⚠️ ใช้ bucket `case-documents` ตัวเดิมของ 2.5 (ไม่ต้องสร้าง bucket ใหม่ต่อ environment)
 *
 * การตรวจสิทธิ์จริงยังอยู่ที่ API layer เสมอ (DEC-002) — endpoint intake ตรวจ `manage:intake_asset`
 * + scope ของเครื่องก่อนผูก path เข้า `assets.photos`
 */
export class WarehouseUploadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WarehouseUploadError'
  }
}

/** เพดาน/ชนิดไฟล์เท่ากับรูปหลักฐานภาคสนาม (`lib/field/media-upload.ts`) — รูปจากกล้องเครื่องเดียวกัน */
export const INTAKE_PHOTO_ACCEPT = 'image/*'

export async function uploadIntakePhoto(assetId: string, angle: IntakePhotoAngle, file: File): Promise<string> {
  const problem = checkFieldMediaCandidate('photo', { name: file.name, type: file.type, size: file.size })
  if (problem !== null) throw new WarehouseUploadError(problem)

  // bucket เป็น private ⇒ เก็บ path ไว้ แล้วขอ signed URL จาก server ตอนเปิดดู (`signedFileUrl()`)
  return upload({ kind: 'intake_photo', assetId, angle }, file)
}

/** อัปโหลดผ่านโทเคนที่ server ออกให้หลังตรวจ capability + scope ของเครื่อง/ล็อต (BUG-143 · DEC-014) */
async function upload(target: UploadTarget, file: File): Promise<string> {
  try {
    return await uploadToStorage(target, file)
  } catch (error) {
    if (error instanceof StorageUploadError) throw new WarehouseUploadError(error.message)
    throw error
  }
}

/**
 * อัปโหลดเอกสารแนบของล็อตส่งมอบ (`44` §6.4 · §8.4) แล้ว **ผูกเข้าล็อตผ่าน API** — คืนล็อตล่าสุด
 * (มติ PO 03/10/2569 — UAT Q13 · ปิดหนี้ #1)
 *
 * 1. อัปโหลดขึ้น path **ต่อเวอร์ชัน** `handover-lots/<lotId>/<ชนิด>/<uuid>.<ext>` ผ่านโทเคนที่ server ออกให้ (server ประกอบ path เอง · ไม่ทับของเดิม — BUG-143)
 * 2. `POST /api/handover-lots/:id/documents` — server ดาวน์โหลดไฟล์มาตรวจเอง (มีจริง · path ใต้ล็อตนี้ ·
 *    ชนิดจากเนื้อไฟล์ · ขนาด) แล้วเก็บ SHA-256 ของ server · ล็อต confirmed แล้วแนบไม่ได้
 *    (`fileHash` ที่ส่งไปใช้เทียบเท่านั้น — ไม่ตรง = ปฏิเสธ)
 */
export async function uploadLotDocument(lotId: string, document: LotDocument, file: File): Promise<LotDetailDto> {
  const problem = checkLotDocumentCandidate(document, { name: file.name, type: file.type, size: file.size })
  if (problem !== null) throw new WarehouseUploadError(problem)

  const fileHash = await sha256Hex(await file.arrayBuffer())
  const fileUrl = await upload({ kind: 'lot_document', lotId, document }, file)

  const response = await callApi<LotDetailDto>(
    apiPath('lot.attachDocument', { id: lotId }),
    jsonRequest('POST', { document, fileUrl, fileHash }),
  )
  if (response.error !== undefined || response.data === undefined) {
    throw new WarehouseUploadError(response.error?.message ?? `แนบ ${file.name} เข้าล็อตไม่สำเร็จ`)
  }
  return response.data
}
