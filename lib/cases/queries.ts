import { emitAudit } from '@/lib/audit/audit'
import type { RequestMeta } from '@/lib/auth/request-meta'
import type { SessionUser } from '@/lib/auth/types'
import {
  assertCaseEditable,
  assertIdentityFormats,
  assertProductPhotoCapacity,
  caseReadiness,
  isDocumentSlot,
  joinAssetIdentifier,
  splitAssetIdentifier,
  type DebtorNationalityCode,
  type DocumentCounts,
  type DocumentSlot,
} from '@/lib/cases/case'
import { normalizeCaseRef } from '@/lib/cases/case-ref'
import { CaseError } from '@/lib/cases/errors'
import { allowedActionsFrom } from '@/lib/cases/state-machine'
import type {
  CaseCreateInput,
  CaseDocumentUploadInput,
  CaseListQuery,
  CaseUpdateInput,
  CaseAddressInput,
} from '@/lib/cases/schemas'
import type {
  CaseAddressDto,
  CaseDetailDto,
  CaseListItemDto,
  CaseListResultDto,
} from '@/lib/cases/types'
import { Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'

/**
 * ชั้นข้อมูลของโมดูลรับเคส (ไฟล์ 38) — **แยกจาก pure logic** (`lib/cases/case.ts`)
 *
 * - ทุก query กรองด้วย `organization_id` + scope ระดับแถวเสมอ (`02` §2 · Rule 03)
 * - ทุก mutation อยู่ใน `$transaction` เดียวกับ `emitAudit()`
 * - **กันซ้ำ 2 ชั้นตาม `38` §11**: (1) unique index `uniq_cases_company_case_ref` ที่ DB คือของจริง
 *   (2) pre-check ที่นี่มีไว้เพื่อ**ข้อความ + ลิงก์ไปเคสเดิม** เท่านั้น — ชนกันจริงตอน race
 *   จะตกมาที่ P2002 แล้วถูกแปลงเป็น `CASE_REF_DUPLICATE` เหมือนกัน
 */

export interface CaseMutationContext {
  actor: SessionUser
  meta: RequestMeta
  /** `cases` อยู่กลุ่ม "sensitivity ขึ้นกับฟิลด์" — บังคับเฉพาะตอนแตะ snapshot ค่าบริการ (`90` §13) */
  reason?: string
}

/** ชนิด tx ของ client ที่ต่อ extension แล้ว (กับดัก `Prisma.TransactionClient` — REUSE_INDEX 14/08) */
export type CaseTxClient = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>

// ── scope ระดับแถว (`38` §13 · `05` §5) ──────────────────────────────────────

/**
 * ผู้ใช้คนนี้เห็นเคสไหนบ้าง — เพิ่มจาก capability ที่ `withEndpoint()` ตรวจไปแล้ว
 * `global` (system roles) เห็นทุกเคส · ผู้จัดการ/หัวหน้าทีมเห็นเคสของทีมตัวเอง (ที่ระบบเสนอหรือมอบหมายแล้ว) ·
 * company user เห็นเฉพาะบริษัทตัวเอง · Field Agent เห็นเฉพาะเคสที่ตัวเองถือ
 */
export function caseScopeWhere(user: SessionUser): Prisma.CaseWhereInput {
  const scope = user.scope
  switch (scope.kind) {
    case 'global':
      return {}
    case 'team':
      return scope.teamIds.length === 0
        ? { id: { in: [] } }
        : {
            OR: [{ assignedTeamId: { in: [...scope.teamIds] } }, { suggestedTeamId: { in: [...scope.teamIds] } }],
          }
    case 'company':
      return scope.companyId === null ? { id: { in: [] } } : { companyId: scope.companyId }
    case 'self':
      return { assignments: { some: { agentId: scope.userId } } }
  }
}

// ── select / mapper ─────────────────────────────────────────────────────────

const listSelect = {
  id: true,
  caseRef: true,
  trackingRound: true,
  status: true,
  source: true,
  companyId: true,
  debtorName: true,
  addrProvince: true,
  assetDescription: true,
  debtAmountSatang: true,
  createdAt: true,
  company: { select: { name: true } },
  suggestedTeam: { select: { name: true } },
  assignedTeam: { select: { name: true } },
  createdByUser: { select: { fullName: true } },
  _count: { select: { documents: { where: { deletedAt: null } } } },
} as const

export const detailSelect = {
  ...listSelect,
  caseRefNormalized: true,
  debtorNationality: true,
  debtorNationalityOther: true,
  debtorNationalId: true,
  debtorPassportNo: true,
  debtorPhoneMobile: true,
  debtorPhoneWork: true,
  debtorLineId: true,
  debtorFacebook: true,
  addrDistrict: true,
  addrSubdistrict: true,
  addrPostalCode: true,
  addrDetail: true,
  workAddrProvince: true,
  workAddrDistrict: true,
  workAddrSubdistrict: true,
  workAddrPostalCode: true,
  workAddrDetail: true,
  idCardAddrProvince: true,
  idCardAddrDistrict: true,
  idCardAddrSubdistrict: true,
  idCardAddrPostalCode: true,
  idCardAddrDetail: true,
  assetKind: true,
  imei: true,
  serialNo: true,
  assetValueSatang: true,
  projectedRevenueSatang: true,
  projectedRevenueSource: true,
  suggestedTeamId: true,
  assignedTeamId: true,
  teamChangeReason: true,
  serviceFeeTemplateId: true,
  serviceFeeModelSnapshot: true,
  serviceFeeBaseSatang: true,
  serviceFeeRatePct: true,
  serviceFeeBasisSnapshot: true,
  serviceFeeChargeOnFail: true,
  reviewNote: true,
  reviewedAt: true,
  outcome: true,
  closedAt: true,
  updatedAt: true,
  contacts: {
    orderBy: { createdAt: 'asc' },
    select: { id: true, contactName: true, relation: true, phone: true },
  },
  documents: {
    where: { deletedAt: null },
    orderBy: { uploadedAt: 'asc' },
    select: {
      id: true,
      documentType: true,
      fileUrl: true,
      fileHash: true,
      originalName: true,
      mimeType: true,
      sizeBytes: true,
      uploadedAt: true,
      uploadedBy: true,
      uploadedByUser: { select: { fullName: true } },
    },
  },
  editHistory: {
    orderBy: { editedAt: 'desc' },
    select: {
      id: true,
      note: true,
      changedFields: true,
      editedAt: true,
      editedBy: true,
      editedByUser: { select: { fullName: true } },
    },
  },
  recycles: {
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      requestNote: true,
      decisionNote: true,
      status: true,
      previousRound: true,
      newRound: true,
      decidedAt: true,
      createdAt: true,
      decidedByUser: { select: { fullName: true } },
    },
  },
} as const

