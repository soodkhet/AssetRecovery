import type { AuditAction } from '@/lib/generated/prisma/enums'
import { emitAudit } from '@/lib/audit/audit'
import { AuthError } from '@/lib/auth/errors'
import { hasCapability } from '@/lib/auth/permission'
import type { SessionUser } from '@/lib/auth/types'
import { caseReadiness, type DebtorNationalityCode, type DocumentCounts, type DocumentSlot } from '@/lib/cases/case'
import { isDocumentSlot } from '@/lib/cases/case'
import { CaseError } from '@/lib/cases/errors'
import { calculateProjectedRevenue } from '@/lib/cases/projected-revenue'
import {
  caseScopeWhere,
  detailSelect,
  toDetailDto,
  type CaseDetailRow,
  type CaseMutationContext,
  type CaseTxClient,
} from '@/lib/cases/queries'
import type { CaseStatusChangeInput } from '@/lib/cases/schemas'
import {
  assertStatusChange,
  CASE_ACTION_CAPABILITIES,
  CASE_STATUS_RULES,
  caseEventsFor,
  type CaseStatusAction,
} from '@/lib/cases/state-machine'
import { suggestTeam, type TeamCoverage, type TeamSuggestionResult } from '@/lib/cases/team-suggestion'
import type { CaseDetailDto, CaseTeamSuggestionDto } from '@/lib/cases/types'
import type { Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'

/**
 * State machine + routing + recycle ของโมดูลรับเคส (ไฟล์ 38 §6.5, §6.6, §8–10)
 * — ชั้น DB · pure logic อยู่ที่ `state-machine.ts` / `team-suggestion.ts` / `projected-revenue.ts`
 *
 * กติกาที่บังคับที่นี่:
 * - **snapshot ค่าบริการเกิดตอน `approved` เท่านั้น** (`10` §9.2) — แก้เทมเพลตทีหลังไม่กระทบเคสที่ approve แล้ว
 * - ทุก transition อยู่ใน `$transaction` เดียวกับ `emitAudit()` (Rule 03)
 * - capability ต่อ action ตาม `38` §13 (`accept`/`reject`/`request_more_info` + recycle = Case Approver เท่านั้น)
 */

// ── โหลดข้อมูลประกอบ ────────────────────────────────────────────────────────

async function loadCaseInScope(user: SessionUser, caseId: string): Promise<CaseDetailRow> {
  const row = await prisma.case.findFirst({
    where: { id: caseId, organizationId: user.organizationId, deletedAt: null, ...caseScopeWhere(user) },
    select: detailSelect,
  })
  if (row === null) throw new CaseError('CASE_NOT_FOUND')
  return row
}

async function loadTeams(organizationId: string): Promise<TeamCoverage[]> {
  return await prisma.team.findMany({
    where: { organizationId, deletedAt: null },
    select: { id: true, name: true, provinces: true, status: true },
  })
}

interface CompanyTemplate {
  templateId: string
  templateName: string
  templateVersion: number
  model: 'SUCCESS_FEE' | 'FLAT' | 'HYBRID'
  baseSatang: number
  ratePct: number
  basis: 'debt_amount' | 'asset_value' | null
  chargeOnFail: boolean
}

/** เทมเพลตค่าบริการปัจจุบันของบริษัทไฟแนนซ์ (`10` §9 — ทุกบริษัทต้องผูกไว้เสมอ) */
async function loadCompanyTemplate(organizationId: string, companyId: string): Promise<CompanyTemplate> {
  const company = await prisma.financeCompany.findFirst({
    where: { id: companyId, organizationId, deletedAt: null },
    select: {
      serviceFeeTemplate: {
        select: {
          id: true,
          name: true,
          version: true,
          model: true,
          baseSatang: true,
          ratePct: true,
          basis: true,
          chargeOnFail: true,
        },
      },
    },
  })
  if (company === null) throw new CaseError('COMPANY_NOT_FOUND')
  const template = company.serviceFeeTemplate
  if (template === null) throw new CaseError('TEMPLATE_NOT_FOUND', { context: { companyId } })
  return {
    templateId: template.id,
    templateName: template.name,
    templateVersion: template.version,
    model: template.model,
    baseSatang: template.baseSatang,
    ratePct: Number(template.ratePct),
    basis: template.basis,
    chargeOnFail: template.chargeOnFail,
  }
}

function documentCountsOf(documents: CaseDetailRow['documents']): DocumentCounts {
  const counts: DocumentCounts = {}
  for (const document of documents) {
    if (!isDocumentSlot(document.documentType)) continue
    const slot: DocumentSlot = document.documentType
    counts[slot] = (counts[slot] ?? 0) + 1
  }
  return counts
}

function readinessOf(row: CaseDetailRow) {
  return caseReadiness(
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
      assetImeiSerial: row.imei ?? row.serialNo,
      debtAmountSatang: row.debtAmountSatang,
    },
    documentCountsOf(row.documents),
  )
}

