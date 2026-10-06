import { after, type NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { MANAGE_DEVICE_CATALOG_CAPABILITY } from '@/lib/device-catalog/permissions'
import { deviceTacImportRequestSchema } from '@/lib/device-catalog/schemas'
import { isTacCsvHeader, iterateCsvRows } from '@/lib/device-catalog/tac'
import { isOwnTacFilePath, requestDeviceTacUpdate } from '@/lib/device-catalog/tac-queries'
import type { DeviceCatalogSyncRequestDto } from '@/lib/device-catalog/types'
import { runJobById } from '@/lib/jobs/engine'
import { SettingsError } from '@/lib/settings/errors'
import { UploadError } from '@/lib/uploads/errors'
import { downloadUploadedFile } from '@/lib/uploads/storage'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * `POST /api/settings/device-catalog/tac-import` (มติ PO U166) — "นำเข้าไฟล์เอง"
 *
 * browser อัปโหลด CSV เข้า storage ผ่านกลไก uploads (target `device_tac_file` — path ใต้องค์กรผู้สั่ง) แล้วส่ง path มา
 * server ตรวจ path เป็นขององค์กรตัวเอง → ดาวน์โหลด → **ตรวจรูปแบบ** (หัวตาราง `Brand,TAC,SPECS` + มีแถวข้อมูล)
 * ไม่ผ่าน = `DEVICE_TAC_FILE_INVALID` · ผ่าน = ตั้งงาน `device_tac_sync` (trigger = file) รันหลังตอบกลับ
 * นำเข้าเพิ่มเฉพาะ TAC ใหม่ (เหมือน job รายวัน) · ผลอยู่ในประวัติการอัปเดต
 */
export const POST = withApiPermission(
  'manage',
  MANAGE_DEVICE_CATALOG_CAPABILITY,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = deviceTacImportRequestSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    const path = parsed.data.path
    if (!isOwnTacFilePath(user.organizationId, path)) {
      throw new UploadError('UPLOAD_PATH_OUT_OF_SCOPE', { detail: `device-tac path=${path}` })
    }
    const bytes = await downloadUploadedFile(path)
    if (bytes === null) throw new SettingsError('DEVICE_TAC_FILE_INVALID', { detail: `missing path=${path}` })
    const rows = iterateCsvRows(new TextDecoder('utf-8').decode(bytes))
    const header = rows.next()
    const first = rows.next()
    if (header.done === true || !isTacCsvHeader(header.value) || first.done === true) {
      throw new SettingsError('DEVICE_TAC_FILE_INVALID', { detail: `bad header path=${path}` })
    }

    const data: DeviceCatalogSyncRequestDto = await requestDeviceTacUpdate(
      { actor: user, meta: getRequestMeta(request), reason: null },
      { filePath: path },
    )
    if (!data.duplicate) {
      after(async () => {
        await runJobById(data.jobId)
      })
    }
    return Response.json({ data }, { status: data.duplicate ? 200 : 202 })
  },
)
