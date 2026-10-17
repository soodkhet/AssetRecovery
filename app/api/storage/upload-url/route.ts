import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse } from '@/lib/api/http'
import { requireAnyPermission } from '@/lib/auth/require-permission'
import { authorizeUpload, STORAGE_UPLOAD_CAPABILITIES } from '@/lib/uploads/access'
import { uploadDiscardToken } from '@/lib/uploads/discard-token'
import { createSignedUpload, uploadDiscardSecret } from '@/lib/uploads/storage'
import { signedUploadRequestSchema, type SignedUploadDto } from '@/lib/uploads/targets'

/**
 * `POST /api/storage/upload-url` (BUG-143 · DEC-014) — ออก **โทเคนอัปโหลดต่อ path เดียว** ของ bucket `case-documents`
 *
 * body `{ target, fileName, sizeBytes }` → ตรวจ capability + scope ของ endpoint ที่จะผูกไฟล์ (เคส · เคสภาคสนามของตัวเอง ·
 * เครื่อง · ล็อต · ใบเสร็จของตัวเอง) แล้ว **server ประกอบ path เอง** · browser อัปโหลดด้วย `uploadToSignedUrl()`
 * ไฟล์ยังต้องผ่านการตรวจตอนผูกเข้าข้อมูล (`lib/uploads/verify.ts`) เหมือนเดิม
 * + `discardToken` ผูกผู้ขอ — ใช้ทิ้งไฟล์ที่ไม่ได้ใช้ผ่าน `POST /api/storage/discard` (mytester6 T-015/T-019)
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    await requireAnyPermission('manage', STORAGE_UPLOAD_CAPABILITIES)
    const parsed = signedUploadRequestSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const { user, path } = await authorizeUpload({ ...parsed.data, uniqueKey: crypto.randomUUID() })
    const signed = await createSignedUpload(path)
    // Storage ล่ม/ออกโทเคนไม่ได้ = ความผิดพลาดของระบบจริง ⇒ ปล่อยเป็น 500 (ไม่แปลงเป็น 4xx ปลอม)
    if (signed === null) throw new Error(`createSignedUploadUrl ไม่สำเร็จ: ${path}`)
    const data: SignedUploadDto = {
      path: signed.path,
      token: signed.token,
      // ผู้ขอ path นี้ทิ้งไฟล์ที่ยังไม่ได้ใช้ได้เอง (`POST /api/storage/discard` — mytester6 T-015/T-019)
      discardToken: uploadDiscardToken(uploadDiscardSecret(), user.id, signed.path),
    }
    return apiSuccess(data)
  } catch (error) {
    return toModuleErrorResponse(error)
  }
}
