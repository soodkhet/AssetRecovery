import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse } from '@/lib/api/http'
import { emitAudit } from '@/lib/audit/audit'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { requireAnyPermission } from '@/lib/auth/require-permission'
import { authorizeDownload, STORAGE_VIEW_CAPABILITIES } from '@/lib/uploads/access'
import { UploadError } from '@/lib/uploads/errors'
import { buildPersonalFileViewAudit } from '@/lib/uploads/personal-data'
import { createSignedDownloadUrl, SIGNED_DOWNLOAD_TTL_SECONDS } from '@/lib/uploads/storage'
import { signedDownloadRequestSchema, type SignedDownloadDto } from '@/lib/uploads/targets'

/**
 * `POST /api/storage/download-url` (BUG-143 · DEC-014) — signed URL อายุสั้นของไฟล์ใน bucket `case-documents`
 *
 * body `{ path }` (POST เพื่อไม่ให้ path ซึ่งมีชื่อไฟล์ไปค้างใน URL/log) → ตรวจสิทธิ์ตาม **เจ้าของ path**
 * (เคส/เครื่อง/ล็อต/ผู้เบิก) ด้วย capability + scope ตัวเดียวกับหน้าที่แสดงไฟล์นั้น · นอก scope = NOT_FOUND ของโมดูล
 *
 * มติ PO 06/10/2569 (U90): ไฟล์ข้อมูลส่วนบุคคล (เอกสารเคสของลูกหนี้ / 50 ทวิ ลูกค้า) ลง audit `view`
 * **หลังออก URL สำเร็จเท่านั้น** — เขียน audit ไม่สำเร็จ = ไม่คืน URL (ไม่มีการเปิดไฟล์ที่ไม่มีร่องรอย)
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const user = await requireAnyPermission('view', STORAGE_VIEW_CAPABILITIES)
    const parsed = signedDownloadRequestSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    await authorizeDownload(user, parsed.data.path)
    const url = await createSignedDownloadUrl(parsed.data.path)
    if (url === null) throw new UploadError('UPLOAD_FILE_NOT_FOUND', { detail: parsed.data.path })
    const meta = getRequestMeta(request)
    const audit = buildPersonalFileViewAudit({
      actor: user,
      path: parsed.data.path,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    })
    if (audit !== null) await emitAudit(audit)
    const data: SignedDownloadDto = { url, expiresInSeconds: SIGNED_DOWNLOAD_TTL_SECONDS }
    return apiSuccess(data)
  } catch (error) {
    return toModuleErrorResponse(error)
  }
}
