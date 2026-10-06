import { z } from 'zod'
import { emitAudit } from '@/lib/audit/audit'
import { ModuleError } from '@/lib/api/errors'
import { errorCodeStatus } from '@/lib/api/error-catalog'
import { dateOnlySchema } from '@/lib/api/validation'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { endOfBangkokDay, startOfBangkokDay } from '@/lib/format/datetime'
import type { Prisma } from '@/lib/generated/prisma/client'
import { HandoverLotStatus, type HandoverType } from '@/lib/generated/prisma/enums'
import { portalViewAsAuditFields, rejectPortalRow, requirePortalRow, type PortalContext } from '@/lib/portal/guard'
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
import { renderHandoverNote } from '@/components/pdf/handover-note'
import { handoverLetterhead } from '@/lib/organization/letterhead'
import { downloadUploadedFile } from '@/lib/uploads/storage'
import { buildHandoverDoc, handoverFileName } from '@/lib/warehouse/handover-doc'
import { documentExtension, lotDocumentMime } from '@/lib/warehouse/lot-documents'
import { getHandoverDocSourceForCompany } from '@/lib/warehouse/queries'

/**
 * ชั้น query ของหมวด "ส่งมอบทรัพย์" ในพอร์ทัลบริษัทไฟแนนซ์ (`97` §6.4 · §10.2 · §17 · มติ PO 05/10/2569 O43 D6/D8 · O44)
 *
 * - **list**: กรอง `company_id = ctx.companyId` ในทุก query (`97` §11) — ไม่มีทางส่ง companyId จาก query string
 * - **detail/download**: ดึงแถวด้วย id **โดยไม่กรองบริษัท** แล้วส่งให้ `requirePortalRow()` ตัดสิน ⇒ id สุ่ม/ข้ามบริษัท
 *   ได้ 403 `PERMISSION_DENIED` แบบเดียวกัน + audit `access_denied` (D3/D4)
 * - **ไม่ select IMEI/serial ของทรัพย์เลย** (O44) — DTO ของ serializer ไม่มีช่องนี้อยู่แล้ว แต่ไม่ดึงขึ้นมาตั้งแต่ต้น
 * - **ดาวน์โหลด** = ใบส่งมอบที่มีลายเซ็นผู้รับ (`handover_lots.signed_doc_url`) เฉพาะล็อต `confirmed` (D8 — เป็นเอกสาร
 *   ของบริษัทเอง แม้มี IMEI) · ไฟล์ถูกอ่านด้วย service role แล้ว stream ผ่าน server (DEC-014 — ไม่ส่ง URL ของ bucket ออกไป)
 * - **ใบส่งมอบ PDF จากระบบ** (มติ U13) — renderer เดียวกับภายใน ดาวน์โหลดได้ตั้งแต่สร้างล็อต (มี IMEI — เอกสารของบริษัทเอง)
 * - **หลักฐานการจัดส่ง** (มติ U13) — เฉพาะล็อตแบบเราส่ง (`we_deliver`) ที่แนบหลักฐานแล้ว · stream ผ่าน server
 * - ดาวน์โหลดสำเร็จทุกชนิดลง audit `export` (`after.document` = `signed_doc` / `delivery_note` / `delivery_proof`)
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
  // ใช้ตัดสินว่ามีหลักฐานการจัดส่งหรือไม่เท่านั้น — serializer ไม่ส่ง path ออกไป
  deliveryProofUrl: true,
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
  const { deliveryProofUrl, ...lot } = await requirePortalRow(ctx, row, { type: PORTAL_LOT_TARGET, id: lotId }, { request })
  const assets = await prisma.asset.findMany({
    where: { lotId: lot.id, organizationId: ctx.user.organizationId, companyId: ctx.companyId, deletedAt: null },
    select: lotAssetSelect,
    orderBy: [{ caseRef: 'asc' }, { id: 'asc' }],
  })
  return serializePortalLotDetail({ ...lot, hasDeliveryProof: hasDeliveryProof(lot.type, deliveryProofUrl), assets })
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

  await auditLotExport(ctx, lot, 'signed_doc', request)

  return {
    bytes,
    contentType: lotDocumentMime(path),
    fileName: `${lot.docRef}-signed.${documentExtension(path)}`,
  }
}

type PortalLotDocument = 'signed_doc' | 'delivery_note' | 'delivery_proof'

/** ร่องรอยการนำเอกสารล็อตออกทางพอร์ทัล (Rule 03) */
async function auditLotExport(
  ctx: PortalContext,
  lot: { id: string; lotNumber: string },
  document: PortalLotDocument,
  request: Request | undefined,
): Promise<void> {
  const meta = request ? getRequestMeta(request) : { ipAddress: null, userAgent: null }
  await emitAudit({
    organizationId: ctx.user.organizationId,
    actorId: ctx.user.id,
    actorRole: ctx.user.roleName,
    action: 'export',
    targetType: PORTAL_LOT_TARGET,
    targetId: lot.id,
    after: { channel: 'portal', document, company_id: ctx.companyId, lot_number: lot.lotNumber, ...portalViewAsAuditFields(ctx) },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  })
}