// ── Team suggestion (`38` §6.4 · §7.4 · §17.1) ──────────────────────────────

export async function getCaseTeamSuggestion(user: SessionUser, caseId: string): Promise<CaseTeamSuggestionDto> {
  const row = await loadCaseInScope(user, caseId)
  const teams = await loadTeams(user.organizationId)
  const suggestion = suggestTeam(row.addrProvince, teams)
  return { ...suggestion, savedSuggestedTeamId: row.suggestedTeamId }
}

// ── เปลี่ยนสถานะ (`38` §8–10 · `45` §6.1) ────────────────────────────────────

/** map action → action ของ audit (`02` §3 enum `audit_action`) */
function auditActionOf(action: CaseStatusAction): AuditAction {
  if (action === 'accept' || action === 'approve_recycle') return 'approve'
  if (action === 'reject' || action === 'reject_recycle') return 'reject'
  return 'status_change'
}

function assertActionAllowed(user: SessionUser, action: CaseStatusAction): void {
  const capabilities = CASE_ACTION_CAPABILITIES[action]
  const allowed = capabilities.some((capability) => hasCapability(user, 'manage', capability))
  if (!allowed) throw new AuthError('PERMISSION_DENIED', `case action "${action}"`)
}

/** ใช้ unchecked เพื่อเขียน FK เป็นคอลัมน์ตรง ๆ (`assignedTeamId`/`serviceFeeTemplateId`) */
type CaseUpdateData = Prisma.CaseUncheckedUpdateInput

export interface CaseStatusChangeResult {
  case: CaseDetailDto
  /** ทีมที่ระบบเสนอ ณ เวลานั้น — `null` เมื่อ action นี้ไม่แตะ routing */
  suggestion: TeamSuggestionResult | null
}

/**
 * `PATCH /api/cases/:id/status` — ทางเดียวที่สถานะเคสฝั่งรับเคสเปลี่ยนได้
 *
 * ลำดับ: โหลดเคสตาม scope → capability ต่อ action → ยาม state machine (`38` §10/§12) →
 * gate ความครบถ้วนตอน `review` (`38` §9) → เตรียมค่าที่ต้องเขียน → `$transaction` (case + recycle + audit)
 */
