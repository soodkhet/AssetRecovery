import { z } from 'zod'
import { emitAudit } from '@/lib/audit/audit'
import { ModuleError } from '@/lib/api/errors'
import { errorCodeStatus } from '@/lib/api/error-catalog'
import { dateOnlySchema } from '@/lib/api/validation'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { endOfBangkokDay, startOfBangkokDay } from '@/lib/format/datetime'
import type { Prisma } from '@/lib/generated/prisma/client'
import { HandoverLotStatus } from '@/lib/generated/prisma/enums'
import { rejectPortalRow, requirePortalRow, type PortalContext } from '@/lib/portal/guard'
import {
  serializePortalLotDetail,
  serializePortalLotListItem,
  type PortalLotDetailDto,
  type PortalLotListItemDto,
} from '@/lib/portal/serializers'
import {
  PORTAL_LOT_STATUS_CODES,
  portalLotDownloadable,
  portalLotStatusDisplay,
  type PortalLotStatusCode,
} from '@/lib/portal/status-map'
import { prisma } from '@/lib/prisma'
import { downloadUploadedFile } from '@/lib/uploads/storage'
import { documentExtension, lotDocumentMime } from '@/lib/warehouse/lot-documents'

/**
 * ชั้น query ของหมวด "ส่งมอบทรัพย์" ในพอร์ทัลบริษัทไฟแนนซ์ (`97` §6.4 · §10.2 · §17 · มติ PO 05/10/2569 O43 D6/D8 · O44)
 *
 * - **list**: กรอง `company_id = ctx.companyId` ในทุก query (`97` §11) — ไม่มีทางส่ง companyId จาก query string
 * - **detail/download**: ดึงแถวด้วย id **โดยไม่กรองบริษัท** แล้วส่งให้ `requirePortalRow()` ตัดสิน ⇒ id สุ่ม/ข้ามบริษัท
 *   ได้ 403 `PERMISSION_DENIED` แบบเดียวกัน + audit `access_denied` (D3/D4)
 * - **ไม่ select IMEI/serial ของทรัพย์เลย** (O44) — DTO ของ serializer ไม่มีช่องนี้อยู่แล้ว แต่ไม่ดึงขึ้นมาตั้งแต่ต้น
 * - **ดาวน์โหลด** = ใบส่งมอบที่มีลายเซ็นผู้รับ (`handover_lots.signed_doc_url`) เฉพาะล็อต `confirmed` (D8 — เป็นเอกสาร
 *   ของบริษัทเอง แม้มี IMEI) · ไฟล์ถูกอ่านด้วย service role แล้ว stream ผ่าน server (DEC-014 — ไม่ส่ง URL ของ bucket ออกไป)
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** ชนิดปลายทางของ audit (ชื่อตารางตาม `02`) */
export const PORTAL_LOT_TARGET = 'handover_lots'

/** สถานะภายในที่ตรงกับรหัสสถานะของพอร์ทัล (กลับทิศของ `portalLotStatusDisplay()` — คำนวณจาก mapping เดียว) */
export function internalLotStatusesFor(codes: readonly PortalLotStatusCode[]): HandoverLotStatus[] {
  return Object.values(HandoverLotStatus).filter((status) => codes.includes(portalLotStatusDisplay(status).code))
}

/** คำค้นต่อรหัสสถานะคั่นจุลภาค (`?status=dispatched,delivered`) */
const statusCodesSchema = z
  .string()
  .trim()
  .transform((value) => value.split(',').map((part) => part.trim()).filter((part) => part !== ''))
  .pipe(z.array(z.enum(PORTAL_LOT_STATUS_CODES)).min(1, 'เลือกสถานะอย่างน้อย 1 รายการ'))

/**
 * `GET /api/portal/handover-lots` query — สถานะใช้ **รหัสของพอร์ทัล** (`status_display`) ไม่ใช่ enum ภายใน (`97` §11)
 * · ช่วงวันที่เทียบกับวันที่สร้างล็อตตามปฏิทินไทย · ค้นได้เฉพาะเลขล็อต/เลขใบส่งมอบ (ไม่ค้นด้วย IMEI — O44)
 */
