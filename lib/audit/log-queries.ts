import { AuthError } from '@/lib/auth/errors'
import type { SessionUser } from '@/lib/auth/types'
import type { AuditLogListQuery } from '@/lib/audit/log-schemas'
import type { AuditLogDetailDto, AuditLogListDto, AuditLogListItemDto } from '@/lib/audit/log-types'
import type { Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'

/**
 * ชั้นข้อมูลของ **บันทึกการใช้งาน (Audit Log)** — `90` §8/§12/§14 · Phase 5.2
 *
 * กติกาที่บังคับที่นี่:
 * - **อ่านอย่างเดียวเสมอ** ไม่มีฟังก์ชันเขียน/แก้/ลบในไฟล์นี้ (audit immutable — `02` §13)
 *   การเขียนมีทางเดียวคือ `emitAudit()` (`lib/audit/audit.ts`)
 * - กรอง `organization_id` ของผู้เรียกทุก query (multi-tenant — Rule 02)
 * - **Company User เข้าไม่ได้เด็ดขาด** แม้ role กำหนดเองจะให้ capability มา: แถว audit ไม่มีคอลัมน์บริษัท
 *   ⇒ กรองรายแถวให้ปลอดภัยไม่ได้ และเนื้อในมีข้อมูลข้ามบริษัท (`97` §11 ห้าม leak) ⇒ 403 ตั้งแต่ต้นทาง
 * - ช่วงวันที่ที่ผู้ใช้เลือกเป็น **วันไทย** — แปลงเป็นช่วง `TIMESTAMPTZ` ที่นี่ ไม่ใช่ที่ FE (Rule 01)
 */

const listSelect = {
  id: true,
  actorId: true,
  actorRole: true,
  action: true,
  targetType: true,
  targetId: true,
  reason: true,
  createdAt: true,
  actor: { select: { fullName: true } },
} satisfies Prisma.AuditLogSelect

const detailSelect = {
  ...listSelect,
  beforeData: true,
  afterData: true,
  ipAddress: true,
  userAgent: true,
} satisfies Prisma.AuditLogSelect

type ListRow = Prisma.AuditLogGetPayload<{ select: typeof listSelect }>
type DetailRow = Prisma.AuditLogGetPayload<{ select: typeof detailSelect }>

function toListItem(row: ListRow): AuditLogListItemDto {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    action: row.action,
    // actor `null` = งานอัตโนมัติของระบบ (`02` §10) — ที่มาของงานอยู่ใน `reason` (`90` §13)
    actorId: row.actorId,
    actorName: row.actor?.fullName ?? null,
    actorRole: row.actorRole,
    targetType: row.targetType,
    targetId: row.targetId,
    reason: row.reason,
  }
}

/** ผู้ที่เข้าถึงบันทึกการใช้งานไม่ได้เลย — ตรวจซ้ำที่ชั้นข้อมูล ไม่พึ่ง capability อย่างเดียว (DEC-002) */
function assertAuditReadable(user: SessionUser): void {
  if (user.scope.kind === 'company') {
    throw new AuthError('PERMISSION_DENIED', `audit-logs: company scope user=${user.id}`)
  }
}

/** ขอบล่าง/บนของ "ทั้งวัน" ตามปฏิทินไทยจากค่า `YYYY-MM-DD` ของ `<input type="date">` */
function bangkokDayStart(dateOnly: string): Date {
  return new Date(`${dateOnly}T00:00:00.000+07:00`)
}

function bangkokDayEnd(dateOnly: string): Date {
  return new Date(`${dateOnly}T23:59:59.999+07:00`)
}

export function auditLogWhere(user: SessionUser, query: AuditLogListQuery): Prisma.AuditLogWhereInput {
  const createdAt: Prisma.DateTimeFilter = {}
  if (query.dateFrom !== undefined) createdAt.gte = bangkokDayStart(query.dateFrom)
  if (query.dateTo !== undefined) createdAt.lte = bangkokDayEnd(query.dateTo)

  return {
    organizationId: user.organizationId,
    ...(query.targetType === undefined || query.targetType === '' ? {} : { targetType: query.targetType }),
    ...(query.targetId === undefined ? {} : { targetId: query.targetId }),
    ...(query.actorId === undefined ? {} : { actorId: query.actorId }),
    ...(query.action === undefined ? {} : { action: query.action }),
    ...(createdAt.gte === undefined && createdAt.lte === undefined ? {} : { createdAt }),
  }
}

export async function listAuditLogs(user: SessionUser, query: AuditLogListQuery): Promise<AuditLogListDto> {
  assertAuditReadable(user)
  const where = auditLogWhere(user, query)

  const [rows, total, targetTypes] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      skip: query.offset,
      select: listSelect,
    }),
    prisma.auditLog.count({ where }),
    // ตัวเลือกของช่อง "เป้าหมาย" มาจากข้อมูลจริงในองค์กร (ไม่ hardcode รายชื่อตาราง)
    prisma.auditLog.findMany({
      where: { organizationId: user.organizationId },
      distinct: ['targetType'],
      orderBy: { targetType: 'asc' },
      select: { targetType: true },
      take: 100,
    }),
  ])

  return {
    items: rows.map(toListItem),
    total,
    offset: query.offset,
    limit: query.limit,
    hasMore: query.offset + rows.length < total,
    targetTypes: targetTypes.map((row) => row.targetType),
  }
}

/** รายละเอียดรายการเดียว — before/after JSON เต็ม (`90` §14) */
export async function getAuditLog(user: SessionUser, id: string): Promise<AuditLogDetailDto | null> {
  assertAuditReadable(user)
  const row: DetailRow | null = await prisma.auditLog.findFirst({
    where: { id, organizationId: user.organizationId },
    select: detailSelect,
  })
  if (row === null) return null

  return {
    ...toListItem(row),
    before: row.beforeData ?? null,
    after: row.afterData ?? null,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
  }
}