export async function changeCaseStatus(
  user: SessionUser,
  caseId: string,
  input: CaseStatusChangeInput,
  context: CaseMutationContext,
): Promise<CaseStatusChangeResult> {
  const organizationId = context.actor.organizationId
  const row = await loadCaseInScope(user, caseId)
  const action = input.action
  assertActionAllowed(user, action)

  const reason = input.reason?.trim() ?? ''
  const teamChangeReason = input.teamChangeReason?.trim() ?? ''

  // routing: `review` คำนวณทีมที่เสนอ · `accept` ยืนยัน/เปลี่ยนทีมของผู้พิจารณา (`38` §6.4 · §11)
  const needsRouting = action === 'review' || action === 'accept'
  const suggestion = needsRouting ? suggestTeam(row.addrProvince, await loadTeams(organizationId)) : null

  const confirmedTeamId =
    action === 'accept' ? (input.teamId ?? row.suggestedTeamId ?? suggestion?.suggestedTeamId ?? null) : null
  const teamChanged =
    action === 'accept' &&
    confirmedTeamId !== null &&
    confirmedTeamId !== (row.suggestedTeamId ?? suggestion?.suggestedTeamId ?? null)

  const nextStatus = assertStatusChange(row.status, action, {
    hasReason: reason !== '',
    teamChanged,
    hasTeamChangeReason: teamChangeReason !== '',
  })

  // `38` §9 — ข้อมูล required + เอกสาร required ต้องครบก่อนขึ้น `pending_review`
  if (CASE_STATUS_RULES[action].requiresReadiness) {
    const readiness = readinessOf(row)
    if (readiness.missingDocuments.length > 0) {
      throw new CaseError('CASE_DOCUMENT_INCOMPLETE', { context: { missing: readiness.missingDocuments } })
    }
    if (readiness.missingFields.length > 0) {
      throw new CaseError('REQUIRED_MISSING', { context: { missingFields: readiness.missingFields } })
    }
  }

  const data: CaseUpdateData = { status: nextStatus, updatedBy: context.actor.id }
  const auditAfter: Record<string, unknown> = { status: nextStatus, action }
  const auditBefore: Record<string, unknown> = { status: row.status }
  let auditReason: string | null = reason === '' ? null : reason

  // ── ประมาณการรายได้ (`38` §6.5) — ค่าประมาณ best-case คำนวณใหม่ทุกครั้งที่แตะ routing
  if (needsRouting) {
    const template = await loadCompanyTemplate(organizationId, row.companyId)
    const projected = calculateProjectedRevenue(template, {
      debtAmountSatang: row.debtAmountSatang,
      assetValueSatang: row.assetValueSatang,
    })
    data.projectedRevenueSatang = projected.amountSatang
    data.projectedRevenueSource = projected.source
    auditBefore.projectedRevenueSatang = row.projectedRevenueSatang
    auditAfter.projectedRevenueSatang = projected.amountSatang

    if (action === 'review') {
      data.suggestedTeamId = suggestion?.suggestedTeamId ?? null
      auditBefore.suggestedTeamId = row.suggestedTeamId
      auditAfter.suggestedTeamId = suggestion?.suggestedTeamId ?? null
    }

    if (action === 'accept') {
      // ต้องมีทีมยืนยันเสมอ — ไม่มีทีมตรงจังหวัดและผู้พิจารณาไม่ได้เลือกเอง = `CASE_NO_TEAM_MATCH` (`38` §12)
      if (confirmedTeamId === null) {
        throw new CaseError('CASE_NO_TEAM_MATCH', { context: { province: row.addrProvince } })
      }
      const team = await prisma.team.findFirst({
        where: { id: confirmedTeamId, organizationId, deletedAt: null, status: 'active' },
        select: { id: true },
      })
      if (team === null) throw new CaseError('TEAM_NOT_FOUND', { context: { teamId: confirmedTeamId } })

      data.assignedTeamId = confirmedTeamId
      data.reviewedBy = context.actor.id
      data.reviewedAt = new Date()
      data.reviewNote = reason === '' ? null : reason
      if (teamChanged) data.teamChangeReason = teamChangeReason
      auditBefore.assignedTeamId = row.assignedTeamId
      auditAfter.assignedTeamId = confirmedTeamId
      auditAfter.teamChanged = teamChanged

      // **snapshot ค่าบริการตอน approved** (`10` §9.2) — ตัวเลขจริงลงที่เคส ไม่ใช่แค่ template_id
      Object.assign(data, serviceFeeSnapshotData(template))
      Object.assign(auditBefore, serviceFeeSnapshotAudit(row))
      Object.assign(auditAfter, serviceFeeSnapshotData(template))
      auditReason = auditReason ?? snapshotReason(template.templateName, template.templateVersion)
    }
  }

  if (action === 'reject' || action === 'request_more_info') {
    data.reviewedBy = context.actor.id
    data.reviewedAt = new Date()
    data.reviewNote = reason
  }

  // ── Recycle (`38` §6.6) ───────────────────────────────────────────────────
  let recycleTemplate: CompanyTemplate | null = null
  if (action === 'approve_recycle') {
    data.trackingRound = row.trackingRound + 1
    // เคสกลับเข้า pipeline รอบใหม่ — ผลปิดงานรอบก่อนหน้าเก็บไว้ที่ `recycle_requests` + audit แล้ว
    // (ทีมที่ดูแลคงไว้ตามเดิม — การมอบหมายพนักงานรอบใหม่เป็นงานของไฟล์ 40 `ready_to_assign`)
    data.outcome = null
    data.closedAt = null
    auditBefore.trackingRound = row.trackingRound
    auditAfter.trackingRound = row.trackingRound + 1
    auditBefore.outcome = row.outcome

    // แต่ละรอบคิดค่าบริการอิสระ (A3 `charge_per_tracking_round`) ⇒ snapshot ใหม่ที่จุด approved ของรอบนี้
    recycleTemplate = await loadCompanyTemplate(organizationId, row.companyId)
    Object.assign(data, serviceFeeSnapshotData(recycleTemplate))
    Object.assign(auditBefore, serviceFeeSnapshotAudit(row))
    Object.assign(auditAfter, serviceFeeSnapshotData(recycleTemplate))
    const projected = calculateProjectedRevenue(recycleTemplate, {
      debtAmountSatang: row.debtAmountSatang,
      assetValueSatang: row.assetValueSatang,
    })
    data.projectedRevenueSatang = projected.amountSatang
    data.projectedRevenueSource = projected.source
    auditReason = auditReason ?? snapshotReason(recycleTemplate.templateName, recycleTemplate.templateVersion)
  }

  const events = caseEventsFor(action)
  auditAfter.events = events

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.case.update({ where: { id: caseId }, data, select: detailSelect })

    if (action === 'create_recycle_request') {
      await tx.recycleRequest.create({
        data: { organizationId, caseId, status: 'pending', requestNote: reason, createdBy: context.actor.id },
      })
    }

    if (action === 'approve_recycle' || action === 'reject_recycle') {
      const pending = await tx.recycleRequest.findFirst({
        where: { caseId, organizationId, status: 'pending' },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      })
      // ไม่มีคำขอค้าง = ข้อมูลไม่สอดคล้องกับสถานะ `pending_recycle_review` → ให้ transaction ล้มทั้งก้อน
      if (pending === null) throw new CaseError('CASE_RECYCLE_INVALID_STATUS', { context: { caseId } })

      await tx.recycleRequest.update({
        where: { id: pending.id },
        data: {
          status: action === 'approve_recycle' ? 'approved' : 'rejected',
          decisionNote: reason === '' ? null : reason,
          decidedBy: context.actor.id,
          decidedAt: new Date(),
          // `38` §6.4 `recycle_history` — เก็บเลขรอบก่อน/หลังเฉพาะตอนอนุมัติ (ไม่อนุมัติ = ไม่เปลี่ยนรอบ)
          ...(action === 'approve_recycle'
            ? { previousRound: row.trackingRound, newRound: row.trackingRound + 1 }
            : {}),
        },
      })
    }

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: auditActionOf(action),
        targetType: 'cases',
        targetId: caseId,
        before: auditBefore,
        after: auditAfter,
        reason: auditReason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx as CaseTxClient,
    )

    return next
  })

  return { case: toDetailDto(updated), suggestion }
}