type CaseListRow = Prisma.CaseGetPayload<{ select: typeof listSelect }>
export type CaseDetailRow = Prisma.CaseGetPayload<{ select: typeof detailSelect }>

function toListDto(row: CaseListRow): CaseListItemDto {
  return {
    id: row.id,
    caseRef: row.caseRef,
    trackingRound: row.trackingRound,
    status: row.status,
    sourceChannel: row.source,
    financeCompanyId: row.companyId,
    financeCompanyName: row.company.name,
    debtorName: row.debtorName,
    province: row.addrProvince,
    assetBrandModel: row.assetDescription,
    outstandingDebtSatang: row.debtAmountSatang,
    suggestedTeamName: row.suggestedTeam?.name ?? null,
    assignedTeamName: row.assignedTeam?.name ?? null,
    documentCount: row._count.documents,
    createdAt: row.createdAt.toISOString(),
    createdByName: row.createdByUser.fullName,
  }
}

function address(
  detail: string | null,
  postalCode: string | null,
  province: string | null,
  district: string | null,
  subdistrict: string | null,
): CaseAddressDto {
  return { detail, postalCode, province, district, subdistrict }
}

function documentCounts(documents: CaseDetailRow['documents']): DocumentCounts {
  const counts: DocumentCounts = {}
  for (const document of documents) {
    if (!isDocumentSlot(document.documentType)) continue
    counts[document.documentType] = (counts[document.documentType] ?? 0) + 1
  }
  return counts
}

