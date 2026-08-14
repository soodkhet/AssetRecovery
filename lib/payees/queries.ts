import type { ApiWarning } from '@/lib/api/envelope'
import { emitAudit } from '@/lib/audit/audit'
import { hasCapability } from '@/lib/auth/permission'
import type { RequestMeta } from '@/lib/auth/request-meta'
import type { SessionUser } from '@/lib/auth/types'
import { Prisma } from '@/lib/generated/prisma/client'
import {
  assertPayeeNationalId,
  assertPayeeReadyForVerification,
  checkBankAccountName,
  maskAccountNumber,
  missingFieldsForVerification,
  normalizePayeeValues,
  shouldResetVerification,
  toPayeeAuditPayload,
  type PayeeValues,
} from '@/lib/payees/payee'
import { PayeeError } from '@/lib/payees/errors'
import type { PayeeFieldsInput, PayeeListQuery } from '@/lib/payees/schemas'
import type { PayeeDto } from '@/lib/payees/types'
import { prisma } from '@/lib/prisma'
import { getFinancePolicy } from '@/lib/settings/queries/finance-policy'
import { SettingsError } from '@/lib/settings/errors'

/**
 * ผู้รับเงิน (Payee Profile) — ชั้น DB (ไฟล์ 18)
 *
 * - **scope**: ผู้ถือ `manage:manage_payee_profile` (การเงิน) เห็นทุกราย · ผู้ถือแค่ `view`
 *   (พนักงานภาคสนาม — `25` §7.2) เห็น**เฉพาะของตัวเอง** และได้เลขบัญชีแบบปิดบัง
 * - **ทุก mutation อยู่ใน `$transaction` เดียวกับ `emitAudit()` พร้อม `reason`** — `payee_profiles`
 *   อยู่หมวด `bank` ของ `reason-policy` (`18` §13)
 * - **auto-reset unverified** เมื่อแก้ธนาคาร/ภาษี — เงื่อนไขอยู่ที่ `lib/payees/payee.ts` ที่เดียว
 *
 * ⚠️ payee โครงเปล่าถูกสร้างให้พนักงานอัตโนมัติแล้วโดย `ensureAgentPayeeId()` (Phase 2.9) ตอนปิดงาน
 * เคสแรก — `POST /api/payees` จึงใช้กับผู้รับเงินที่ยังไม่เคยมีรายการเบิกเท่านั้น
 */

export const MANAGE_PAYEE_PROFILE = 'manage_payee_profile'

export interface PayeeMutationContext {
  actor: SessionUser
  meta: RequestMeta
  reason: string
}

const TARGET = 'payee_profiles'

const payeeSelect = {
  id: true,
  userId: true,
  payeeType: true,
  taxProfileId: true,
  nationalId: true,
  bankName: true,
  accountName: true,
  accountNumber: true,
  idDocumentUrl: true,
  isVerified: true,
  verifiedAt: true,
  updatedAt: true,
  user: { select: { fullName: true, role: { select: { name: true } }, team: { select: { name: true } } } },
  taxProfile: { select: { id: true, name: true, whtPct: true } },
  verifiedByUser: { select: { fullName: true } },
} as const

type PayeeRow = Prisma.PayeeProfileGetPayload<{ select: typeof payeeSelect }>

function toValues(row: PayeeRow): PayeeValues {
  return {
    payeeType: row.payeeType,
    taxProfileId: row.taxProfileId,
    nationalId: row.nationalId,
    bankName: row.bankName,
    accountName: row.accountName,
    accountNumber: row.accountNumber,
    idDocumentUrl: row.idDocumentUrl,
  }
}