export const portalLotListQuerySchema = z
  .object({
    status: statusCodesSchema.optional(),
    dateFrom: dateOnlySchema('วันที่เริ่มต้น').optional(),
    dateTo: dateOnlySchema('วันที่สิ้นสุด').optional(),
    search: z.string().trim().min(1).max(100).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine((value) => value.dateFrom === undefined || value.dateTo === undefined || value.dateFrom <= value.dateTo, {
    message: 'วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด',
    path: ['dateTo'],
  })

export type PortalLotListQuery = z.infer<typeof portalLotListQuerySchema>

export interface PortalLotListResult {
  items: PortalLotListItemDto[]
  total: number
  page: number
  limit: number
}

const lotListSelect = {
  id: true,
  lotNumber: true,
  docRef: true,
  type: true,
  status: true,
  createdAt: true,
  confirmedAt: true,
  _count: { select: { assets: { where: { deletedAt: null } } } },
} as const

export async function listPortalLots(ctx: PortalContext, query: PortalLotListQuery): Promise<PortalLotListResult> {
  const where: Prisma.HandoverLotWhereInput = {
    organizationId: ctx.user.organizationId,
    companyId: ctx.companyId,
    deletedAt: null,
    ...(query.status === undefined ? {} : { status: { in: internalLotStatusesFor(query.status) } }),
    ...(query.dateFrom === undefined && query.dateTo === undefined
      ? {}
      : {
          createdAt: {
            ...(query.dateFrom === undefined ? {} : { gte: startOfBangkokDay(query.dateFrom) }),
            ...(query.dateTo === undefined ? {} : { lte: endOfBangkokDay(query.dateTo) }),
          },
        }),
    ...(query.search === undefined
      ? {}
      : {
          OR: [
            { lotNumber: { contains: query.search, mode: 'insensitive' } },
            { docRef: { contains: query.search, mode: 'insensitive' } },
          ],
        }),
  }

  const [rows, total] = await Promise.all([
    prisma.handoverLot.findMany({
      where,
      select: lotListSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.handoverLot.count({ where }),
  ])

  return {
    items: rows.map((row) => serializePortalLotListItem({ ...row, assetCount: row._count.assets })),
    total,
    page: query.page,
    limit: query.limit,
  }
}

/**
 * เงื่อนไขดึงล็อตด้วย id ภายในองค์กร — **ไม่กรองบริษัท** (ให้ `requirePortalRow()` ตัดสิน)
 * · id ที่ไม่ใช่ uuid = `null` (ถือว่าไม่พบ — คอลัมน์ uuid จะ error ถ้าส่งลง DB)
 */
function lotByIdWhere(ctx: PortalContext, lotId: string): Prisma.HandoverLotWhereInput | null {
  if (!UUID_PATTERN.test(lotId)) return null
  return { id: lotId, organizationId: ctx.user.organizationId, deletedAt: null }
}

const lotDetailSelect = {
  id: true,
  companyId: true,
  lotNumber: true,
  docRef: true,
  type: true,
  status: true,
  createdAt: true,
  confirmedAt: true,
} as const

/** ช่องของทรัพย์ที่พอร์ทัลอ่าน — **ไม่มี** `imei*`/`serial*` (O44) */
const lotAssetSelect = {
  id: true,
  caseRef: true,
  debtorName: true,
  deviceDesc: true,
  condition: true,
  conditionNote: true,
  photos: true,
} as const

export async function getPortalLotDetail(
  ctx: PortalContext,
  lotId: string,
  request?: Request,
): Promise<PortalLotDetailDto> {
  const where = lotByIdWhere(ctx, lotId)
  const row = where === null ? null : await prisma.handoverLot.findFirst({ where, select: lotDetailSelect })
  const lot = await requirePortalRow(ctx, row, { type: PORTAL_LOT_TARGET, id: lotId }, { request })
  const assets = await prisma.asset.findMany({
    where: { lotId: lot.id, organizationId: ctx.user.organizationId, companyId: ctx.companyId, deletedAt: null },
    select: lotAssetSelect,
    orderBy: [{ caseRef: 'asc' }, { id: 'asc' }],
  })
  return serializePortalLotDetail({ ...lot, assets })
}

export interface PortalLotFile {
  bytes: Uint8Array
  contentType: string
  fileName: string
}

const lotDownloadSelect = {
  id: true,
  companyId: true,
  lotNumber: true,
  docRef: true,
  status: true,
  signedDocUrl: true,
} as const

/** ล็อต confirmed แต่ไม่มีไฟล์ใบเซ็นรับให้อ่าน (ข้อมูลผิดปกติ/ไฟล์หายจาก bucket) — ข้อความสำหรับฝั่งบริษัท */
function missingSignedDoc(detail: string): ModuleError<'LOT_MISSING_SIGNED_DOC'> {
  return new ModuleError(
    'LOT_MISSING_SIGNED_DOC',
    {
      title: 'ไม่พบไฟล์ใบส่งมอบที่มีลายเซ็น',
      message: 'ยังไม่มีไฟล์ใบส่งมอบที่มีลายเซ็นผู้รับของล็อตนี้ กรุณาติดต่อผู้ให้บริการ',
    },
    errorCodeStatus('LOT_MISSING_SIGNED_DOC'),
    { detail },
  )
}

/**
 * ไฟล์ใบส่งมอบที่มีลายเซ็นผู้รับของล็อต (`97` §6.4/§18 · D8)
 * - ไม่พบ/ข้ามบริษัท → 403 + audit (`requirePortalRow`)
 * - ล็อตยังไม่ `confirmed` → 403 `PERMISSION_DENIED` + audit `access_denied` (`cause = lot_not_confirmed`)
 * - สำเร็จ → audit `export` บน `handover_lots` (ร่องรอยการนำเอกสารออก — Rule 03)
 */
export async function getPortalLotSignedDoc(
  ctx: PortalContext,
  lotId: string,
  request?: Request,
): Promise<PortalLotFile> {
  const target = { type: PORTAL_LOT_TARGET, id: lotId }
  const where = lotByIdWhere(ctx, lotId)
  const row = where === null ? null : await prisma.handoverLot.findFirst({ where, select: lotDownloadSelect })
  const lot = await requirePortalRow(ctx, row, target, { request, download: true })
  if (!portalLotDownloadable(lot.status)) {
    return rejectPortalRow(ctx, target, `lot_not_confirmed:${lot.status}`, { request, download: true })
  }

  const path = (lot.signedDocUrl ?? '').trim()
  if (path === '') throw missingSignedDoc(`lot=${lot.id} signed_doc_url empty`)
  const bytes = await downloadUploadedFile(path)
  if (bytes === null) throw missingSignedDoc(`lot=${lot.id} storage object missing`)

  const meta = request ? getRequestMeta(request) : { ipAddress: null, userAgent: null }
  await emitAudit({
    organizationId: ctx.user.organizationId,
    actorId: ctx.user.id,
    actorRole: ctx.user.roleName,
    action: 'export',
    targetType: PORTAL_LOT_TARGET,
    targetId: lot.id,
    after: { channel: 'portal', document: 'signed_doc', company_id: ctx.companyId, lot_number: lot.lotNumber },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  })

  return {
    bytes,
    contentType: lotDocumentMime(path),
    fileName: `${lot.docRef}-signed.${documentExtension(path)}`,
  }
}
