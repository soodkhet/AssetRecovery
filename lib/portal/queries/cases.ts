import { z } from 'zod'
import type { AssignmentStatus, Prisma } from '@/lib/generated/prisma/client'
import type { PortalContext } from '@/lib/portal/guard'
import {
  serializePortalCaseDetail,
  serializePortalCaseListItem,
  type PortalCaseAssetSource,
  type PortalCaseDetailDto,
  type PortalCaseListItemDto,
} from '@/lib/portal/serializers'
import { PORTAL_CASE_STATUS_CODES, type PortalCaseStatusCode } from '@/lib/portal/status-map'
import { prisma } from '@/lib/prisma'

/**
 * Query layer ของหมวดเคสในพอร์ทัล (`97` §6.1/§6.6 v4.1 · มติ PO 05/10/2569 U6/O43) — **แยกจาก query ภายใน**
 *
 * - กรอง `organization_id` + `company_id = ctx.companyId` **ทุก query** (`97` §11) — ไม่รับ company จาก request
 * - select เฉพาะคอลัมน์ที่ serializer ต้องใช้ (ไม่ดึงข้อมูลลูกหนี้ส่วนอื่น/IMEI/ทีม/ผู้พิจารณาเลย)
 * - ตัวกรองสถานะใช้ **รหัสฝั่งบริษัท** (`status_display`) ไม่รับ raw enum (`97` §11)
 */

/** สถานะงานภาคสนามที่ยังไม่จบ (รวมถูกตีกลับ) — ตรงกับ `isAssignmentOpen()` ของ `status-map.ts` */
const OPEN_ASSIGNMENT_STATUSES = [
  'pending_accept',
  'accepted_unscheduled',
  'scheduled',
  'needs_revision',
] as const satisfies readonly AssignmentStatus[]

export const portalCaseListQuerySchema = z.object({
  status: z.enum(PORTAL_CASE_STATUS_CODES).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})
export type PortalCaseListQuery = z.infer<typeof portalCaseListQuerySchema>

export interface PortalCaseListResultDto {
  items: PortalCaseListItemDto[]
  total: number
  page: number
  limit: number
}

const hasOpenAssignment: Prisma.CaseWhereInput = {
  assignments: { some: { status: { in: [...OPEN_ASSIGNMENT_STATUSES] } } },
}

/** รหัสสถานะฝั่งบริษัท → เงื่อนไข Prisma (กลับด้านของ `portalCaseStatusCode()` — `97` §10.1) */
export function portalCaseStatusWhere(code: PortalCaseStatusCode): Prisma.CaseWhereInput {
  switch (code) {
    case 'under_review':
      return { status: { in: ['draft', 'pending_review'] } }
    case 'info_requested':
      return { status: 'need_info' }
    case 'declined':
      return { status: 'rejected' }
    case 'tracking':
      return {
        OR: [
          { status: { in: ['approved', 'active', 'pending_recycle_review'] } },
          { status: { in: ['closed_success', 'closed_fail'] }, ...hasOpenAssignment },
        ],
      }
    case 'recovered':
      return { status: 'closed_success', NOT: hasOpenAssignment }
    case 'not_recovered':
      return { status: 'closed_fail', NOT: hasOpenAssignment }
  }
}

/** ขอบเขตแถวของพอร์ทัล — เคสที่ไม่ถูกลบของบริษัทผู้เรียกเท่านั้น */
export function portalCaseScope(ctx: PortalContext): Prisma.CaseWhereInput {
  return { organizationId: ctx.user.organizationId, companyId: ctx.companyId, deletedAt: null }
}

/** assignment ปัจจุบัน = ล่าสุดที่ไม่ใช่ `reassigned_away` (จับเคสถูกตีกลับ) */
const currentAssignmentSelect = {
  where: { status: { not: 'reassigned_away' } },
  orderBy: { createdAt: 'desc' },
  take: 1,
  select: { status: true },
} as const satisfies Prisma.Case$assignmentsArgs

