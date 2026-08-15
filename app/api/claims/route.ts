import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { CREATE_CLAIM_CAPABILITIES, createManualClaim } from '@/lib/claims/queries'
import { claimCreateSchema } from '@/lib/claims/schemas'
import { APPROVAL_STEP_CAPABILITIES } from '@/lib/compensation/approval'
import { listCompensationApprovals } from '@/lib/compensation/approval-queries'
import { compensationListQuerySchema } from '@/lib/compensation/approval-types'

/**
 * รายการเบิก (`15` §14 · `27` §6.4) — `GET`/`POST /api/claims`
 *
 * **entity เดียวกับไฟล์ 16/41** (`15` §9 header) ⇒ `GET` ใช้ชั้นข้อมูลเดียวกับ `/api/compensation`
 * ตัวเดิม (auto จากไฟล์ 41 + manual จากที่นี่ อยู่ในตาราง `expenses` ชุดเดียวกัน)
 *
 * `POST` = Manual Claim (`15` §6.1 ข้อ 2) — การเงินบันทึกแทนผู้อื่นได้ · พนักงานภาคสนามบันทึก
 * ของตัวเองได้ (ตรวจซ้ำในชั้นข้อมูล) — เข้าคิวอนุมัติสายเดียวกันทันที ไม่ผ่านขั้นคลัง
 */

export const GET = withApiPermission(
  'view',
  APPROVAL_STEP_CAPABILITIES,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = compensationListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return apiSuccess(await listCompensationApprovals(user, parsed.data))
  },
)

export const POST = withApiPermission(
  'manage',
  CREATE_CLAIM_CAPABILITIES,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = claimCreateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const created = await createManualClaim({ actor: user, meta: getRequestMeta(request) }, parsed.data)
    return apiSuccess(created, { status: 201 })
  },
)