/** `canSeeFullAccount` = ผู้ถือสิทธิ์ `manage` เท่านั้น (เลขบัญชีเต็มคือข้อมูลที่โอนเงินได้จริง) */
function toDto(row: PayeeRow, canSeeFullAccount: boolean): PayeeDto {
  const values = toValues(row)
  return {
    id: row.id,
    userId: row.userId,
    name: row.user.fullName,
    teamName: row.user.team?.name ?? null,
    roleName: row.user.role.name,
    payeeType: row.payeeType,
    taxProfileId: row.taxProfileId,
    taxProfileName: row.taxProfile?.name ?? null,
    whtPct: row.taxProfile === null ? null : row.taxProfile.whtPct.toNumber(),
    nationalId: row.nationalId,
    bankName: row.bankName,
    accountName: row.accountName,
    accountNumber: canSeeFullAccount ? row.accountNumber : null,
    accountNumberMasked: maskAccountNumber(row.accountNumber),
    idDocumentUrl: row.idDocumentUrl,
    isVerified: row.isVerified,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    verifiedByName: row.verifiedByUser?.fullName ?? null,
    bankAccountNameMatches: checkBankAccountName(row.user.fullName, row.accountName).matches,
    missingForVerification: missingFieldsForVerification(values),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function canManage(user: SessionUser): boolean {
  return hasCapability(user, 'manage', MANAGE_PAYEE_PROFILE)
}

/**
 * ตัวกรอง scope ระดับแถว — **แยกออกจาก filter ของผู้เรียกด้วย `AND` เสมอ**
 * (กับดักที่ commit `f188619` แก้ไว้: ผู้เรียกส่ง filter มาเองแล้วทับ scope ได้)
 */
function scopeFilter(user: SessionUser): Prisma.PayeeProfileWhereInput {
  return canManage(user) ? {} : { userId: user.id }
}

export async function listPayees(user: SessionUser, query: PayeeListQuery): Promise<PayeeDto[]> {
  const search = query.search?.trim() ?? ''
  const rows = await prisma.payeeProfile.findMany({
    where: {
      AND: [
        { organizationId: user.organizationId, deletedAt: null },
        scopeFilter(user),
        query.status === 'all' ? {} : { isVerified: query.status === 'verified' },
        search === ''
          ? {}
          : {
              OR: [
                { user: { fullName: { contains: search, mode: 'insensitive' } } },
                { nationalId: { contains: search.replace(/[\s-]/g, '') } },
                { accountNumber: { contains: search.replace(/[\s-]/g, '') } },
              ],
            },
      ],
    },
    select: payeeSelect,
    orderBy: [{ isVerified: 'asc' }, { user: { fullName: 'asc' } }],
    take: 500,
  })
  const full = canManage(user)
  return rows.map((row) => toDto(row, full))
}

async function findPayeeRow(user: SessionUser, payeeId: string): Promise<PayeeRow> {
  const row = await prisma.payeeProfile.findFirst({
    where: { AND: [{ id: payeeId, organizationId: user.organizationId, deletedAt: null }, scopeFilter(user)] },
    select: payeeSelect,
  })
  if (row === null) throw new PayeeError('PAYEE_NOT_FOUND', { detail: `payee=${payeeId}` })
  return row
}

export async function getPayee(user: SessionUser, payeeId: string): Promise<PayeeDto> {
  return toDto(await findPayeeRow(user, payeeId), canManage(user))
}

/** Tax Profile ที่ผูกต้องมีจริงและยังใช้งานอยู่ — ไม่งั้นยอด WHT จะอ้างของที่ถูกปิดไปแล้ว */
async function assertTaxProfileUsable(organizationId: string, taxProfileId: string | null): Promise<void> {
  if (taxProfileId === null) return
  const found = await prisma.taxProfile.findFirst({
    where: { id: taxProfileId, organizationId, deletedAt: null },
    select: { id: true },
  })
  if (found === null) throw new SettingsError('TAX_PROFILE_NOT_FOUND', { detail: `tax_profile=${taxProfileId}` })
}

/** `18` §11 — ชื่อบัญชีไม่ตรงชื่อผู้รับเงิน = **เตือน ไม่ block** (Rule 04) */
function bankNameWarning(payeeName: string, accountName: string | null): ApiWarning | undefined {
  const check = checkBankAccountName(payeeName, accountName)
  if (check.matches) return undefined
  return {
    code: 'BANK_ACCOUNT_NAME_MISMATCH',
    title: 'ชื่อบัญชีไม่ตรงกับชื่อผู้รับเงิน',
    message: `ชื่อบัญชี "${check.accountName}" ไม่ตรงกับ "${check.payeeName}" — ตรวจสอบก่อนยืนยันเพื่อกันโอนผิดบัญชี`,
  }
}

function toWriteData(values: PayeeValues) {
  const normalized = normalizePayeeValues(values)
  return {
    payeeType: normalized.payeeType,
    taxProfileId: normalized.taxProfileId,
    nationalId: assertPayeeNationalId(normalized.nationalId),
    bankName: normalized.bankName,
    accountName: normalized.accountName,
    accountNumber: normalized.accountNumber,
    idDocumentUrl: normalized.idDocumentUrl,
  }
}

export interface PayeeMutationResult {
  payee: PayeeDto
  warning?: ApiWarning
}

/**
 * ผู้ใช้ที่ยังไม่มี Payee Profile — เติม dropdown ของฟอร์ม "เพิ่ม Payee"
 *
 * ตัดกลุ่ม `finance_company` ออก: บริษัทไฟแนนซ์เป็น**ลูกค้าฝั่งรายรับ** ไม่ใช่ผู้ที่เราจ่ายเงินให้
 * (`18` §6.1 — payee = คนที่ AssetRecovery จ่ายค่าตอบแทนให้)
 */
export async function listPayeeCandidates(
  user: SessionUser,
): Promise<Array<{ id: string; fullName: string; teamName: string | null; roleName: string }>> {
  const rows = await prisma.user.findMany({
    where: {
      organizationId: user.organizationId,
      deletedAt: null,
      status: 'active',
      payeeProfile: { none: {} },
      role: { roleGroup: { in: ['system', 'inhouse', 'outsource'] } },
    },
    select: { id: true, fullName: true, team: { select: { name: true } }, role: { select: { name: true } } },
    orderBy: { fullName: 'asc' },
    take: 300,
  })
  return rows.map((row) => ({
    id: row.id,
    fullName: row.fullName,
    teamName: row.team?.name ?? null,
    roleName: row.role.name,
  }))
}

export async function createPayee(
  context: PayeeMutationContext,
  input: PayeeFieldsInput & { userId: string },
): Promise<PayeeMutationResult> {
  const organizationId = context.actor.organizationId
  const owner = await prisma.user.findFirst({
    where: { id: input.userId, organizationId, deletedAt: null },
    select: { id: true, fullName: true },
  })
  if (owner === null) throw new PayeeError('PAYEE_NOT_FOUND', { detail: `user=${input.userId}` })

  const duplicate = await prisma.payeeProfile.findFirst({
    where: { organizationId, userId: input.userId },
    select: { id: true },
  })
  if (duplicate !== null) {
    throw new PayeeError('PAYEE_ALREADY_EXISTS', {
      detail: `user=${input.userId} payee=${duplicate.id}`,
      context: { payeeId: duplicate.id },
    })
  }

  await assertTaxProfileUsable(organizationId, input.taxProfileId)
  const data = toWriteData(input)

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.payeeProfile.create({
      data: { organizationId, userId: input.userId, ...data, createdBy: context.actor.id },
      select: payeeSelect,
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'create',
        targetType: TARGET,
        targetId: row.id,
        after: toPayeeAuditPayload(toValues(row)),
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
      },
      tx,
    )

    return row
  })

  return { payee: toDto(created, true), warning: bankNameWarning(owner.fullName, data.accountName) }
}

