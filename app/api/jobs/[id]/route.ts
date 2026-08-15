import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse, withApiPermission } from '@/lib/api/http'
import { MANAGE_JOBS } from '@/lib/jobs/access'
import { getJob } from '@/lib/jobs/queries'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `GET /api/jobs/:id` (`91` §14) — สถานะ + payload/result/ข้อผิดพลาดของงานหนึ่งตัว
 * ใช้ทั้งหน้า Job Log และการ poll ระหว่างรองาน (`91` §14 "ใช้ poll จาก UI ระหว่างรอ")
 */
export const GET = withApiPermission<RouteContext>(
  'view',
  MANAGE_JOBS,
  toModuleErrorResponse,
  async (_request: NextRequest, context, user) => {
    const { id } = await context.params
    return apiSuccess(await getJob(user, id))
  },
)
