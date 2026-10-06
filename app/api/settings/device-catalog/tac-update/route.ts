import { after, type NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { MANAGE_DEVICE_CATALOG_CAPABILITY } from '@/lib/device-catalog/permissions'
import { deviceTacUpdateRequestSchema } from '@/lib/device-catalog/schemas'
import { requestDeviceTacUpdate } from '@/lib/device-catalog/tac-queries'
import type { DeviceCatalogSyncRequestDto } from '@/lib/device-catalog/types'
import { runJobById } from '@/lib/jobs/engine'

/** ดาวน์โหลด/แยกไฟล์ TAC ~12 MB — บังคับ runtime Node (ไม่ตกไป Edge) */
export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * `POST /api/settings/device-catalog/tac-update` (มติ PO U166 → U167) — ผู้ดูแลกด "อัปเดตตอนนี้"
 *
 * ตั้งงาน `device_tac_sync` ขององค์กรนี้ (ลำดับเดียวกับ job รายวัน: commits API → sha เดิมไม่โหลด → fallback ETag)
 * `force = true` = "บังคับดึงใหม่" (ข้าม sha/ETag เดิม) · คีย์กันซ้ำต่อชั่วโมง ⇒ กดรัวได้งานเดิม
 * รันหลังตอบกลับ (`after`) · ผลดูได้ที่ประวัติการอัปเดตในหน้า Model Phone / Job Log
 */
export const POST = withApiPermission(
  'manage',
  MANAGE_DEVICE_CATALOG_CAPABILITY,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = deviceTacUpdateRequestSchema.safeParse((await readJsonBody(request)) ?? {})
    if (!parsed.success) return validationErrorResponse(parsed.error)
    const data: DeviceCatalogSyncRequestDto = await requestDeviceTacUpdate(
      { actor: user, meta: getRequestMeta(request), reason: null },
      { force: parsed.data.force },
    )
    if (!data.duplicate) {
      after(async () => {
        await runJobById(data.jobId)
      })
    }
    return Response.json({ data }, { status: data.duplicate ? 200 : 202 })
  },
)