/** ค่าที่เขียนลงคอลัมน์ snapshot ของเคส (`02` §6 · `10` §9.2) */
function serviceFeeSnapshotData(template: CompanyTemplate) {
  return {
    serviceFeeTemplateId: template.templateId,
    serviceFeeModelSnapshot: template.model,
    serviceFeeBaseSatang: template.baseSatang,
    serviceFeeRatePct: template.ratePct,
    serviceFeeBasisSnapshot: template.basis,
    serviceFeeChargeOnFail: template.chargeOnFail,
  }
}

function serviceFeeSnapshotAudit(row: CaseDetailRow) {
  return {
    serviceFeeTemplateId: row.serviceFeeTemplateId,
    serviceFeeModelSnapshot: row.serviceFeeModelSnapshot,
    serviceFeeBaseSatang: row.serviceFeeBaseSatang,
    serviceFeeRatePct: row.serviceFeeRatePct === null ? null : Number(row.serviceFeeRatePct),
    serviceFeeBasisSnapshot: row.serviceFeeBasisSnapshot,
    serviceFeeChargeOnFail: row.serviceFeeChargeOnFail,
  }
}

/**
 * `90` §13 บังคับ `reason` เมื่อ audit แตะฟิลด์ snapshot ค่าบริการ (หมวด money ใน `reason-policy.ts`)
 * แต่ `38` ไม่ได้บังคับให้ผู้พิจารณากรอกเหตุผลตอน "รับเคส" — การ snapshot เป็นผลอัตโนมัติตามสเปค
 * จึงเติมเหตุผลเชิงระบบที่ระบุ template/version ที่ใช้ (ยัง trace กลับได้ว่าใช้เงื่อนไขไหน)
 */
function snapshotReason(templateName: string, version: number): string {
  return `snapshot ค่าบริการอัตโนมัติตอนอนุมัติเคส — เทมเพลต "${templateName}" v${version} (\`10\` §9.2)`
}
