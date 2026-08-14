import { emitAudit } from '@/lib/audit/audit'
import type { RequestMeta } from '@/lib/auth/request-meta'
import type { SessionUser } from '@/lib/auth/types'
import { ACTIVE_ASSIGNMENT_STATUSES } from '@/lib/assignments/assignment'
import { AssignmentError } from '@/lib/assignments/errors'
import { acceptAssignment } from '@/lib/assignments/queries'
import { caseScopeWhere } from '@/lib/cases/queries'
import { assertCloseEvidence, assertDeviceCoordinates } from '@/lib/field/evidence'
import {
  assertFieldAction,
  assertFieldStateAction,
  closedStatusOf,
  fieldGroupOf,
  statusesInGroup,
} from '@/lib/field/field-status'
import { assertReorderCoversDay, nextScheduleOrder, recomputeScheduleOrder } from '@/lib/field/schedule'
import type {
  CheckinInput,
  CloseCaseInput,
  CloseDraftInput,
  FieldCaseListQuery,
  ReorderSchedulesInput,
  ScheduleCaseInput,
} from '@/lib/field/schemas'
import type {
  FieldActionResultDto,
  FieldCaseDetailDto,
  FieldCaseListItemDto,
  FieldCaseListResultDto,
  FieldCheckinDto,
  FieldCheckinResultDto,
  FieldCloseDraftDto,
  FieldCloseDraftResultDto,
  FieldReorderResultDto,
  FieldTravelOriginDto,
} from '@/lib/field/types'
import { Prisma } from '@/lib/generated/prisma/client'
import type { AssignmentStatus } from '@/lib/generated/prisma/enums'
import { prisma } from '@/lib/prisma'

/**
 * ชั้นข้อมูลของ Field Tracker (ไฟล์ 41) — pure logic อยู่ที่ `field-status.ts` / `evidence.ts` / `schedule.ts`
 *
 * กติกาที่บังคับที่นี่:
 * - ทุก query กรองด้วย `organization_id` + `caseScopeWhere()` (Rule 03) และ **assignment ของผู้เรียกเอง**
 *   ยกเว้นมุมมองทีม (`41` §7.3) ที่เป็น **read-only** — ไม่มี mutation ไหนรับ assignment ของคนอื่นเลย
 * - ทุก mutation อยู่ใน `$transaction` เดียวกับ `emitAudit()`
 * - สถานะขยับผ่าน `assertFieldAction()` เท่านั้น (ห้าม if สถานะเอง) และอ่านสถานะ assignment ดิบไม่ได้
 *   นอกจากผ่าน `fieldGroupOf()`/`statusesInGroup()`
 * - **เช็คอินเป็น insert-only** (`41` §6.4 — หลักฐานล็อกตลอด แก้ไม่ได้แม้ในโหมด `needs_revision`)
 */

export interface FieldMutationContext {
  actor: SessionUser
  meta: RequestMeta
}

/** ชนิด tx ของ client ที่ต่อ extension แล้ว (กับดัก `Prisma.TransactionClient`) */
type FieldTxClient = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>

// ── select / mapper ─────────────────────────────────────────────────────────

const assignmentSelect = {
  id: true,
  caseId: true,
  agentId: true,
  teamId: true,
  status: true,
  trackingRound: true,
  scheduledDate: true,
  scheduleOrder: true,
  acceptedAt: true,
  completedAt: true,
  createdAt: true,
  agent: { select: { fullName: true } },
  team: {
    select: {
      id: true,
      name: true,
      compensationPlan: {
        select: { fuelMode: true, commissionSatang: true, noSuccessFeeSatang: true },
      },
    },
  },
  case: {
    select: {
      id: true,
      caseRef: true,
      trackingRound: true,
      debtorName: true,
      addrProvince: true,
      addrDistrict: true,
      assetDescription: true,
      debtAmountSatang: true,
      outcome: true,
      closedAt: true,
    },
  },
  _count: { select: { checkIns: true } },
  closeCaseDraft: { select: { id: true } },
} as const

type AssignmentRow = Prisma.CaseAssignmentGetPayload<{ select: typeof assignmentSelect }>