/** ล็อตแบบเราส่ง (`we_deliver`) ที่แนบหลักฐานการจัดส่งแล้ว (ล็อตที่บริษัทมารับเองไม่มีหลักฐานชนิดนี้) */
export function hasDeliveryProof(type: HandoverType, deliveryProofUrl: string | null): boolean {
  return type === 'we_deliver' && (deliveryProofUrl ?? '').trim() !== ''
}

/**
 * ใบส่งมอบ PDF จากระบบ (มติ PO 05/10/2569 U13 · `97` §18) — renderer + template เดียวกับ `GET /api/handover-lots/:id/pdf`
 * ภายใน (เอกสารเหมือนกันทุกตัวอักษร มี IMEI) · ดาวน์โหลดได้ตั้งแต่สร้างล็อต (ไม่ต้องรอ `confirmed`)
 * - ไม่พบ/ข้ามบริษัท → 403 + audit (`requirePortalRow`) · สำเร็จ → audit `export`
 */
export async function getPortalLotDeliveryNote(
  ctx: PortalContext,
  lotId: string,
  request?: Request,
): Promise<PortalLotFile> {
  const where = lotByIdWhere(ctx, lotId)
  const row =
    where === null
      ? null
      : await prisma.handoverLot.findFirst({ where, select: { id: true, companyId: true, lotNumber: true } })
  const lot = await requirePortalRow(ctx, row, { type: PORTAL_LOT_TARGET, id: lotId }, { request, download: true })

  const source = await getHandoverDocSourceForCompany(ctx.user.organizationId, ctx.companyId, lot.id)
  const pdf = await renderHandoverNote(
    buildHandoverDoc(source.lot, source.issuer, source.recipient),
    await handoverLetterhead(ctx.user.organizationId, source.letterheadSnapshot),
  )
  await auditLotExport(ctx, lot, 'delivery_note', request)

  return { bytes: new Uint8Array(pdf), contentType: 'application/pdf', fileName: handoverFileName(source.lot, 'pdf') }
}

/** ล็อตเราส่งที่ยังไม่มีไฟล์หลักฐานการจัดส่งให้อ่าน — ข้อความสำหรับฝั่งบริษัท */
function missingDeliveryProof(detail: string): ModuleError<'LOT_MISSING_DELIVERY_PROOF'> {
  return new ModuleError(
    'LOT_MISSING_DELIVERY_PROOF',
    {
      title: 'ยังไม่มีหลักฐานการจัดส่ง',
      message: 'ล็อตนี้ยังไม่มีหลักฐานการจัดส่ง กรุณาติดต่อผู้ให้บริการ',
    },
    errorCodeStatus('LOT_MISSING_DELIVERY_PROOF'),
    { detail },
  )
}

/**
 * หลักฐานการจัดส่ง (มติ PO 05/10/2569 U13) — เฉพาะล็อตแบบเราส่ง (`we_deliver`) · ไฟล์ stream ผ่าน server
 * - ไม่พบ/ข้ามบริษัท → 403 + audit · ล็อตที่บริษัทมารับเอง → 403 + audit (`cause = not_we_deliver`)
 * - เราส่งแต่ยังไม่แนบ/ไฟล์หายจาก Storage → `LOT_MISSING_DELIVERY_PROOF` · สำเร็จ → audit `export`
 */
export async function getPortalLotDeliveryProof(
  ctx: PortalContext,
  lotId: string,
  request?: Request,
): Promise<PortalLotFile> {
  const target = { type: PORTAL_LOT_TARGET, id: lotId }
  const where = lotByIdWhere(ctx, lotId)
  const row =
    where === null
      ? null
      : await prisma.handoverLot.findFirst({
          where,
          select: { id: true, companyId: true, lotNumber: true, docRef: true, type: true, deliveryProofUrl: true },
        })
  const lot = await requirePortalRow(ctx, row, target, { request, download: true })
  if (lot.type !== 'we_deliver') {
    return rejectPortalRow(ctx, target, `not_we_deliver:${lot.type}`, { request, download: true })
  }

  const path = (lot.deliveryProofUrl ?? '').trim()
  if (path === '') throw missingDeliveryProof(`lot=${lot.id} delivery_proof_url empty`)
  const bytes = await downloadUploadedFile(path)
  if (bytes === null) throw missingDeliveryProof(`lot=${lot.id} storage object missing`)
  await auditLotExport(ctx, lot, 'delivery_proof', request)

  return {
    bytes,
    contentType: lotDocumentMime(path),
    fileName: `${lot.docRef}-delivery-proof.${documentExtension(path)}`,
  }
}