export function toDetailDto(row: CaseDetailRow): CaseDetailDto {
  const assetImeiSerial = joinAssetIdentifier(row.imei, row.serialNo)
  return {
    ...toListDto(row),
    caseRefNormalized: row.caseRefNormalized,
    debtorNationality: row.debtorNationality,
    debtorNationalityOther: row.debtorNationalityOther,
    debtorNationalId: row.debtorNationalId,
    debtorPassportNo: row.debtorPassportNo,
    debtorPhoneMobile: row.debtorPhoneMobile,
    debtorPhoneWork: row.debtorPhoneWork,
    debtorLineId: row.debtorLineId,
    debtorFacebook: row.debtorFacebook,
    addressCurrent: address(row.addrDetail, row.addrPostalCode, row.addrProvince, row.addrDistrict, row.addrSubdistrict),
    addressWork: address(
      row.workAddrDetail,
      row.workAddrPostalCode,
      row.workAddrProvince,
      row.workAddrDistrict,
      row.workAddrSubdistrict,
    ),
    addressIdCard: address(
      row.idCardAddrDetail,
      row.idCardAddrPostalCode,
      row.idCardAddrProvince,
      row.idCardAddrDistrict,
      row.idCardAddrSubdistrict,
    ),
    assetType: row.assetKind,
    assetImeiSerial,
    projectedRevenueSatang: row.projectedRevenueSatang,
    projectedRevenueSource: row.projectedRevenueSource,
    suggestedTeamId: row.suggestedTeamId,
    assignedTeamId: row.assignedTeamId,
    teamChangeReason: row.teamChangeReason,
    serviceFeeTemplateId: row.serviceFeeTemplateId,
    serviceFeeModelSnapshot: row.serviceFeeModelSnapshot,
    serviceFeeBaseSatang: row.serviceFeeBaseSatang,
    serviceFeeRatePct: row.serviceFeeRatePct === null ? null : Number(row.serviceFeeRatePct),
    serviceFeeBasisSnapshot: row.serviceFeeBasisSnapshot,
    serviceFeeChargeOnFail: row.serviceFeeChargeOnFail,
    allowedActions: allowedActionsFrom(row.status),
    reviewNote: row.reviewNote,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    outcome: row.outcome,
    closedAt: row.closedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    contacts: row.contacts.map((contact) => ({
      id: contact.id,
      contactName: contact.contactName,
      relationship: contact.relation,
      contactPhone: contact.phone,
    })),
    documents: row.documents
      .filter((document): document is typeof document & { documentType: DocumentSlot } =>
        isDocumentSlot(document.documentType),
      )
      .map((document) => ({
        id: document.id,
        documentType: document.documentType,
        fileUrl: document.fileUrl,
        fileHash: document.fileHash,
        originalName: document.originalName,
        mimeType: document.mimeType,
        sizeBytes: document.sizeBytes,
        uploadedAt: document.uploadedAt.toISOString(),
        uploadedBy: document.uploadedBy,
        uploadedByName: document.uploadedByUser.fullName,
      })),
    editHistory: row.editHistory.map((entry) => ({
      id: entry.id,
      note: entry.note,
      changedFields: entry.changedFields,
      editedAt: entry.editedAt.toISOString(),
      editedBy: entry.editedBy,
      editedByName: entry.editedByUser.fullName,
    })),
    recycleHistory: row.recycles.map((recycle) => ({
      id: recycle.id,
      requestNote: recycle.requestNote,
      decisionNote: recycle.decisionNote,
      status: recycle.status,
      previousRound: recycle.previousRound,
      newRound: recycle.newRound,
      decidedAt: recycle.decidedAt?.toISOString() ?? null,
      decidedByName: recycle.decidedByUser?.fullName ?? null,
      createdAt: recycle.createdAt.toISOString(),
    })),
    readiness: caseReadiness(
      {
        caseRef: row.caseRef,
        companyId: row.companyId,
        debtorName: row.debtorName,
        nationality: row.debtorNationality as DebtorNationalityCode | null,
        nationalityOther: row.debtorNationalityOther,
        nationalId: row.debtorNationalId,
        passportNo: row.debtorPassportNo,
        phoneMobile: row.debtorPhoneMobile,
        addrProvince: row.addrProvince,
        addrDetail: row.addrDetail,
        idCardAddrProvince: row.idCardAddrProvince,
        idCardAddrDetail: row.idCardAddrDetail,
        assetKind: row.assetKind,
        assetBrandModel: row.assetDescription,
        assetImeiSerial,
        debtAmountSatang: row.debtAmountSatang,
      },
      documentCounts(row.documents),
    ),
  }
}