/** คอลัมน์ `DATE` → `YYYY-MM-DD` (เก็บเป็นเที่ยงคืน UTC — ดู `dateOnlySchema`) */
function toDateOnly(value: Date | null): string | null {
  return value === null ? null : value.toISOString().slice(0, 10)
}

function toListItem(row: AssignmentRow, hasPendingReassignment: boolean): FieldCaseListItemDto {
  const plan = row.team.compensationPlan
  return {
    caseId: row.caseId,
    assignmentId: row.id,
    caseRef: row.case.caseRef,
    trackingRound: row.trackingRound,
    status: row.status,
    group: fieldGroupOf(row.status),
    agentId: row.agentId,
    agentName: row.agent.fullName,
    debtorName: row.case.debtorName,
    province: row.case.addrProvince,
    district: row.case.addrDistrict,
    assetDescription: row.case.assetDescription,
    debtAmountSatang: row.case.debtAmountSatang,
    assignedAt: row.createdAt.toISOString(),
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    scheduleDate: toDateOnly(row.scheduledDate),
    scheduleOrder: row.scheduleOrder,
    closedAt: row.completedAt?.toISOString() ?? null,
    outcome: row.case.outcome,
    hasDraft: row.closeCaseDraft !== null,
    hasPendingReassignment,
    checkinCount: row._count.checkIns,
    commissionSatang: plan?.commissionSatang ?? null,
    noSuccessFeeSatang: plan?.noSuccessFeeSatang ?? null,
  }
}

function toActionResult(row: AssignmentRow, events: readonly string[]): FieldActionResultDto {
  return {
    caseId: row.caseId,
    assignmentId: row.id,
    status: row.status,
    group: fieldGroupOf(row.status),
    scheduleDate: toDateOnly(row.scheduledDate),
    scheduleOrder: row.scheduleOrder,
    events,
  }
}

function toCheckinDto(row: {
  id: string
  checkinType: string
  latitude: Prisma.Decimal
  longitude: Prisma.Decimal
  addressNote: string | null
  note: string | null
  checkedInAt: Date
}): FieldCheckinDto {
  return {
    id: row.id,
    checkinType: row.checkinType,
    latitude: row.latitude.toNumber(),
    longitude: row.longitude.toNumber(),
    addressNote: row.addressNote,
    note: row.note,
    checkedInAt: row.checkedInAt.toISOString(),
  }
}

function toTravelOriginDto(row: {
  latitude: Prisma.Decimal
  longitude: Prisma.Decimal
  source: FieldTravelOriginDto['source']
  setAt: Date
}): FieldTravelOriginDto {
  return {
    latitude: row.latitude.toNumber(),
    longitude: row.longitude.toNumber(),
    source: row.source,
    setAt: row.setAt.toISOString(),
  }
}

function toDraftDto(row: {
  outcome: FieldCloseDraftDto['outcome']
  photos: string[]
  videos: string[]
  productPhotos: string[]
  audioUrl: string | null
  note: string | null
  updatedAt: Date
}): FieldCloseDraftDto {
  return {
    outcome: row.outcome,
    photos: row.photos,
    videos: row.videos,
    productPhotos: row.productPhotos,
    audioUrl: row.audioUrl,
    note: row.note,
    updatedAt: row.updatedAt.toISOString(),
  }
}

// ── โหลด assignment ของผู้เรียกเอง ──────────────────────────────────────────

/**
 * assignment ของ **ผู้เรียกเอง** ในรอบติดตามปัจจุบันเท่านั้น — ทุก mutation ของไฟล์ 41 ต้องผ่านตัวนี้
 * ไม่พบ/เป็นของคนอื่น = `ASSIGNMENT_NOT_FOUND` (ไม่ leak ว่าเคสนี้อยู่กับใคร)
 */
