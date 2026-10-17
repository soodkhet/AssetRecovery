import { AuthError } from '@/lib/auth/errors'
import type { SessionUser } from '@/lib/auth/types'
import { auditLoginFailureOf, auditReasonText, auditTargetLabelOf } from '@/lib/audit/log-display'
import type { AuditLogListQuery } from '@/lib/audit/log-schemas'
import { resolveAuditRefLabels } from '@/lib/audit/target-ref-queries'
import {
  auditOrgLevelTargetLabel,
  auditRefKey,
  auditTargetContextRef,
  auditTargetRef,
  auditValueRefs,
  auditTextRefs,
  auditReplaceTextRefs,
  type AuditRef,
} from '@/lib/audit/target-refs'
import type {
  AuditLogActorOptionDto,
  AuditLogDetailDto,
  AuditLogListDto,
  AuditLogListItemDto,
} from '@/lib/audit/log-types'
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
  // อ่านผลของ login ที่ล้มเหลว (R3-016) — แถวหน้าละไม่กี่สิบแถว
  afterData: true,
  actor: { select: { fullName: true } },
} satisfies Prisma.AuditLogSelect

const detailSelect = {
  ...listSelect,
  beforeData: true,
  ipAddress: true,
  userAgent: true,
} satisfies Prisma.AuditLogSelect

type ListRow = Prisma.AuditLogGetPayload<{ select: typeof listSelect }>
type DetailRow = Prisma.AuditLogGetPayload<{ select: typeof detailSelect }>

function targetRefOf(row: ListRow, labels: ReadonlyMap<string, string>, organizationId: string): string | null {
  // mytester5 A5-01 — ค่าตั้งระดับองค์กร (target_id = id องค์กร) ⇒ ชื่อหมวดค่าตั้ง ไม่ใช่ "00000000"
  const orgLevel = auditOrgLevelTargetLabel(row, organizationId)
  if (orgLevel !== null) return orgLevel
  const ref = auditTargetRef(row)
  if (ref === null) return null
  const label = labels.get(auditRefKey(ref))
  if (label !== undefined) return label
  // mytester5 H5-01 — แถวเป้าหมายถูกลบจริงแล้ว (ร่างปิดงาน) ⇒ ป้ายของค่าอ้างอิงสำรองในค่าหลัง (เคส)
  const context = auditTargetContextRef(row)
  return context === null ? null : (labels.get(auditRefKey(context)) ?? null)
}

/** ค่าที่ต้องค้นชื่อของแถวในหน้า — เป้าหมาย + ค่าอ้างอิงสำรอง (ค้นรวมทีละชนิด ไม่ N+1) */
function listRefsOf(rows: readonly ListRow[]): AuditRef[] {
  const refs: AuditRef[] = []
  for (const row of rows) {
    const target = auditTargetRef(row)
    if (target !== null) refs.push(target)
    const context = auditTargetContextRef(row)
    if (context !== null) refs.push(context)
    // ตรวจซ้ำ staging SV5-R-03 — รายการเดินบัญชีที่อ้างในเหตุผล (`bank_transaction:<id>`)
    refs.push(...auditTextRefs(row.reason))
  }
  return refs
}

/** ป้ายของค่าก่อน/หลัง ส่งให้หน้าจอเป็น id → ป้าย (ชนิดรู้ได้จากชื่อฟิลด์ฝั่งหน้าจอ) */
function valueRefLabels(refs: readonly AuditRef[], labels: ReadonlyMap<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const ref of refs) {
    const label = labels.get(auditRefKey(ref))
    if (label !== undefined) out[ref.id.toLowerCase()] = label
  }
  return out
}

function toListItem(row: ListRow, labels: ReadonlyMap<string, string>, organizationId: string): AuditLogListItemDto {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    action: row.action,
    // actor `null` = งานอัตโนมัติของระบบ (`02` §10) — ที่มาของงานอยู่ใน `reason` (`90` §13)
    actorId: row.actorId,
    actorName: row.actor?.fullName ?? null,
    actorRole: row.actorRole,
    targetType: row.targetType,
    targetLabel: auditTargetLabelOf(row.targetType, row.afterData),
    targetId: row.targetId,
    targetRef: targetRefOf(row, labels, organizationId),
    // ตรวจซ้ำ staging SV5-R-03 — แปลงอ้างอิงรายการเดินบัญชีในเหตุผลเป็นป้ายตอนแสดง (ข้อมูล audit คงเดิม)
    // ตรวจซ้ำ staging SV6-R-04 — วันที่ ISO ค.ศ. ในเหตุผลเดิม ⇒ พ.ศ.
    reason:
      row.reason === null
        ? null
        : auditReasonText(auditReplaceTextRefs(row.reason, (ref) => labels.get(auditRefKey(ref)) ?? null)),
    loginFailure: auditLoginFailureOf(row.action, row.afterData),
  }
}

/**
 * ผู้ที่เข้าถึงบันทึกการใช้งานไม่ได้เลย — ตรวจซ้ำที่ชั้นข้อมูล ไม่พึ่ง capability อย่างเดียว (DEC-002)
 *
 * ใช้ **whitelist `global`** ไม่ใช่ blacklist `company`: `view_audit_log` เป็น capability นอก matrix
 * ที่ admin มอบให้ role ไหนก็ได้ ⇒ ถ้าไปตกที่ Manager (`team`) หรือ Field Agent (`self`) แถว audit
 * ก็ไม่มีคอลัมน์ทีม/ผู้ใช้ให้กรองรายแถวเหมือนกันกับเคส company ⇒ เห็นทั้งองค์กร (เงิน/ภาษี/สิทธิ์)
 */