// ── อ่าน ────────────────────────────────────────────────────────────────────

export async function listCases(user: SessionUser, query: CaseListQuery): Promise<CaseListResultDto> {
  const where: Prisma.CaseWhereInput = {
    organizationId: user.organizationId,
    deletedAt: null,
    ...caseScopeWhere(user),
    ...(query.status ? { status: query.status } : {}),
    ...(query.source_channel ? { source: query.source_channel } : {}),
    ...(query.finance_company_id ? { companyId: query.finance_company_id } : {}),
    ...(query.province ? { addrProvince: query.province } : {}),
    ...(query.search
      ? {
          OR: [
            { caseRefNormalized: { contains: normalizeCaseRef(query.search) } },
            { debtorName: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  }

  const [total, rows] = await Promise.all([
    prisma.case.count({ where }),
    prisma.case.findMany({
      where,
      select: listSelect,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ])

  return { items: rows.map(toListDto), total, page: query.page, limit: query.limit }
}

/** อ่านเคสเดียว — นอก scope ตอบ `CASE_NOT_FOUND` เหมือนไม่มีเคสนี้ (ไม่ leak ข้ามทีม/ข้ามบริษัท) */
export async function getCase(user: SessionUser, caseId: string): Promise<CaseDetailDto> {
  const row = await prisma.case.findFirst({
    where: { id: caseId, organizationId: user.organizationId, deletedAt: null, ...caseScopeWhere(user) },
    select: detailSelect,
  })
  if (row === null) throw new CaseError('CASE_NOT_FOUND')
  return toDetailDto(row)
}

// ── เขียน ───────────────────────────────────────────────────────────────────

/** ตัวแปลง P2002 (unique index ชั้น DB) → `CASE_REF_DUPLICATE` — ชั้นที่ 1 ของการกันซ้ำ (`38` §11) */
function rethrowDuplicate(error: unknown, caseRef: string): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new CaseError('CASE_REF_DUPLICATE', { context: { caseRef }, detail: String(error.meta?.target ?? '') })
  }
  throw error
}

/** pre-check ชั้นที่ 2 — คืนเคสเดิมเพื่อให้ error มีลิงก์ไปเปิดดูได้ (`38` §11/§12) */
async function assertCaseRefAvailable(
  organizationId: string,
  companyId: string,
  caseRef: string,
  excludeCaseId?: string,
): Promise<void> {
  const normalized = normalizeCaseRef(caseRef)
  const existing = await prisma.case.findFirst({
    where: {
      organizationId,
      companyId,
      caseRefNormalized: normalized,
      // ไม่กรอง `deleted_at` — unique index ระดับ DB ไม่ partial ⇒ เคสที่ถูกลบยังจองเลขไว้ (ดู migration 2.2)
      ...(excludeCaseId ? { id: { not: excludeCaseId } } : {}),
    },
    select: { id: true, caseRef: true, status: true, trackingRound: true },
  })
  if (existing !== null) {
    throw new CaseError('CASE_REF_DUPLICATE', {
      context: {
        existingCase: {
          id: existing.id,
          caseRef: existing.caseRef,
          status: existing.status,
          trackingRound: existing.trackingRound,
        },
      },
    })
  }
}

async function assertCompanyUsable(organizationId: string, companyId: string): Promise<void> {
  const company = await prisma.financeCompany.findFirst({
    where: { id: companyId, organizationId, deletedAt: null },
    select: { status: true },
  })
  if (company === null) throw new CaseError('COMPANY_NOT_FOUND')
  // `10` §7 — บริษัทที่ถูกระงับรับเคสใหม่ไม่ได้ (`24` §6.1 `SUSPENDED_COMPANY_NEW_CASE`)
  if (company.status !== 'active') throw new CaseError('SUSPENDED_COMPANY_NEW_CASE')
}

function addressColumns(prefix: '' | 'work' | 'idCard', value: CaseAddressInput | undefined) {
  const map = {
    '': {
      detail: 'addrDetail',
      postalCode: 'addrPostalCode',
      province: 'addrProvince',
      district: 'addrDistrict',
      subdistrict: 'addrSubdistrict',
    },
    work: {
      detail: 'workAddrDetail',
      postalCode: 'workAddrPostalCode',
      province: 'workAddrProvince',
      district: 'workAddrDistrict',
      subdistrict: 'workAddrSubdistrict',
    },
    idCard: {
      detail: 'idCardAddrDetail',
      postalCode: 'idCardAddrPostalCode',
      province: 'idCardAddrProvince',
      district: 'idCardAddrDistrict',
      subdistrict: 'idCardAddrSubdistrict',
    },
  }[prefix]

  if (value === undefined) return {}
  return {
    [map.detail]: value.detail ?? null,
    [map.postalCode]: value.postalCode ?? null,
    [map.province]: value.province ?? null,
    [map.district]: value.district ?? null,
    [map.subdistrict]: value.subdistrict ?? null,
  }
}

/** payload ที่ลง audit — ค่าที่ผู้ใช้กรอกจริง ไม่ใช่ทั้งแถว (`90` §6.2) */
function toCaseAuditPayload(input: CaseCreateInput | CaseUpdateInput): Record<string, unknown> {
  const { contacts, ...rest } = input
  return { ...rest, contactCount: contacts?.length ?? 0 }
}

export async function createCase(
  input: CaseCreateInput,
  context: CaseMutationContext,
): Promise<CaseDetailDto> {
  const organizationId = context.actor.organizationId

  await assertCompanyUsable(organizationId, input.financeCompanyId)
  assertIdentityFormats({
    nationality: input.debtorNationality ?? null,
    nationalId: input.debtorNationalId ?? null,
    phoneMobile: input.debtorPhoneMobile ?? null,
    phoneWork: input.debtorPhoneWork ?? null,
    contactPhones: input.contacts?.map((contact) => contact.contactPhone),
  })
  await assertCaseRefAvailable(organizationId, input.financeCompanyId, input.caseRef)

  const identifier = splitAssetIdentifier(input.assetImeiSerial)

  try {
    return await prisma.$transaction(async (tx) => {
      const created = await tx.case.create({
        data: {
          organizationId,
          caseRef: input.caseRef,
          caseRefNormalized: normalizeCaseRef(input.caseRef),
          companyId: input.financeCompanyId,
          source: input.sourceChannel,
          status: 'draft',
          debtorName: input.debtorName ?? null,
          debtorNationality: input.debtorNationality ?? null,
          debtorNationalityOther: input.debtorNationalityOther ?? null,
          debtorNationalId: input.debtorNationalId ?? null,
          debtorPassportNo: input.debtorPassportNo ?? null,
          debtorPhoneMobile: input.debtorPhoneMobile ?? null,
          debtorPhoneWork: input.debtorPhoneWork ?? null,
          debtorLineId: input.debtorLineId ?? null,
          debtorFacebook: input.debtorFacebook ?? null,
          ...addressColumns('', input.addressCurrent),
          ...addressColumns('work', input.addressWork),
          ...addressColumns('idCard', input.addressIdCard),
          assetKind: input.assetType ?? null,
          assetDescription: input.assetBrandModel ?? null,
          imei: identifier.imei,
          serialNo: identifier.serialNo,
          debtAmountSatang: input.outstandingDebtSatang ?? null,
          createdBy: context.actor.id,
          contacts:
            input.contacts && input.contacts.length > 0
              ? {
                  create: input.contacts.map((contact) => ({
                    organizationId,
                    contactName: contact.contactName,
                    relation: contact.relationship,
                    phone: contact.contactPhone,
                    createdBy: context.actor.id,
                  })),
                }
              : undefined,
        },
        select: detailSelect,
      })

      await emitAudit(
        {
          organizationId,
          actorId: context.actor.id,
          actorRole: context.actor.roleName,
          action: 'create',
          targetType: 'cases',
          targetId: created.id,
          after: toCaseAuditPayload(input),
          reason: context.reason,
          ipAddress: context.meta.ipAddress,
          userAgent: context.meta.userAgent,
        },
        tx as CaseTxClient,
      )

      return toDetailDto(created)
    })
  } catch (error) {
    rethrowDuplicate(error, input.caseRef)
  }
}

/** ฟิลด์ที่เปลี่ยนจริงในการแก้ครั้งนี้ — ใช้ทั้ง `case_edit_history.changed_fields` และ audit */
function changedFieldsOf(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  return Object.keys(after).filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
}

/**
 * แก้ไขเคส (`38` §8) — ใช้ได้เฉพาะสถานะ draft/pending_review/need_info
 * ทุกครั้งที่แก้สำเร็จต้องเพิ่มแถวใน `case_edit_history` **ไม่เขียนทับของเดิม** (`38` §6.4/§14)
 */
export async function updateCase(
  user: SessionUser,
  caseId: string,
  input: CaseUpdateInput,
  context: CaseMutationContext,
): Promise<CaseDetailDto> {
  const organizationId = context.actor.organizationId
  const current = await prisma.case.findFirst({
    where: { id: caseId, organizationId, deletedAt: null, ...caseScopeWhere(user) },
    select: detailSelect,
  })
  if (current === null) throw new CaseError('CASE_NOT_FOUND')
  assertCaseEditable(current.status)

  const { editNote, ...values } = input
  const companyId = values.financeCompanyId ?? current.companyId
  if (values.financeCompanyId !== undefined && values.financeCompanyId !== current.companyId) {
    await assertCompanyUsable(organizationId, values.financeCompanyId)
  }
  assertIdentityFormats({
    nationality: values.debtorNationality ?? (current.debtorNationality as DebtorNationalityCode | null),
    nationalId: values.debtorNationalId,
    phoneMobile: values.debtorPhoneMobile,
    phoneWork: values.debtorPhoneWork,
    contactPhones: values.contacts?.map((contact) => contact.contactPhone),
  })
  if (values.caseRef !== undefined || values.financeCompanyId !== undefined) {
    await assertCaseRefAvailable(organizationId, companyId, values.caseRef ?? current.caseRef, caseId)
  }

  const identifier =
    values.assetImeiSerial === undefined ? undefined : splitAssetIdentifier(values.assetImeiSerial)

  const beforePayload = {
    caseRef: current.caseRef,
    financeCompanyId: current.companyId,
    debtorName: current.debtorName,
    debtorNationality: current.debtorNationality,
    debtorNationalityOther: current.debtorNationalityOther,
    debtorNationalId: current.debtorNationalId,
    debtorPassportNo: current.debtorPassportNo,
    debtorPhoneMobile: current.debtorPhoneMobile,
    debtorPhoneWork: current.debtorPhoneWork,
    debtorLineId: current.debtorLineId,
    debtorFacebook: current.debtorFacebook,
    assetType: current.assetKind,
    assetBrandModel: current.assetDescription,
    assetImeiSerial: joinAssetIdentifier(current.imei, current.serialNo),
    outstandingDebtSatang: current.debtAmountSatang,
    addressCurrent: address(
      current.addrDetail,
      current.addrPostalCode,
      current.addrProvince,
      current.addrDistrict,
      current.addrSubdistrict,
    ),
    addressWork: address(
      current.workAddrDetail,
      current.workAddrPostalCode,
      current.workAddrProvince,
      current.workAddrDistrict,
      current.workAddrSubdistrict,
    ),
    addressIdCard: address(
      current.idCardAddrDetail,
      current.idCardAddrPostalCode,
      current.idCardAddrProvince,
      current.idCardAddrDistrict,
      current.idCardAddrSubdistrict,
    ),
    contactCount: current.contacts.length,
  }
  const afterPayload: Record<string, unknown> = { ...beforePayload, ...toCaseAuditPayload(values) }
  const changedFields = changedFieldsOf(beforePayload, afterPayload)

  try {
    return await prisma.$transaction(async (tx) => {
      const updated = await tx.case.update({
        where: { id: caseId },
        data: {
          ...(values.caseRef === undefined
            ? {}
            : { caseRef: values.caseRef, caseRefNormalized: normalizeCaseRef(values.caseRef) }),
          ...(values.financeCompanyId === undefined ? {} : { companyId: values.financeCompanyId }),
          ...(values.debtorName === undefined ? {} : { debtorName: values.debtorName }),
          ...(values.debtorNationality === undefined ? {} : { debtorNationality: values.debtorNationality }),
          ...(values.debtorNationalityOther === undefined
            ? {}
            : { debtorNationalityOther: values.debtorNationalityOther }),
          ...(values.debtorNationalId === undefined ? {} : { debtorNationalId: values.debtorNationalId }),
          ...(values.debtorPassportNo === undefined ? {} : { debtorPassportNo: values.debtorPassportNo }),
          ...(values.debtorPhoneMobile === undefined ? {} : { debtorPhoneMobile: values.debtorPhoneMobile }),
          ...(values.debtorPhoneWork === undefined ? {} : { debtorPhoneWork: values.debtorPhoneWork }),
          ...(values.debtorLineId === undefined ? {} : { debtorLineId: values.debtorLineId }),
          ...(values.debtorFacebook === undefined ? {} : { debtorFacebook: values.debtorFacebook }),
          ...addressColumns('', values.addressCurrent),
          ...addressColumns('work', values.addressWork),
          ...addressColumns('idCard', values.addressIdCard),
          ...(values.assetType === undefined ? {} : { assetKind: values.assetType }),
          ...(values.assetBrandModel === undefined ? {} : { assetDescription: values.assetBrandModel }),
          ...(identifier === undefined ? {} : { imei: identifier.imei, serialNo: identifier.serialNo }),
          ...(values.outstandingDebtSatang === undefined
            ? {}
            : { debtAmountSatang: values.outstandingDebtSatang }),
          updatedBy: context.actor.id,
        },
        select: detailSelect,
      })

      if (values.contacts !== undefined) {
        await tx.caseContact.deleteMany({ where: { caseId } })
        if (values.contacts.length > 0) {
          await tx.caseContact.createMany({
            data: values.contacts.map((contact) => ({
              organizationId,
              caseId,
              contactName: contact.contactName,
              relation: contact.relationship,
              phone: contact.contactPhone,
              createdBy: context.actor.id,
            })),
          })
        }
      }

      // `38` §6.4 — append-only ทุกครั้งที่แก้ ไม่ว่าจะแก้ field ไหน
      await tx.caseEditHistory.create({
        data: {
          organizationId,
          caseId,
          note: editNote ?? null,
          changedFields,
          editedBy: context.actor.id,
        },
      })

      await emitAudit(
        {
          organizationId,
          actorId: context.actor.id,
          actorRole: context.actor.roleName,
          action: 'update',
          targetType: 'cases',
          targetId: caseId,
          before: beforePayload,
          after: afterPayload,
          reason: context.reason,
          ipAddress: context.meta.ipAddress,
          userAgent: context.meta.userAgent,
        },
        tx as CaseTxClient,
      )

      const refreshed =
        values.contacts === undefined
          ? updated
          : ((await tx.case.findUniqueOrThrow({ where: { id: caseId }, select: detailSelect })) as typeof updated)
      return toDetailDto(refreshed)
    })
  } catch (error) {
    rethrowDuplicate(error, values.caseRef ?? current.caseRef)
  }
}

/** อัปโหลดเอกสารต่อ slot (`38` §6.3) — 1 ไฟล์ = 1 แถว, slot เดียวมีหลายไฟล์ได้ */
export async function addCaseDocument(
  user: SessionUser,
  caseId: string,
  input: CaseDocumentUploadInput,
  context: CaseMutationContext,
): Promise<CaseDetailDto> {
  const organizationId = context.actor.organizationId
  const current = await prisma.case.findFirst({
    where: { id: caseId, organizationId, deletedAt: null, ...caseScopeWhere(user) },
    select: { id: true, status: true, documents: { where: { deletedAt: null }, select: { documentType: true } } },
  })
  if (current === null) throw new CaseError('CASE_NOT_FOUND')
  assertCaseEditable(current.status)

  if (input.documentType === 'product_photo') {
    const existing = current.documents.filter((document) => document.documentType === 'product_photo').length
    assertProductPhotoCapacity(existing)
  }

  return await prisma.$transaction(async (tx) => {
    const document = await tx.caseDocument.create({
      data: {
        organizationId,
        caseId,
        documentType: input.documentType,
        fileUrl: input.fileUrl,
        fileHash: input.fileHash,
        originalName: input.originalName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        uploadedBy: context.actor.id,
      },
      select: { id: true },
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'create',
        targetType: 'case_documents',
        targetId: document.id,
        after: {
          caseId,
          documentType: input.documentType,
          fileHash: input.fileHash,
          originalName: input.originalName,
          sizeBytes: input.sizeBytes,
        },
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
      },
      tx as CaseTxClient,
    )

    const refreshed = await tx.case.findUniqueOrThrow({ where: { id: caseId }, select: detailSelect })
    return toDetailDto(refreshed)
  })
}