async function loadOwnAssignment(user: SessionUser, caseId: string): Promise<AssignmentRow> {
  const row = await prisma.caseAssignment.findFirst({
    where: {
      caseId,
      agentId: user.id,
      organizationId: user.organizationId,
      case: { deletedAt: null, organizationId: user.organizationId, ...caseScopeWhere(user) },
    },
    orderBy: { createdAt: 'desc' },
    select: assignmentSelect,
  })
  if (row === null) throw new AssignmentError('ASSIGNMENT_NOT_FOUND')
  if (row.trackingRound !== row.case.trackingRound) {
    throw new AssignmentError('ASSIGNMENT_INVALID_STATUS', { detail: 'assignment ของรอบติดตามเก่า' })
  }
  return row
}

async function pendingReassignmentCaseIds(caseIds: readonly string[]): Promise<Set<string>> {
  if (caseIds.length === 0) return new Set()
  const rows = await prisma.pendingReassignment.findMany({
    where: { caseId: { in: [...caseIds] }, status: 'waiting_consent' },
    select: { caseId: true },
  })
  return new Set(rows.map((row) => row.caseId))
}

// ── GET /api/field/cases (`41` §7.2/§7.3/§7.5/§7.11) ────────────────────────

export async function listFieldCases(user: SessionUser, query: FieldCaseListQuery): Promise<FieldCaseListResultDto> {
  const statuses: AssignmentStatus[] =
    query.status === undefined ? [...ACTIVE_ASSIGNMENT_STATUSES] : statusesInGroup(query.status)

  // มุมมองทีม (`41` §7.3) = เพื่อนร่วมทีมเดียวกันทั้งทีม **อ่านอย่างเดียว** เห็นรายละเอียดเต็มไม่ปิดบัง (§20)
  const agentFilter: Prisma.CaseAssignmentWhereInput =
    query.view === 'team' ? { team: { members: { some: { id: user.id } } } } : { agentId: user.id }

  const rows = await prisma.caseAssignment.findMany({
    where: {
      organizationId: user.organizationId,
      status: { in: statuses },
      case: { deletedAt: null },
      ...agentFilter,
    },
    orderBy: [{ scheduledDate: 'asc' }, { scheduleOrder: 'asc' }, { createdAt: 'desc' }],
    take: 200,
    select: assignmentSelect,
  })

  const pending = await pendingReassignmentCaseIds(rows.map((row) => row.caseId))

  return {
    view: query.view,
    group: query.status ?? null,
    readOnly: query.view === 'team',
    items: rows.map((row) => toListItem(row, pending.has(row.caseId))),
  }
}

// ── GET /api/field/cases/:id (`41` §7.7) ────────────────────────────────────