const listSelect = {
  id: true,
  caseRef: true,
  debtorName: true,
  status: true,
  trackingRound: true,
  reviewNote: true,
  createdAt: true,
  assignments: currentAssignmentSelect,
} as const satisfies Prisma.CaseSelect

export async function listPortalCases(ctx: PortalContext, query: PortalCaseListQuery): Promise<PortalCaseListResultDto> {
  const and: Prisma.CaseWhereInput[] = [portalCaseScope(ctx)]
  if (query.status !== undefined) and.push(portalCaseStatusWhere(query.status))
  if (query.search !== undefined) {
    and.push({
      OR: [
        { caseRef: { contains: query.search, mode: 'insensitive' } },
        { debtorName: { contains: query.search, mode: 'insensitive' } },
      ],
    })
  }
  const where: Prisma.CaseWhereInput = { AND: and }

  const [rows, total] = await Promise.all([
    prisma.case.findMany({
      where,
      select: listSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.case.count({ where }),
  ])

  return {
    items: rows.map((row) => serializePortalCaseListItem({ ...row, assignmentStatus: row.assignments[0]?.status ?? null })),
    total,
    page: query.page,
    limit: query.limit,
  }
}

/** ทรัพย์ของเคสที่รับเข้าคลังแล้ว (ไม่นับที่ถูกปฏิเสธ/ลบ) — ล่าสุด 1 ชิ้น */
async function findCaseAsset(ctx: PortalContext, caseId: string): Promise<PortalCaseAssetSource | null> {
  return prisma.asset.findFirst({
    where: {
      organizationId: ctx.user.organizationId,
      companyId: ctx.companyId,
      caseId,
      deletedAt: null,
      assetStatus: { not: 'intake_rejected' },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, photos: true, condition: true, conditionNote: true },
  })
}

export interface PortalCaseDetailRow {
  companyId: string
  /** `null` เมื่อเป็นแถวของบริษัทอื่น (ไม่ serialize) — route ปฏิเสธด้วย `requirePortalRow()` ก่อนใช้ค่า */
  dto: PortalCaseDetailDto | null
}

/**
 * ดึงเคสด้วย id **โดยไม่กรองบริษัท** (กรององค์กรอย่างเดียว) แล้วคืน `companyId` ให้ route ส่งต่อ
 * `requirePortalRow()` — แยก "ไม่พบ" กับ "ข้ามบริษัท" ได้ใน audit แต่ตอบ 403 เหมือนกัน (D3/D4)
 * · ประกอบ DTO เฉพาะแถวของบริษัทผู้เรียกเท่านั้น (แถวบริษัทอื่นไม่ถูก serialize เลย)
 */
export async function findPortalCaseDetail(ctx: PortalContext, id: string): Promise<PortalCaseDetailRow | null> {
  if (!z.guid().safeParse(id).success) return null
  const row = await prisma.case.findFirst({
    where: { id, organizationId: ctx.user.organizationId, deletedAt: null },
    select: {
      ...listSelect,
      companyId: true,
      serviceFeeModelSnapshot: true,
      serviceFeeRatePct: true,
      serviceFeeBaseSatang: true,
      serviceFeeBasisSnapshot: true,
      serviceFeeFailFeeSatang: true,
      projectedRevenueSatang: true,
    },
  })
  if (row === null) return null
  if (row.companyId !== ctx.companyId) return { companyId: row.companyId, dto: null }

  const asset = row.status === 'closed_success' ? await findCaseAsset(ctx, row.id) : null
  return {
    companyId: row.companyId,
    dto: serializePortalCaseDetail({ ...row, assignmentStatus: row.assignments[0]?.status ?? null, asset }),
  }
}

/** นับเคส "กำลังดำเนินการติดตาม" ของบริษัท — การ์ด KPI ภาพรวม (`97` §5) */
export async function countPortalCasesInProgress(ctx: PortalContext): Promise<number> {
  return prisma.case.count({ where: { AND: [portalCaseScope(ctx), portalCaseStatusWhere('tracking')] } })
}