export async function updatePayee(
  context: PayeeMutationContext,
  payeeId: string,
  input: PayeeFieldsInput,
): Promise<PayeeMutationResult> {
  const organizationId = context.actor.organizationId
  const current = await findPayeeRow(context.actor, payeeId)
  await assertTaxProfileUsable(organizationId, input.taxProfileId)

  const before = toValues(current)
  const data = toWriteData(input)
  // `18` §9 — verified + แก้ธนาคาร/ภาษี ⇒ ต้องยืนยันใหม่ (ล้างผู้ยืนยันเดิมออกด้วย ไม่ใช่แค่ flag)
  const reset = shouldResetVerification({ isVerified: current.isVerified, before, after: data })

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.payeeProfile.update({
      where: { id: payeeId },
      data: {
        ...data,
        ...(reset ? { isVerified: false, verifiedBy: null, verifiedAt: null } : {}),
        updatedBy: context.actor.id,
      },
      select: payeeSelect,
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'update',
        targetType: TARGET,
        targetId: payeeId,
        before: { ...toPayeeAuditPayload(before), is_verified: current.isVerified },
        after: { ...toPayeeAuditPayload(toValues(row)), is_verified: row.isVerified },
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )

    return row
  })

  return { payee: toDto(updated, true), warning: bankNameWarning(current.user.fullName, data.accountName) }
}

/**
 * `18` §9 — การเงินกดยืนยัน ⇒ `is_verified = true` พร้อมบันทึกว่าใครยืนยันเมื่อไหร่ (`18` §13)
 * เกตความครบถ้วน + policy `require_payee_id_document` อยู่ที่ pure module (`13` §6.2.1)
 */
export async function verifyPayee(context: PayeeMutationContext, payeeId: string): Promise<PayeeMutationResult> {
  const organizationId = context.actor.organizationId
  const current = await findPayeeRow(context.actor, payeeId)
  const policy = await getFinancePolicy(organizationId)

  assertPayeeReadyForVerification({
    values: toValues(current),
    requireIdDocument: policy.requirePayeeIdDocument,
  })

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.payeeProfile.update({
      where: { id: payeeId },
      data: {
        isVerified: true,
        verifiedBy: context.actor.id,
        verifiedAt: new Date(),
        updatedBy: context.actor.id,
      },
      select: payeeSelect,
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'approve',
        targetType: TARGET,
        targetId: payeeId,
        before: { is_verified: current.isVerified },
        after: {
          is_verified: true,
          verified_by: context.actor.id,
          verified_at: row.verifiedAt?.toISOString() ?? null,
          ...toPayeeAuditPayload(toValues(row)),
        },
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )

    return row
  })

  return { payee: toDto(updated, true), warning: bankNameWarning(current.user.fullName, updated.accountName) }
}