export async function getFieldCase(user: SessionUser, caseId: string): Promise<FieldCaseDetailDto> {
  const assignment = await prisma.caseAssignment.findFirst({
    where: {
      caseId,
      organizationId: user.organizationId,
      case: { deletedAt: null, organizationId: user.organizationId, ...caseScopeWhere(user) },
      // เห็นได้ทั้งของตัวเองและของเพื่อนร่วมทีม (มุมมองทีม §7.3 เปิด detail เต็มได้)
      OR: [{ agentId: user.id }, { team: { members: { some: { id: user.id } } } }],
    },
    orderBy: { createdAt: 'desc' },
    select: assignmentSelect,
  })
  if (assignment === null) throw new AssignmentError('ASSIGNMENT_NOT_FOUND')

  const [caseRow, checkins, travelOrigin, draft, pending, evidence] = await Promise.all([
    prisma.case.findUniqueOrThrow({
      where: { id: caseId },
      select: {
        companyId: true,
        company: { select: { name: true } },
        debtorNationalId: true,
        debtorPassportNo: true,
        debtorPhoneMobile: true,
        debtorPhoneWork: true,
        debtorLineId: true,
        debtorFacebook: true,
        imei: true,
        serialNo: true,
        addrDetail: true,
        addrSubdistrict: true,
        addrDistrict: true,
        addrProvince: true,
        addrPostalCode: true,
        workAddrDetail: true,
        workAddrSubdistrict: true,
        workAddrDistrict: true,
        workAddrProvince: true,
        workAddrPostalCode: true,
        idCardAddrDetail: true,
        idCardAddrSubdistrict: true,
        idCardAddrDistrict: true,
        idCardAddrProvince: true,
        idCardAddrPostalCode: true,
        contacts: {
          select: { id: true, contactName: true, relation: true, phone: true, note: true },
          orderBy: { createdAt: 'asc' },
        },
        documents: {
          where: { deletedAt: null },
          select: { id: true, documentType: true, fileUrl: true, originalName: true, mimeType: true },
          orderBy: { uploadedAt: 'asc' },
        },
      },
    }),
    prisma.checkIn.findMany({
      where: { assignmentId: assignment.id },
      orderBy: { checkedInAt: 'asc' },
      select: {
        id: true,
        checkinType: true,
        latitude: true,
        longitude: true,
        addressNote: true,
        note: true,
        checkedInAt: true,
      },
    }),
    prisma.travelOrigin.findUnique({
      where: { assignmentId: assignment.id },
      select: { latitude: true, longitude: true, source: true, setAt: true },
    }),
    prisma.closeCaseDraft.findUnique({
      where: { assignmentId: assignment.id },
      select: {
        outcome: true,
        photos: true,
        videos: true,
        productPhotos: true,
        audioUrl: true,
        note: true,
        updatedAt: true,
      },
    }),
    prisma.pendingReassignment.findFirst({
      where: { caseId, status: 'waiting_consent' },
      orderBy: { requestedAt: 'desc' },
      select: {
        id: true,
        requestedAt: true,
        reason: true,
        expiresAt: true,
        newAgent: { select: { fullName: true } },
        requestedByUser: { select: { fullName: true } },
      },
    }),
    prisma.caseEvidence.findFirst({
      where: { assignmentId: assignment.id },
      orderBy: { submittedAt: 'desc' },
      select: { rejectReason: true },
    }),
  ])

  const documents = caseRow.documents.filter((doc) => doc.documentType !== 'product_photo')
  const productPhotos = caseRow.documents.filter((doc) => doc.documentType === 'product_photo')

  return {
    ...toListItem(assignment, pending !== null),
    companyName: caseRow.company.name,
    teamId: assignment.team.id,
    teamName: assignment.team.name,
    fuelMode: assignment.team.compensationPlan?.fuelMode ?? null,
    debtorNationalId: caseRow.debtorNationalId,
    debtorPassportNo: caseRow.debtorPassportNo,
    debtorPhoneMobile: caseRow.debtorPhoneMobile,
    debtorPhoneWork: caseRow.debtorPhoneWork,
    debtorLineId: caseRow.debtorLineId,
    debtorFacebook: caseRow.debtorFacebook,
    imei: caseRow.imei,
    serialNo: caseRow.serialNo,
    currentAddress: {
      detail: caseRow.addrDetail,
      subdistrict: caseRow.addrSubdistrict,
      district: caseRow.addrDistrict,
      province: caseRow.addrProvince,
      postalCode: caseRow.addrPostalCode,
    },
    workAddress: {
      detail: caseRow.workAddrDetail,
      subdistrict: caseRow.workAddrSubdistrict,
      district: caseRow.workAddrDistrict,
      province: caseRow.workAddrProvince,
      postalCode: caseRow.workAddrPostalCode,
    },
    idCardAddress: {
      detail: caseRow.idCardAddrDetail,
      subdistrict: caseRow.idCardAddrSubdistrict,
      district: caseRow.idCardAddrDistrict,
      province: caseRow.idCardAddrProvince,
      postalCode: caseRow.idCardAddrPostalCode,
    },
    contacts: caseRow.contacts,
    documents,
    productPhotos,
    checkins: checkins.map(toCheckinDto),
    travelOrigin: travelOrigin === null ? null : toTravelOriginDto(travelOrigin),
    draft: draft === null ? null : toDraftDto(draft),
    pendingReassignment:
      pending === null
        ? null
        : {
            id: pending.id,
            requestedByName: pending.requestedByUser.fullName,
            requestedAt: pending.requestedAt.toISOString(),
            newAgentName: pending.newAgent.fullName,
            reason: pending.reason,
            expiresAt: pending.expiresAt.toISOString(),
          },
    rejectReason: assignment.status === 'needs_revision' ? (evidence?.rejectReason ?? null) : null,
  }
}