function assertAuditReadable(user: SessionUser): void {
  if (user.scope.kind !== 'global') {
    throw new AuthError('PERMISSION_DENIED', `audit-logs: scope=${user.scope.kind} user=${user.id}`)
  }
}

/** ขอบล่างของ "ทั้งวัน" ตามปฏิทินไทยจากค่า `YYYY-MM-DD` ของ `<input type="date">` */
function bangkokDayStart(dateOnly: string): Date {
  return new Date(`${dateOnly}T00:00:00.000+07:00`)
}

/**
 * ขอบบน = **เที่ยงคืนของวันถัดไป** แล้วใช้ `lt` — `created_at` เป็น `Timestamptz(6)` ระดับไมโครวินาที
 * ถ้าใช้ `lte 23:59:59.999` แถวช่วง `.999001–.999999` จะตกหล่นเงียบ ๆ
 */
function bangkokDayAfter(dateOnly: string): Date {
  return new Date(new Date(`${dateOnly}T00:00:00.000+07:00`).getTime() + 24 * 60 * 60 * 1000)
}

export function auditLogWhere(user: SessionUser, query: AuditLogListQuery): Prisma.AuditLogWhereInput {
  const createdAt: Prisma.DateTimeFilter = {}
  if (query.dateFrom !== undefined) createdAt.gte = bangkokDayStart(query.dateFrom)
  if (query.dateTo !== undefined) createdAt.lt = bangkokDayAfter(query.dateTo)

  return {
    organizationId: user.organizationId,
    ...(query.targetType === undefined || query.targetType === '' ? {} : { targetType: query.targetType }),
    ...(query.targetId === undefined ? {} : { targetId: query.targetId }),
    ...(query.actorId === undefined ? {} : { actorId: query.actorId }),
    ...(query.action === undefined ? {} : { action: query.action }),
    ...(createdAt.gte === undefined && createdAt.lt === undefined ? {} : { createdAt }),
  }
}

export async function listAuditLogs(user: SessionUser, query: AuditLogListQuery): Promise<AuditLogListDto> {
  assertAuditReadable(user)
  const where = auditLogWhere(user, query)

  const [rows, total, targetTypes, actorIds] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      skip: query.offset,
      select: listSelect,
    }),
    prisma.auditLog.count({ where }),
    // ตัวเลือกของช่อง "เป้าหมาย" มาจากข้อมูลจริงในองค์กร (ไม่ hardcode รายชื่อตาราง)
    // ⚠️ ต้องเป็น `groupBy` ไม่ใช่ `findMany({ distinct })` — Prisma ทำ distinct ในหน่วยความจำและ
    // ไม่ push `LIMIT` ลง SQL ⇒ เปิดหน้าทีนึงอ่านแถว audit ทั้งองค์กร (เก็บ 5 ปี) เข้ามาใน Node
    prisma.auditLog.groupBy({
      by: ['targetType'],
      where: { organizationId: user.organizationId },
      orderBy: { targetType: 'asc' },
    }),
    // ตัวเลือกช่อง "ผู้ดำเนินการ" (`90` §14) — เฉพาะคนที่มีรายการจริง (`actor_id` NULL = งานของระบบ)
    prisma.auditLog.groupBy({
      by: ['actorId'],
      where: { organizationId: user.organizationId, actorId: { not: null } },
    }),
  ])

  // known H-06 — ชื่อเป้าหมายที่อ่านได้: ค้นทีละชนิดครั้งเดียวทั้งหน้า (ไม่ N+1)
  const labels = await resolveAuditRefLabels(user.organizationId, listRefsOf(rows))

  return {
    items: rows.map((row) => toListItem(row, labels, user.organizationId)),
    total,
    offset: query.offset,
    limit: query.limit,
    hasMore: query.offset + rows.length < total,
    targetTypes: targetTypes.map((row) => row.targetType),
    actors: await actorOptions(user, actorIds),
  }
}

/** ชื่อผู้ดำเนินการของตัวเลือกในช่องกรอง — กรอง `organization_id` ซ้ำอีกชั้น (Rule 02) */
async function actorOptions(
  user: SessionUser,
  rows: readonly { actorId: string | null }[],
): Promise<AuditLogActorOptionDto[]> {
  const ids = rows.map((row) => row.actorId).filter((id): id is string => id !== null)
  if (ids.length === 0) return []

  const users = await prisma.user.findMany({
    where: { id: { in: ids }, organizationId: user.organizationId },
    select: { id: true, fullName: true },
    orderBy: { fullName: 'asc' },
  })
  return users.map((row) => ({ id: row.id, name: row.fullName }))
}

/** รายละเอียดรายการเดียว — before/after JSON เต็ม (`90` §14) */
export async function getAuditLog(user: SessionUser, id: string): Promise<AuditLogDetailDto | null> {
  assertAuditReadable(user)
  const row: DetailRow | null = await prisma.auditLog.findFirst({
    where: { id, organizationId: user.organizationId },
    select: detailSelect,
  })
  if (row === null) return null

  const valueRefs = [...auditValueRefs(row.beforeData), ...auditValueRefs(row.afterData)]
  const labels = await resolveAuditRefLabels(user.organizationId, [...listRefsOf([row]), ...valueRefs])

  return {
    ...toListItem(row, labels, user.organizationId),
    before: row.beforeData ?? null,
    after: row.afterData ?? null,
    refLabels: valueRefLabels(valueRefs, labels),
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
  }
}
