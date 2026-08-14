import type { Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { emitAudit } from '@/lib/audit/audit'
import type { ApiWarning } from '@/lib/api/envelope'
import type { RequestMeta } from '@/lib/auth/request-meta'
import type { SessionUser } from '@/lib/auth/types'
import { nextAssetStatus, isIntakeRetry } from '@/lib/warehouse/asset-status'
import type { WarehouseTxClient } from '@/lib/warehouse/asset-hook'
import { WarehouseError } from '@/lib/warehouse/errors'
import type { HandoverParty } from '@/lib/warehouse/handover-doc'
import { compareAssetIdentity } from '@/lib/warehouse/imei'
import { assertIntakeCondition, assertRejectReason, imeiMismatchWarning } from '@/lib/warehouse/intake'
import { assertLotAssets } from '@/lib/warehouse/lot-assets'
import { assertLotConfirmDocuments, assertLotMutable, initialLotStatus, lotTab } from '@/lib/warehouse/lot-status'
import { DELIVERY_DOC_PREFIX, LOT_PREFIX, handoverNumberYear } from '@/lib/warehouse/numbering'
import { tryCreateRevenue } from '@/lib/warehouse/revenue-service'
import type { AssetIntakeInput, AssetListQuery, LotConfirmInput, LotCreateInput, LotListQuery } from '@/lib/warehouse/schemas'
import type {
  AssetDetailDto,
  AssetListDto,
  AssetListItemDto,
  LotConfirmResultDto,
  LotDetailDto,
  LotListDto,
  LotSummaryDto,
} from '@/lib/warehouse/types'

/**
 * ชั้น query ของโมดูลคลัง (`44` §15) — permission ระดับ capability ถูกตรวจที่ `withEndpoint()` แล้ว
 * ที่นี่บังคับ **scope ระดับแถว** เพิ่มเสมอ (`44` §13 — Company User เห็นเฉพาะบริษัทตัวเอง)
 */

export interface WarehouseMutationContext {
  actor: SessionUser
  meta: RequestMeta
}

// ── scope ระดับแถว (`44` §13 · `05` §5) ─────────────────────────────────────

/**
 * ผู้ใช้คนนี้เห็น asset แถวไหนบ้าง
 * - `global` (ธุรการ/ผู้บริหาร/การเงิน/บัญชี) เห็นทุกแถวใน organization
 * - `team` (ผู้จัดการ/หัวหน้าทีม) เห็นเครื่องที่มาจากเคสของทีมตัวเอง
 * - `company` (Company User ไฟล์ 10) เห็นเฉพาะบริษัทตัวเอง — T15 ต้อง 403/ไม่เห็นแถว
 * - `self` (Field Agent) เห็นเครื่องที่มาจากเคสที่ตัวเองถือ
 */
export function assetScopeWhere(user: SessionUser): Prisma.AssetWhereInput {
  const scope = user.scope
  switch (scope.kind) {
    case 'global':
      return {}
    case 'team':
      return scope.teamIds.length === 0 ? { id: { in: [] } } : { case: { assignedTeamId: { in: [...scope.teamIds] } } }
    case 'company':
      return scope.companyId === null ? { id: { in: [] } } : { companyId: scope.companyId }
    case 'self':
      return { case: { assignments: { some: { agentId: scope.userId } } } }
  }
}

/** ล็อตผูกกับบริษัทตรง ๆ — ทีม/พนักงานมองผ่านเครื่องที่อยู่ในล็อต */
export function lotScopeWhere(user: SessionUser): Prisma.HandoverLotWhereInput {
  const scope = user.scope
  switch (scope.kind) {
    case 'global':
      return {}
    case 'team':
      return scope.teamIds.length === 0
        ? { id: { in: [] } }
        : { assets: { some: { case: { assignedTeamId: { in: [...scope.teamIds] } } } } }
    case 'company':
      return scope.companyId === null ? { id: { in: [] } } : { companyId: scope.companyId }
    case 'self':
      return { assets: { some: { case: { assignments: { some: { agentId: scope.userId } } } } } }
  }
}

// ── select / mapper ─────────────────────────────────────────────────────────

const assetSelect = {
  id: true,
  caseId: true,
  caseRef: true,
  debtorName: true,
  deviceDesc: true,
  imeiContract: true,
  imeiActual: true,
  serialContract: true,
  serialActual: true,
  assetStatus: true,
  condition: true,
  conditionNote: true,
  companyId: true,
  photos: true,
  closedAt: true,
  receivedAt: true,
  rejectReason: true,
  rejectedAt: true,
  lotId: true,
  company: { select: { name: true } },
  lot: { select: { lotNumber: true } },
  rejectedByUser: { select: { fullName: true } },
  case: {
    select: {
      assignedTeamId: true,
      assignedTeam: { select: { name: true } },
      assignments: {
        // คนที่ถูกโอนงานออกไปแล้วไม่ใช่ผู้รับผิดชอบเครื่องนี้ (`40` §6.1.1)
        where: { status: { not: 'reassigned_away' } },
        orderBy: { createdAt: 'desc' as const },
        take: 1,
        select: { agentId: true, agent: { select: { fullName: true } } },
      },
    },
  },
} as const

type AssetRow = Prisma.AssetGetPayload<{ select: typeof assetSelect }>

function toAssetListItem(row: AssetRow): AssetListItemDto {
  const assignment = row.case.assignments[0] ?? null
  return {
    id: row.id,
    caseId: row.caseId,
    caseRef: row.caseRef,
    debtorName: row.debtorName,
    deviceDesc: row.deviceDesc,
    imeiContract: row.imeiContract,
    imeiActual: row.imeiActual,
    serialContract: row.serialContract,
    serialActual: row.serialActual,
    assetStatus: row.assetStatus,
    condition: row.condition,
    conditionNote: row.conditionNote,
    companyId: row.companyId,
    companyName: row.company.name,
    teamId: row.case.assignedTeamId,
    teamName: row.case.assignedTeam?.name ?? null,
    agentId: assignment?.agentId ?? null,
    agentName: assignment?.agent.fullName ?? null,
    closedAt: row.closedAt.toISOString(),
    receivedAt: row.receivedAt?.toISOString() ?? null,
    rejectReason: row.rejectReason,
    rejectedAt: row.rejectedAt?.toISOString() ?? null,
    lotId: row.lotId,
    lotNumber: row.lot?.lotNumber ?? null,
    photoCount: row.photos.length,
  }
}

function toAssetDetail(row: AssetRow, lot: LotSummaryDto | null): AssetDetailDto {
  return {
    ...toAssetListItem(row),
    photos: row.photos,
    lot,
    rejectedByName: row.rejectedByUser?.fullName ?? null,
  }
}

const lotSelect = {
  id: true,
  lotNumber: true,
  docRef: true,
  type: true,
  status: true,
  companyId: true,
  scheduledAt: true,
  deliveredAt: true,
  confirmedAt: true,
  contactPerson: true,
  deliveryAddr: true,
  trackingNo: true,
  signedDocUrl: true,
  deliveryProofUrl: true,
  note: true,
  createdAt: true,
  company: { select: { name: true } },
  confirmedByUser: { select: { fullName: true } },
  _count: { select: { assets: { where: { deletedAt: null } } } },
} as const

type LotRow = Prisma.HandoverLotGetPayload<{ select: typeof lotSelect }>

function toLotSummary(row: LotRow): LotSummaryDto {
  return {
    id: row.id,
    lotNumber: row.lotNumber,
    docRef: row.docRef,
    type: row.type,
    status: row.status,
    companyId: row.companyId,
    companyName: row.company.name,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    assetCount: row._count.assets,
    tab: lotTab(row.status),
  }
}

function toLotDetail(row: LotRow, assets: readonly AssetListItemDto[]): LotDetailDto {
  return {
    ...toLotSummary(row),
    contactPerson: row.contactPerson,
    deliveryAddr: row.deliveryAddr,
    trackingNo: row.trackingNo,
    signedDocUrl: row.signedDocUrl,
    deliveryProofUrl: row.deliveryProofUrl,
    note: row.note,
    confirmedByName: row.confirmedByUser?.fullName ?? null,
    createdAt: row.createdAt.toISOString(),
    assets,
  }
}

// ── GET /api/assets (`44` §15) ──────────────────────────────────────────────

export async function listAssets(user: SessionUser, query: AssetListQuery): Promise<AssetListDto> {
  const where: Prisma.AssetWhereInput = {
    organizationId: user.organizationId,
    deletedAt: null,
    ...assetScopeWhere(user),
    ...(query.status === undefined ? {} : { assetStatus: { in: query.status } }),
    ...(query.companyId === undefined ? {} : { companyId: query.companyId }),
    ...(query.condition === undefined ? {} : { condition: query.condition }),
    ...(query.teamId === undefined && query.agentId === undefined
      ? {}
      : {
          case: {
            ...(query.teamId === undefined ? {} : { assignedTeamId: query.teamId }),
            ...(query.agentId === undefined ? {} : { assignments: { some: { agentId: query.agentId } } }),
          },
        }),
    ...(query.dateFrom === undefined && query.dateTo === undefined
      ? {}
      : {
          closedAt: {
            ...(query.dateFrom === undefined ? {} : { gte: new Date(`${query.dateFrom}T00:00:00.000Z`) }),
            // ปลายช่วงเป็น "ทั้งวัน" — บวก 1 วันแล้วใช้ `lt` กันเคสที่ปิดตอนบ่ายหลุดออกจากผลลัพธ์
            ...(query.dateTo === undefined ? {} : { lt: nextDayUtc(query.dateTo) }),
          },
        }),
    ...(query.search === undefined
      ? {}
      : {
          OR: [
            { caseRef: { contains: query.search, mode: 'insensitive' } },
            { debtorName: { contains: query.search, mode: 'insensitive' } },
            // IMEI ค้นแบบ exact เท่านั้น (`44` §6.5 — ห้าม fuzzy)
            { imeiContract: query.search },
            { imeiActual: query.search },
          ],
        }),
  }

  const [rows, total] = await Promise.all([
    prisma.asset.findMany({
      where,
      select: assetSelect,
      orderBy: [{ closedAt: 'desc' }, { createdAt: 'desc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.asset.count({ where }),
  ])

  return { items: rows.map(toAssetListItem), total, page: query.page, limit: query.limit }
}

function nextDayUtc(date: string): Date {
  const parsed = new Date(`${date}T00:00:00.000Z`)
  parsed.setUTCDate(parsed.getUTCDate() + 1)
  return parsed
}

/** โหลด asset ภายใน scope — ไม่พบ/ไม่มีสิทธิ์เห็น = `ASSET_NOT_FOUND` เหมือนกัน (ไม่ leak `44` §13) */
async function loadAsset(user: SessionUser, assetId: string): Promise<AssetRow> {
  const row = await prisma.asset.findFirst({
    where: { id: assetId, organizationId: user.organizationId, deletedAt: null, ...assetScopeWhere(user) },
    select: assetSelect,
  })
  if (row === null) throw new WarehouseError('ASSET_NOT_FOUND')
  return row
}

export async function getAsset(user: SessionUser, assetId: string): Promise<AssetDetailDto> {
  const row = await loadAsset(user, assetId)
  if (row.lotId === null) return toAssetDetail(row, null)
  const lot = await prisma.handoverLot.findUnique({ where: { id: row.lotId }, select: lotSelect })
  return toAssetDetail(row, lot === null ? null : toLotSummary(lot))
}

// ── POST /api/assets/:id/intake (`44` §8.2 · §9.1) ──────────────────────────

export interface AssetIntakeOutcome {
  asset: AssetDetailDto
  warning?: ApiWarning
  events: readonly string[]
}

/**
 * ธุรการยืนยันรับเครื่องเข้าคลัง
 *
 * - IMEI ไม่ตรง = **เตือน ไม่ block** (`44` §12) — บันทึกค่าที่ตรวจจริงไว้เสมอเพื่อให้ตามสอบได้
 * - `intake_rejected` กด "รับใหม่" ได้ (`44` §9.1 retry) — ลง event `asset.intake_retry` เพิ่ม
 *   และล้างข้อมูลการตีกลับรอบก่อนออก เพราะเครื่องกลับเข้าคลังแล้ว
 */
export async function intakeAsset(
  user: SessionUser,
  assetId: string,
  input: AssetIntakeInput,
  context: WarehouseMutationContext,
): Promise<AssetIntakeOutcome> {
  const current = await loadAsset(user, assetId)
  const nextStatus = nextAssetStatus(current.assetStatus, 'intake')
  assertIntakeCondition({ condition: input.condition, conditionNote: input.conditionNote })

  const comparison = compareAssetIdentity(
    { imeiContract: current.imeiContract, serialContract: current.serialContract },
    { imeiActual: input.imeiActual, serialActual: input.serialActual },
  )
  const retry = isIntakeRetry(current.assetStatus)
  const receivedAt = new Date()

  const updated = await prisma.$transaction(async (tx) => {
    // ยึดสถานะเดิมไว้ก่อนเขียน — กันธุรการสองคนกดรับเครื่องเดียวกันพร้อมกัน
    const claimed = await tx.asset.updateMany({
      where: { id: assetId, assetStatus: current.assetStatus },
      data: {
        assetStatus: nextStatus,
        imeiActual: input.imeiActual,
        serialActual: input.serialActual,
        condition: input.condition,
        conditionNote: input.conditionNote,
        photos: input.photos,
        receivedAt,
        rejectReason: null,
        rejectedAt: null,
        rejectedBy: null,
        updatedBy: context.actor.id,
      },
    })
    if (claimed.count === 0) throw new WarehouseError('ASSET_INVALID_STATUS')

    await emitAudit(
      {
        organizationId: user.organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'status_change',
        targetType: 'assets',
        targetId: assetId,
        before: { assetStatus: current.assetStatus },
        after: {
          assetStatus: nextStatus,
          imeiActual: input.imeiActual,
          serialActual: input.serialActual,
          imeiMatch: comparison.matched,
          condition: input.condition,
          photosCount: input.photos.length,
          receivedAt,
          events: retry ? ['asset.intake_retry', 'asset.intake'] : ['asset.intake'],
        },
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx as WarehouseTxClient,
    )

    return tx.asset.findUniqueOrThrow({ where: { id: assetId }, select: assetSelect })
  })

  const warning = imeiMismatchWarning(comparison)
  return {
    asset: toAssetDetail(updated, null),
    ...(warning === undefined ? {} : { warning }),
    events: retry ? ['asset.intake_retry', 'asset.intake_confirmed'] : ['asset.intake_confirmed'],
  }
}

// ── POST /api/assets/:id/reject-intake (`44` §8.2) ──────────────────────────

export async function rejectAssetIntake(
  user: SessionUser,
  assetId: string,
  input: { rejectReason: string },
  context: WarehouseMutationContext,
): Promise<AssetDetailDto> {
  const current = await loadAsset(user, assetId)
  const nextStatus = nextAssetStatus(current.assetStatus, 'reject_intake')
  const reason = assertRejectReason(input.rejectReason)
  const rejectedAt = new Date()

  return prisma.$transaction(async (tx) => {
    const claimed = await tx.asset.updateMany({
      where: { id: assetId, assetStatus: current.assetStatus },
      data: {
        assetStatus: nextStatus,
        rejectReason: reason,
        rejectedAt,
        rejectedBy: context.actor.id,
        updatedBy: context.actor.id,
      },
    })
    if (claimed.count === 0) throw new WarehouseError('ASSET_INVALID_STATUS')

    await emitAudit(
      {
        organizationId: user.organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        // action `reject` ⇒ นโยบาย audit บังคับ `reason` อยู่แล้ว (`90` §13)
        action: 'reject',
        targetType: 'assets',
        targetId: assetId,
        before: { assetStatus: current.assetStatus },
        after: {
          assetStatus: nextStatus,
          imeiContract: current.imeiContract,
          imeiActual: current.imeiActual,
          rejectedAt,
          events: ['asset.intake_rejected'],
        },
        reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx as WarehouseTxClient,
    )

    const updated = await tx.asset.findUniqueOrThrow({ where: { id: assetId }, select: assetSelect })
    return toAssetDetail(updated, null)
  })
}

// ── GET /api/handover-lots (`44` §15) ───────────────────────────────────────

export async function listLots(user: SessionUser, query: LotListQuery): Promise<LotListDto> {
  const where: Prisma.HandoverLotWhereInput = {
    organizationId: user.organizationId,
    deletedAt: null,
    ...lotScopeWhere(user),
    ...(query.status === undefined ? {} : { status: { in: query.status } }),
    ...(query.companyId === undefined ? {} : { companyId: query.companyId }),
    ...(query.type === undefined ? {} : { type: query.type }),
    ...(query.dateFrom === undefined && query.dateTo === undefined
      ? {}
      : {
          scheduledAt: {
            ...(query.dateFrom === undefined ? {} : { gte: new Date(`${query.dateFrom}T00:00:00.000Z`) }),
            ...(query.dateTo === undefined ? {} : { lt: nextDayUtc(query.dateTo) }),
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
      select: lotSelect,
      orderBy: [{ createdAt: 'desc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.handoverLot.count({ where }),
  ])

  return { items: rows.map(toLotSummary), total, page: query.page, limit: query.limit }
}

async function loadLot(user: SessionUser, lotId: string): Promise<LotRow> {
  const row = await prisma.handoverLot.findFirst({
    where: { id: lotId, organizationId: user.organizationId, deletedAt: null, ...lotScopeWhere(user) },
    select: lotSelect,
  })
  if (row === null) throw new WarehouseError('LOT_NOT_FOUND')
  return row
}

export async function getLot(user: SessionUser, lotId: string): Promise<LotDetailDto> {
  const row = await loadLot(user, lotId)
  const assets = await prisma.asset.findMany({
    where: { lotId, deletedAt: null },
    select: assetSelect,
    orderBy: [{ caseRef: 'asc' }],
  })
  return toLotDetail(row, assets.map(toAssetListItem))
}

// ── POST /api/handover-lots (`44` §6.2 · §9.2) ──────────────────────────────

/**
 * เดินเลขล็อต/ใบส่งมอบผ่าน SQL function (`next_handover_number`) — **ห้ามอ่าน MAX() มาบวกเอง**
 * `nextval()` ไม่ถูก rollback ⇒ ต่อให้ทรานแซกชันล้ม เลขก็ไม่ถูกใช้ซ้ำ (`44` §10 "ไม่ recycle")
 */
async function nextHandoverNumbers(tx: WarehouseTxClient, at: Date): Promise<{ lotNumber: string; docRef: string }> {
  const beYear = handoverNumberYear(at)
  const [lotRow] = await tx.$queryRaw<{ value: string }[]>`
    SELECT next_handover_number(${LOT_PREFIX}, ${beYear}::int) AS value`
  const [docRow] = await tx.$queryRaw<{ value: string }[]>`
    SELECT next_handover_number(${DELIVERY_DOC_PREFIX}, ${beYear}::int) AS value`
  if (lotRow === undefined || docRow === undefined) {
    throw new Error('next_handover_number ไม่คืนค่า — migration ของเลขเอกสารยังไม่ถูก apply?')
  }
  return { lotNumber: lotRow.value, docRef: docRow.value }
}

export async function createLot(
  user: SessionUser,
  input: LotCreateInput,
  context: WarehouseMutationContext,
): Promise<LotDetailDto> {
  const createdAt = new Date()

  const lotId = await prisma.$transaction(async (tx) => {
    // อ่านเครื่องที่เลือกภายใน scope ของผู้เรียก แล้วตรวจกติกาทั้ง 5 ข้อของ `44` §10
    const candidates = await tx.asset.findMany({
      where: {
        id: { in: [...input.assetIds] },
        organizationId: user.organizationId,
        deletedAt: null,
        ...assetScopeWhere(user),
      },
      select: { id: true, companyId: true, assetStatus: true, lotId: true, lot: { select: { lotNumber: true } } },
    })

    assertLotAssets({
      requestedIds: input.assetIds,
      companyId: input.companyId,
      assets: candidates.map((asset) => ({
        id: asset.id,
        companyId: asset.companyId,
        assetStatus: asset.assetStatus,
        lotId: asset.lotId,
        lotNumber: asset.lot?.lotNumber ?? null,
      })),
    })

    const { lotNumber, docRef } = await nextHandoverNumbers(tx, createdAt)
    const status = initialLotStatus(input.type)

    const lot = await tx.handoverLot.create({
      data: {
        organizationId: user.organizationId,
        companyId: input.companyId,
        lotNumber,
        docRef,
        type: input.type,
        status,
        scheduledAt: input.scheduledAt === null ? null : new Date(input.scheduledAt),
        contactPerson: input.contactPerson,
        deliveryAddr: input.deliveryAddr,
        trackingNo: input.trackingNo,
        note: input.note,
        createdBy: context.actor.id,
      },
      select: { id: true },
    })

    // ผูกเครื่องเข้าล็อต + เลื่อนสถานะพร้อมกัน — `assetStatus` เดิมต้องยังเป็น `in_custody`
    // (กันสองคนสร้างล็อตจากเครื่องชุดเดียวกันพร้อมกัน — คนที่มาทีหลังจะได้ 0 แถว)
    const attached = await tx.asset.updateMany({
      where: { id: { in: [...input.assetIds] }, assetStatus: 'in_custody', lotId: null },
      data: { lotId: lot.id, assetStatus: 'handover_pending', updatedBy: context.actor.id },
    })
    if (attached.count !== input.assetIds.length) throw new WarehouseError('ASSET_ALREADY_IN_LOT')

    await emitAudit(
      {
        organizationId: user.organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'create',
        targetType: 'handover_lots',
        targetId: lot.id,
        after: {
          lotNumber,
          docRef,
          type: input.type,
          status,
          companyId: input.companyId,
          assetIds: input.assetIds,
          scheduledAt: input.scheduledAt,
          events: ['lot.created'],
        },
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx as WarehouseTxClient,
    )

    return lot.id
  })

  return getLot(user, lotId)
}

// ── PATCH /api/handover-lots/:id/confirm (`44` §11) ─────────────────────────

/**
 * ## ยืนยันส่งมอบ = `$transaction` 4 ขั้น (`44` §11) — fail ข้อใด rollback ทั้งหมด
 *
 * ```
 * Step 1: assets ของล็อต        → `handed_over`
 * Step 2: expenses ของเคชในล็อต → `pending_warehouse_confirm` → `pending_approval`  (ปลดล็อก)
 * Step 3: audit `lot.confirmed` (พร้อม expense_ids_unlocked / revenue_ids_created)
 * Step 4: RevenueService.tryCreateRevenue()  (`19` §6.1 — Warehouse gate)
 * ```
 *
 * ⚠️ ลำดับ 1→2→4 ห้ามสลับ: step 4 ต้องเห็นผลของ step 1 (asset `handed_over` = ผ่านคลังแล้ว)
 *    และ step 2 (expense ที่เพิ่งปลดล็อก) ไม่งั้นเกตของ `19` §6.1 จะอ่านสถานะเก่า
 * ⚠️ error ที่หลุดออกจากทรานแซกชันถูกห่อเป็น `CONFIRM_TRANSACTION_FAILED` (`44` §12) ยกเว้น
 *    `WarehouseError` ของกติกาที่ผู้ใช้แก้เองได้ (เอกสารไม่ครบ/ล็อตยืนยันแล้ว) ซึ่งต้องบอกตรง ๆ
 */
export async function confirmLot(
  user: SessionUser,
  lotId: string,
  input: LotConfirmInput,
  context: WarehouseMutationContext,
): Promise<LotConfirmResultDto> {
  const current = await loadLot(user, lotId)
  assertLotMutable(current.status)

  // เอกสารที่ใช้ยืนยัน = ที่แนบมาในคำขอนี้ ถ้าไม่ส่งมาให้ใช้ที่แนบไว้ก่อนหน้า (`44` §15)
  const signedDocUrl = input.signedDocUrl ?? current.signedDocUrl
  const deliveryProofUrl = input.deliveryProofUrl ?? current.deliveryProofUrl
  assertLotConfirmDocuments(current.type, { signedDocUrl, deliveryProofUrl })

  const confirmedAt = new Date()
  const deliveredAt = input.deliveredAt === null ? confirmedAt : new Date(input.deliveredAt)

  let result: {
    assetIds: string[]
    caseIds: string[]
    expenseIdsUnlocked: string[]
    revenueIdsCreated: readonly string[]
    revenueEligibleCaseIds: readonly string[]
  }

  try {
    result = await prisma.$transaction(async (tx) => {
      // ยึดล็อตด้วยสถานะเดิม — กันสองคนกดยืนยันพร้อมกัน (คนที่สองได้ 0 แถว)
      const claimed = await tx.handoverLot.updateMany({
        where: { id: lotId, status: current.status },
        data: {
          status: 'confirmed',
          confirmedAt,
          confirmedBy: context.actor.id,
          deliveredAt,
          signedDocUrl,
          deliveryProofUrl,
          updatedBy: context.actor.id,
        },
      })
      if (claimed.count === 0) throw new WarehouseError('LOT_ALREADY_CONFIRMED')

      const assets = await tx.asset.findMany({
        where: { lotId, deletedAt: null },
        select: { id: true, caseId: true },
      })
      const assetIds = assets.map((asset) => asset.id)
      const caseIds = [...new Set(assets.map((asset) => asset.caseId))]

      // ── Step 1: assets → handed_over ──────────────────────────────────────
      await tx.asset.updateMany({
        where: { lotId, deletedAt: null },
        data: { assetStatus: 'handed_over', updatedBy: context.actor.id },
      })

      // ── Step 2: ปลดล็อก expenses ของเคสในล็อต (`41` §6.6) ─────────────────
      const lockedExpenses = await tx.expense.findMany({
        where: { caseId: { in: caseIds }, status: 'pending_warehouse_confirm', deletedAt: null },
        select: { id: true },
      })
      const expenseIdsUnlocked = lockedExpenses.map((expense) => expense.id)
      if (expenseIdsUnlocked.length > 0) {
        await tx.expense.updateMany({
          where: { id: { in: expenseIdsUnlocked } },
          data: { status: 'pending_approval', updatedBy: context.actor.id },
        })
      }

      // ── Step 4 (คำนวณก่อนลง audit เพื่อให้ audit เก็บผลได้ครบใน entry เดียว) ──
      const revenue = await tryCreateRevenue(tx as WarehouseTxClient, {
        organizationId: user.organizationId,
        caseIds,
        actorId: context.actor.id,
      })

      // ── Step 3: audit `lot.confirmed` (`44` §14) ─────────────────────────
      await emitAudit(
        {
          organizationId: user.organizationId,
          actorId: context.actor.id,
          actorRole: context.actor.roleName,
          action: 'confirm',
          targetType: 'handover_lots',
          targetId: lotId,
          before: { status: current.status },
          after: {
            status: 'confirmed',
            confirmedAt,
            deliveredAt,
            signedDocUrl,
            deliveryProofUrl,
            assetIdsHandedOver: assetIds,
            expenseIdsUnlocked,
            revenueIdsCreated: revenue.revenueIdsCreated,
            revenueEligibleCaseIds: revenue.eligibleCaseIds,
            events: ['lot.doc_attached', 'lot.confirmed'],
          },
          ipAddress: context.meta.ipAddress,
          userAgent: context.meta.userAgent,
          diffOnly: false,
        },
        tx as WarehouseTxClient,
      )

      return {
        assetIds,
        caseIds,
        expenseIdsUnlocked,
        revenueIdsCreated: revenue.revenueIdsCreated,
        revenueEligibleCaseIds: revenue.eligibleCaseIds,
      }
    })
  } catch (error) {
    // กติกาที่ผู้ใช้แก้เองได้ต้องบอกตรง ๆ ไม่ให้กลายเป็น 500 (`44` §12)
    if (error instanceof WarehouseError) throw error
    throw new WarehouseError('CONFIRM_TRANSACTION_FAILED', {
      detail: error instanceof Error ? error.message : String(error),
    })
  }

  const lot = await getLot(user, lotId)
  return {
    lot,
    assetIdsHandedOver: result.assetIds,
    expenseIdsUnlocked: result.expenseIdsUnlocked,
    revenueIdsCreated: result.revenueIdsCreated,
    revenueEligibleCaseIds: result.revenueEligibleCaseIds,
    events: ['lot.doc_attached', 'lot.confirmed'],
  }
}

// ── เอกสารของล็อต: ใบส่งมอบ PDF + Export Excel (`44` §6.4 · §15) ────────────

export interface HandoverDocSource {
  lot: LotDetailDto
  /** ผู้ส่งมอบ = องค์กรเจ้าของระบบ */
  issuer: HandoverParty
  /** ผู้รับมอบ = บริษัทไฟแนนซ์เจ้าของล็อต (1 ล็อต = 1 บริษัทเสมอ · §6.2) */
  recipient: HandoverParty
}

/**
 * ข้อมูลดิบของล็อตสำหรับออกเอกสาร — ใช้ scope เดียวกับ `getLot()` (ล็อตนอก scope = `LOT_NOT_FOUND`)
 * ที่อยู่/เลขผู้เสียภาษีของสองฝ่ายอ่าน ณ เวลาออกเอกสาร (ไม่ใช่ snapshot — ใบส่งมอบไม่ใช่เอกสารการเงิน
 * ที่ต้องตรึงค่า ต่างจาก `92` §7.1 ที่บังคับ snapshot เฉพาะเอกสารที่กระทบเงิน/ภาษี)
 */
export async function getHandoverDocSource(user: SessionUser, lotId: string): Promise<HandoverDocSource> {
  const lot = await getLot(user, lotId)
  const [organization, company] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      where: { id: user.organizationId },
      select: { name: true, address: true, taxId: true, phone: true },
    }),
    prisma.financeCompany.findUniqueOrThrow({
      where: { id: lot.companyId },
      select: { name: true, address: true, taxId: true, phone: true },
    }),
  ])

  return {
    lot,
    issuer: organization,
    recipient: company,
  }
}