// ── POST /api/field/cases/:id/accept (`41` §8 accept_case) ──────────────────

/**
 * ใช้ service ตัวเดียวกับ `POST /api/cases/:id/accept` ของไฟล์ 40 (`40` §8) — **ห้ามเขียนตรรกะรับงานซ้ำ**
 * ทั้งสอง endpoint คือการกระทำเดียวกัน ต่างกันแค่หน้าจอที่เรียก จึงต้องได้ผลลัพธ์/audit เหมือนกันเป๊ะ
 * ชื่อ event ต่างกันตามทะเบียนของแต่ละไฟล์ (`40` §17.2 `assignment.accepted` · `41` §17.2 `case.accepted`)
 */
export async function acceptFieldCase(
  user: SessionUser,
  caseId: string,
  context: FieldMutationContext,
): Promise<FieldActionResultDto> {
  await acceptAssignment(user, caseId, context)
  const row = await loadOwnAssignment(user, caseId)
  return toActionResult(row, ['assignment.accepted', 'case.accepted'])
}

// ── POST /api/field/cases/:id/schedule (`41` §8 schedule_case) ──────────────

export async function scheduleFieldCase(
  user: SessionUser,
  caseId: string,
  input: ScheduleCaseInput,
  context: FieldMutationContext,
): Promise<FieldActionResultDto> {
  const current = await loadOwnAssignment(user, caseId)
  assertFieldAction(current.status, 'schedule_case')

  const sameDay = await prisma.caseAssignment.findMany({
    where: {
      agentId: user.id,
      organizationId: user.organizationId,
      scheduledDate: input.scheduleDate,
      status: { in: statusesInGroup('tracking') },
      id: { not: current.id },
    },
    select: { scheduleOrder: true },
  })
  const scheduleOrder = nextScheduleOrder(sameDay.map((row) => row.scheduleOrder))

  const updated = await prisma.$transaction(async (tx) => {
    const claimed = await tx.caseAssignment.updateMany({
      where: { id: current.id, status: 'accepted_unscheduled' },
      data: {
        status: 'scheduled',
        scheduledDate: input.scheduleDate,
        scheduleOrder,
        updatedBy: context.actor.id,
      },
    })
    // แข่งกับ reassign/timeout job — สถานะเปลี่ยนไปแล้วต้องไม่เขียนทับเงียบ ๆ
    if (claimed.count === 0) throw new AssignmentError('ASSIGNMENT_INVALID_STATUS')

    // เคสเข้าสู่ "กำลังดำเนินงาน" ตอนลงวันจริง (`02` §3 `case_status.active`)
    await tx.case.update({ where: { id: caseId }, data: { status: 'active', updatedBy: context.actor.id } })

    await emitAudit(
      {
        organizationId: user.organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'status_change',
        targetType: 'case_assignments',
        targetId: current.id,
        before: { status: current.status, scheduledDate: null, scheduleOrder: null },
        after: {
          status: 'scheduled',
          scheduledDate: input.scheduleDate,
          scheduleOrder,
          events: ['case.scheduled'],
        },
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx as FieldTxClient,
    )

    return await tx.caseAssignment.findUniqueOrThrow({ where: { id: current.id }, select: assignmentSelect })
  })

  return toActionResult(updated, ['case.scheduled'])
}

// ── PATCH /api/field/cases/reorder (`41` §8 reorder_schedule) ───────────────

/** ลากสลับ 1 ครั้ง = **recompute ลำดับใหม่ทั้งวัน** (`41` §8) — ทำได้เสมอไม่มีเงื่อนไข lock (§11) */
export async function reorderFieldSchedules(
  user: SessionUser,
  input: ReorderSchedulesInput,
  context: FieldMutationContext,
): Promise<FieldReorderResultDto> {
  const dayRows = await prisma.caseAssignment.findMany({
    where: {
      agentId: user.id,
      organizationId: user.organizationId,
      scheduledDate: input.date,
      status: { in: statusesInGroup('tracking') },
      case: { deletedAt: null },
    },
    select: { id: true, caseId: true, status: true, scheduleOrder: true },
  })

  for (const row of dayRows) assertFieldStateAction(row.status, 'reorder_schedule')

  const byCaseId = new Map(dayRows.map((row) => [row.caseId, row]))
  const orderedAssignmentIds = input.orderedCaseIds.map((caseId) => byCaseId.get(caseId)?.id ?? caseId)
  assertReorderCoversDay(
    dayRows.map((row) => row.id),
    orderedAssignmentIds,
  )

  const updates = recomputeScheduleOrder(
    orderedAssignmentIds,
    new Map(dayRows.map((row) => [row.id, row.scheduleOrder])),
  )

  if (updates.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const update of updates) {
        await tx.caseAssignment.update({
          where: { id: update.assignmentId },
          data: { scheduleOrder: update.scheduleOrder, updatedBy: context.actor.id },
        })
      }

      await emitAudit(
        {
          organizationId: user.organizationId,
          actorId: context.actor.id,
          actorRole: context.actor.roleName,
          action: 'update',
          targetType: 'case_assignments',
          targetId: orderedAssignmentIds[0] ?? updates[0]?.assignmentId ?? '',
          before: { order: dayRows.map((row) => ({ id: row.id, scheduleOrder: row.scheduleOrder })) },
          after: {
            date: input.date,
            order: orderedAssignmentIds.map((id, index) => ({ id, scheduleOrder: index + 1 })),
            events: ['case.reordered'],
          },
          ipAddress: context.meta.ipAddress,
          userAgent: context.meta.userAgent,
          diffOnly: false,
        },
        tx as FieldTxClient,
      )
    })
  }

  const idToCaseId = new Map(dayRows.map((row) => [row.id, row.caseId]))
  return {
    date: toDateOnly(input.date) ?? '',
    items: orderedAssignmentIds.map((assignmentId, index) => ({
      assignmentId,
      caseId: idToCaseId.get(assignmentId) ?? '',
      scheduleOrder: index + 1,
    })),
    events: ['case.reordered'],
  }
}

