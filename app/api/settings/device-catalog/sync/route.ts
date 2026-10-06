import { after, type NextRequest } from 'next/server'
import { toModuleErrorResponse, withApiPermission } from '@/lib/api/http'
import { DEVICE_CATALOG_SYNC_JOB_TYPE, MANUAL_MAX_REQUESTS } from '@/lib/device-catalog/sync-job'
import type { DeviceCatalogSyncRequestDto } from '@/lib/device-catalog/types'
import { enqueueJob, runJobById } from '@/lib/jobs/engine'

/** handler ดึงข้อมูลจาก API ภายนอก — บังคับ runtime Node (ไม่ตกไป Edge) */
export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * `POST /api/settings/device-catalog/sync` (มติ PO U157) — ผู้ดูแลกด "ดึงข้อมูลตอนนี้"
 *
 * ตั้งงาน `device_catalog_sync` ขององค์กรนี้ด้วยเพดาน request {@link MANUAL_MAX_REQUESTS} (ใช้ดึงครบครั้งแรก —
 * แบรนด์ที่ดึงแล้วถูกข้าม ⇒ กดซ้ำ = ทำต่อจากที่ค้าง) แล้วรันหลังตอบกลับ (`after`) · คีย์กันซ้ำต่อชั่วโมง
 * ⇒ กดรัวในชั่วโมงเดียวกันได้งานเดิม (ประหยัดโควตา) · ผลดูได้ที่หน้า Model Phone / Job Log
 */
export const POST = withApiPermission(
  'manage',
  'manage_device_catalog',
  toModuleErrorResponse,
  async (_request: NextRequest, _context: unknown, user) => {
    const now = new Date()
    const hour = new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 13)
    const { job, duplicate } = await enqueueJob({
      organizationId: user.organizationId,
      jobType: DEVICE_CATALOG_SYNC_JOB_TYPE,
      idempotencyKey: `manual:${DEVICE_CATALOG_SYNC_JOB_TYPE}:${user.organizationId}:${hour}`,
      payload: { maxRequests: MANUAL_MAX_REQUESTS, source: 'manual' },
      createdBy: user.id,
      actorRole: user.roleName,
      reason: 'ผู้ดูแลสั่งดึงข้อมูลรุ่นเครื่องจากหน้า Model Phone',
    })
    if (!duplicate) {
      after(async () => {
        await runJobById(job.id)
      })
    }
    const data: DeviceCatalogSyncRequestDto = { jobId: job.id, duplicate }
    return Response.json({ data }, { status: duplicate ? 200 : 202 })
  },
)