// ── POST /api/field/cases/:id/checkin (`41` §8 add_checkin) ─────────────────

/** เช็คอิน = **insert-only** พิกัดจาก device GPS จริงเท่านั้น (`41` §11) — ไม่มีทางแก้/ลบผ่าน API */
export async function recordCheckin(
  user: SessionUser,
  caseId: string,
  input: CheckinInput,
  context: FieldMutationContext,
): Promise<FieldCheckinResultDto> {
  const current = await loadOwnAssignment(user, caseId)
  assertFieldStateAction(current.status, 'add_checkin')
  assertDeviceCoordinates(input.latitude, input.longitude)

  const checkedInAt = new Date()
  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.checkIn.create({
      data: {
        organizationId: user.organizationId,
        caseId,
        assignmentId: current.id,
        checkinType: input.checkinType,
        latitude: new Prisma.Decimal(input.latitude),
        longitude: new Prisma.Decimal(input.longitude),
        addressNote: input.addressNote ?? null,
        note: input.note ?? null,
        checkedInAt,
        createdBy: context.actor.id,
      },
      select: {
        id: true,
        checkinType: true,
        latitude: true,
        longitude: true,
        addressNote: true,
        note: true,
        checkedInAt: true,
      },
    })

    await emitAudit(
      {
        organizationId: user.organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'create',
        targetType: 'check_ins',
        targetId: row.id,
        after: {
          caseId,
          assignmentId: current.id,
          checkinType: input.checkinType,
          latitude: input.latitude,
          longitude: input.longitude,
          checkedInAt,
          events: ['case.checkin_recorded'],
        },
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx as FieldTxClient,
    )

    return row
  })

  return {
    caseId,
    checkin: toCheckinDto(created),
    checkinCount: current._count.checkIns + 1,
    events: ['case.checkin_recorded'],
  }
}

// ── POST /api/field/cases/:id/close-draft (`41` §6.5 · §8) ──────────────────

/**
 * บันทึก draft (1:1 ต่อรอบติดตาม · ไม่มี expiry) + จุดเริ่มเดินทางที่มากับฟอร์ม
 *
 * `travel_origin` **ไม่ใช่หลักฐาน** (`41` §6.4.1) — เขียนทับได้เสมอ ทั้งตอน auto GPS ตอนกด "เริ่มงาน"
 * และตอนลากปรับตำแหน่ง · ไม่มี endpoint แยกใน `45` §6.3 จึงเดินทางมากับ draft
 */
export async function saveCloseDraft(
  user: SessionUser,
  caseId: string,
  input: CloseDraftInput,
  context: FieldMutationContext,
): Promise<FieldCloseDraftResultDto> {
  const current = await loadOwnAssignment(user, caseId)
  assertFieldStateAction(current.status, 'save_close_draft')
  if (input.travelOrigin !== undefined) {
    assertFieldStateAction(current.status, 'set_travel_origin')
    assertDeviceCoordinates(input.travelOrigin.latitude, input.travelOrigin.longitude)
  }

  const draftData = {
    outcome: input.outcome ?? null,
    photos: input.photos,
    videos: input.videos,
    productPhotos: input.productPhotos,
    audioUrl: input.audioUrl ?? null,
    note: input.note ?? null,
  }

  const result = await prisma.$transaction(async (tx) => {
    const draft = await tx.closeCaseDraft.upsert({
      where: { assignmentId: current.id },
      create: {
        organizationId: user.organizationId,
        caseId,
        assignmentId: current.id,
        agentId: user.id,
        ...draftData,
        createdBy: context.actor.id,
      },
      update: { ...draftData, updatedBy: context.actor.id },
      select: {
        outcome: true,
        photos: true,
        videos: true,
        productPhotos: true,
        audioUrl: true,
        note: true,
        updatedAt: true,
      },
    })

    const origin =
      input.travelOrigin === undefined
        ? await tx.travelOrigin.findUnique({
            where: { assignmentId: current.id },
            select: { latitude: true, longitude: true, source: true, setAt: true },
          })
        : await tx.travelOrigin.upsert({
            where: { assignmentId: current.id },
            create: {
              organizationId: user.organizationId,
              caseId,
              assignmentId: current.id,
              latitude: new Prisma.Decimal(input.travelOrigin.latitude),
              longitude: new Prisma.Decimal(input.travelOrigin.longitude),
              source: input.travelOrigin.source,
              setAt: new Date(),
              createdBy: context.actor.id,
            },
            update: {
              latitude: new Prisma.Decimal(input.travelOrigin.latitude),
              longitude: new Prisma.Decimal(input.travelOrigin.longitude),
              source: input.travelOrigin.source,
              updatedBy: context.actor.id,
            },
            select: { latitude: true, longitude: true, source: true, setAt: true },
          })

    await emitAudit(
      {
        organizationId: user.organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'update',
        targetType: 'close_case_drafts',
        targetId: current.id,
        after: {
          caseId,
          outcome: draftData.outcome,
          photos: draftData.photos.length,
          videos: draftData.videos.length,
          productPhotos: draftData.productPhotos.length,
          travelOrigin: input.travelOrigin ?? null,
          events: ['case.close_draft_saved'],
        },
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx as FieldTxClient,
    )

    return { draft, origin }
  })

  return {
    caseId,
    draft: toDraftDto(result.draft),
    travelOrigin: result.origin === null ? null : toTravelOriginDto(result.origin),
    events: ['case.close_draft_saved'],
  }
}

// ── POST /api/field/cases/:id/close (`41` §8 submit_close_case) ─────────────

/**
 * ยืนยันปิดงาน — หลักฐานที่ส่งมาใน body คือชุดสุดท้าย (ฟอร์มเป็นเจ้าของสถานะ ไม่ merge กับ draft
 * ไม่งั้นไฟล์ที่ผู้ใช้ลบทิ้งจะกลับมา) ส่วน **เช็คอินอ่านจาก DB เสมอ** เพราะเป็นหลักฐานที่ล็อกแล้ว
 *
 * ⚠️ การสร้างรายการเบิก fuel/allowance อัตโนมัติ (`41` §6.6) + คำนวณระยะทาง PER_KM = **Phase 2.9**
 * ตัวปิดงานที่นี่จบที่ evidence + สถานะ + ลบ draft เท่านั้น
 */
export async function closeFieldCase(
  user: SessionUser,
  caseId: string,
  input: CloseCaseInput,
  context: FieldMutationContext,
): Promise<FieldActionResultDto> {
  const current = await loadOwnAssignment(user, caseId)
  assertFieldAction(current.status, 'submit_close_case')

  const [checkinCount, travelOrigin] = await Promise.all([
    prisma.checkIn.count({ where: { assignmentId: current.id } }),
    prisma.travelOrigin.findUnique({
      where: { assignmentId: current.id },
      select: { latitude: true, longitude: true, source: true },
    }),
  ])

  assertCloseEvidence({
    outcome: input.outcome ?? null,
    checkinCount,
    photoCount: input.photos.length,
    videoCount: input.videos.length,
    productPhotoCount: input.productPhotos.length,
    hasTravelOrigin: travelOrigin !== null,
    fuelMode: current.team.compensationPlan?.fuelMode ?? null,
  })

  // ผ่าน assertCloseEvidence แล้ว = outcome ไม่เป็น null แน่นอน
  const outcome = input.outcome ?? 'closed_fail'
  const closedStatus = closedStatusOf(outcome)
  // `case_status` กับ `assignment_status` มีค่า `closed_success`/`closed_fail` ตรงกัน (`02` §3) แต่คนละ enum
  const closedCaseStatus = outcome === 'closed_success' ? ('closed_success' as const) : ('closed_fail' as const)
  const closedAt = new Date()

  const updated = await prisma.$transaction(async (tx) => {
    const claimed = await tx.caseAssignment.updateMany({
      where: { id: current.id, status: 'scheduled' },
      data: { status: closedStatus, completedAt: closedAt, updatedBy: context.actor.id },
    })
    if (claimed.count === 0) throw new AssignmentError('ASSIGNMENT_INVALID_STATUS')

    const evidence = await tx.caseEvidence.create({
      data: {
        organizationId: user.organizationId,
        caseId,
        assignmentId: current.id,
        outcome,
        photos: input.photos,
        videos: input.videos,
        productPhotos: input.productPhotos,
        audioUrl: input.audioUrl ?? null,
        // snapshot จุดเริ่มเดินทาง ณ เวลา submit (`92` §7.1 — ตัวคำนวณระยะทางของ 2.9 ใช้ค่านี้)
        travelOriginLat: travelOrigin?.latitude ?? null,
        travelOriginLng: travelOrigin?.longitude ?? null,
        travelOriginSource: travelOrigin?.source ?? null,
        submittedAt: closedAt,
        createdBy: context.actor.id,
      },
      select: { id: true },
    })

    await tx.case.update({
      where: { id: caseId },
      data: { status: closedCaseStatus, outcome, closedAt, updatedBy: context.actor.id },
    })

    // draft ถูกลบทันทีที่ปิดงานสำเร็จ (`41` §6.5) — ไม่ใช่ draft ที่ค้างอยู่อีกต่อไป
    await tx.closeCaseDraft.deleteMany({ where: { assignmentId: current.id } })

    await emitAudit(
      {
        organizationId: user.organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'status_change',
        targetType: 'case_assignments',
        targetId: current.id,
        before: { status: current.status },
        after: {
          status: closedStatus,
          outcome,
          evidenceId: evidence.id,
          checkinCount,
          photos: input.photos.length,
          videos: input.videos.length,
          productPhotos: input.productPhotos.length,
          events: [outcome === 'closed_success' ? 'case.closed_success' : 'case.closed_fail'],
        },
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx as FieldTxClient,
    )

    return await tx.caseAssignment.findUniqueOrThrow({ where: { id: current.id }, select: assignmentSelect })
  })

  return toActionResult(updated, [outcome === 'closed_success' ? 'case.closed_success' : 'case.closed_fail'])
}
