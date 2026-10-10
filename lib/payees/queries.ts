import { onUniqueViolation } from '@/lib/api/unique-violation'
import { advanceReturnOutstandingSatang } from '@/lib/finance/advance-offset-calc'
import type { ApiWarning } from '@/lib/api/envelope'
import { emitAudit } from '@/lib/audit/audit'
import { AuthError } from '@/lib/auth/errors'
import { hasCapability } from '@/lib/auth/permission'
import type { RequestMeta } from '@/lib/auth/request-meta'
import type { SessionUser } from '@/lib/auth/types'
import { Prisma } from '@/lib/generated/prisma/client'
import type { PayeeType, RoleGroup, TeamSide, WhtCondition, WhtIncomeCategory } from '@/lib/generated/prisma/enums'
import {
  assertPayeeNationalId,
  assertPayeeReadyForVerification,
  checkBankAccountName,
  MANAGE_PAYEE_PROFILE_CAPABILITY,
  maskAccountNumber,
  missingFieldsForVerification,
  normalizePayeeValues,
  assertCorporateLegalName,
  payeeAddressLine,
  payeeLegalName,
  shouldResetVerification,
  type PayeeIncomeCategoryOverride,
  toPayeeAuditPayload,
  type PayeeValues,
} from '@/lib/payees/payee'
import { PayeeError } from '@/lib/payees/errors'
import type { PayeeFieldsInput, PayeeListQuery } from '@/lib/payees/schemas'
import type { PayeeCandidateDto, PayeeDto, PayeeOptionDto } from '@/lib/payees/types'
import { resolvePayoutSide } from '@/lib/payout/payout'
import { prisma } from '@/lib/prisma'
import { getFinancePolicy } from '@/lib/settings/queries/finance-policy'
import { loadTaxProfileDefaults } from '@/lib/settings/queries/tax-profile-defaults'
import { pickTaxProfileDefault, type TaxProfileDefaults } from '@/lib/settings/tax-profile-defaults'
import { resolveWhtPolicyForPayout } from '@/lib/settings/queries/wht-policy'
import { isWhtConditionAllowed } from '@/lib/settings/wht-policy'
import { SettingsError } from '@/lib/settings/errors'
import { isIdDocumentVerified } from '@/lib/payees/id-document'
import { payeeIdDocumentRule } from '@/lib/uploads/rules'
import { verifyUploadedFile } from '@/lib/uploads/verify'

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

export const MANAGE_PAYEE_PROFILE = MANAGE_PAYEE_PROFILE_CAPABILITY

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
  idDocumentHash: true,
  idDocumentUnverified: true,
  wht402Pct: true,
  nameTitle: true,
  addressDetail: true,
  addressSubdistrict: true,
  addressDistrict: true,
  addressProvince: true,
  addressPostalCode: true,
  branchCode: true,
  whtCondition: true,
  legalName: true,
  incomeCategoryOverride: true,
  isVerified: true,
  verifiedAt: true,
  updatedAt: true,
  user: {
    select: {
      fullName: true,
      role: { select: { name: true, roleGroup: true } },
      team: { select: { name: true, side: true } },
    },
  },
  taxProfile: { select: { id: true, name: true, whtPct: true } },
  verifiedByUser: { select: { fullName: true } },
  // มติ PO U30 — ยอดคืนเงินทดรองค้าง (เฉพาะรายการที่เคลียร์แล้วและมีวิธีคืน)
  advances: {
    where: { status: 'cleared', returnMethod: { not: null }, deletedAt: null },
    select: { returnSatang: true, returns: { where: { reversedAt: null }, select: { amountSatang: true } } },
  },
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
    wht402Pct: row.wht402Pct === null ? null : row.wht402Pct.toNumber(),
    nameTitle: row.nameTitle,
    addressDetail: row.addressDetail,
    addressSubdistrict: row.addressSubdistrict,
    addressDistrict: row.addressDistrict,
    addressProvince: row.addressProvince,
    addressPostalCode: row.addressPostalCode,
    branchCode: row.branchCode,
    whtCondition: row.whtCondition,
    legalName: row.legalName,
    incomeCategoryOverride: toIncomeOverride(row.incomeCategoryOverride),
  }
}

/** คอลัมน์ enum เต็ม → ค่าที่ตั้งรายคนได้ (CHECK ระดับ DB รับแค่ 40(2)/40(8) อยู่แล้ว) */
function toIncomeOverride(value: WhtIncomeCategory | null): PayeeIncomeCategoryOverride | null {
  return value === 'sec_40_2' || value === 'sec_40_8' ? value : null
}

/**
 * ค่าฟอร์ม → ค่าเต็มของผู้รับ — ฟิลด์ใบ 50 ทวิ (คำนำหน้า/ที่อยู่/สาขา/เงื่อนไขการหัก — มติ PO U94) ที่ไม่ส่งมา
 * = คงค่าเดิม (`base`) · ตอนสร้าง `base` = ค่าเริ่มต้น
 */
function mergeInput(input: PayeeFieldsInput, base: PayeeValues): PayeeValues {
  return {
    payeeType: input.payeeType,
    taxProfileId: input.taxProfileId,
    nationalId: input.nationalId,
    bankName: input.bankName,
    accountName: input.accountName,
    accountNumber: input.accountNumber,
    idDocumentUrl: input.idDocumentUrl,
    wht402Pct: input.wht402Pct === undefined ? base.wht402Pct : input.wht402Pct,
    nameTitle: input.nameTitle === undefined ? base.nameTitle : input.nameTitle,
    addressDetail: input.address === undefined ? base.addressDetail : input.address.detail,
    addressSubdistrict: input.address === undefined ? base.addressSubdistrict : input.address.subdistrict,
    addressDistrict: input.address === undefined ? base.addressDistrict : input.address.district,
    addressProvince: input.address === undefined ? base.addressProvince : input.address.province,
    addressPostalCode: input.address === undefined ? base.addressPostalCode : input.address.postalCode,
    branchCode: input.branchCode ?? base.branchCode,
    whtCondition: input.whtCondition ?? base.whtCondition,
    legalName: input.legalName === undefined ? base.legalName : input.legalName,
    incomeCategoryOverride:
      input.incomeCategoryOverride === undefined ? base.incomeCategoryOverride : input.incomeCategoryOverride,
  }
}

const NEW_PAYEE_BASE: PayeeValues = {
  payeeType: 'individual',
  taxProfileId: null,
  nationalId: null,
  bankName: null,
  accountName: null,
  accountNumber: null,
  idDocumentUrl: null,
  wht402Pct: null,
  nameTitle: null,
  addressDetail: null,
  addressSubdistrict: null,
  addressDistrict: null,
  addressProvince: null,
  addressPostalCode: null,
  branchCode: '00000',
  whtCondition: 'withhold',
  legalName: null,
  incomeCategoryOverride: null,
}

/** `canSeeFullAccount` = ผู้ถือสิทธิ์ `manage` เท่านั้น (เลขบัญชีเต็มคือข้อมูลที่โอนเงินได้จริง) */
/**
 * มีค่าเริ่มต้นตามประเภทผู้รับให้ผู้รับรายนี้ไหม (มติ PO U121) — ฝั่งจากทีม/กลุ่ม role แบบเดียวกับรอบจ่าย
 * (`resolvePayoutSide`) × ชนิดผู้รับ · ใช้ทั้งความพร้อมก่อนยืนยันและป้าย "ข้อมูลรับเงินไม่ครบ"
 */
export function payeeTypeDefaultAvailable(
  defaults: TaxProfileDefaults<unknown>,
  input: { teamSide: TeamSide | null; roleGroup: RoleGroup; payeeType: PayeeType },
): boolean {
  const side = resolvePayoutSide({ teamSide: input.teamSide, roleGroup: input.roleGroup })
  return pickTaxProfileDefault(defaults, side, input.payeeType) !== null
}

function rowTypeDefaultAvailable(row: PayeeRow, defaults: TaxProfileDefaults<unknown>): boolean {
  return payeeTypeDefaultAvailable(defaults, {
    teamSide: row.user.team?.side ?? null,
    roleGroup: row.user.role.roleGroup,
    payeeType: row.payeeType,
  })
}

/** ค่าเริ่มต้นตามประเภทผู้รับที่มีผลอยู่ (แค่ว่าแต่ละช่องมีหรือไม่) */
async function loadTypeDefaults(organizationId: string): Promise<TaxProfileDefaults<unknown>> {
  return (await loadTaxProfileDefaults(organizationId)).profiles
}

function toDto(row: PayeeRow, canSeeFullAccount: boolean, typeDefaults: TaxProfileDefaults<unknown>): PayeeDto {
  const values = toValues(row)
  return {
    id: row.id,
    userId: row.userId,
    name: row.user.fullName,
    teamName: row.user.team?.name ?? null,
    roleName: row.user.role.name,
    payoutSide: resolvePayoutSide({ teamSide: row.user.team?.side ?? null, roleGroup: row.user.role.roleGroup }),
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
    idDocumentVerified: isIdDocumentVerified(row),
    wht402Pct: values.wht402Pct,
    nameTitle: row.nameTitle,
    address: {
      detail: row.addressDetail,
      postalCode: row.addressPostalCode,
      province: row.addressProvince,
      district: row.addressDistrict,
      subdistrict: row.addressSubdistrict,
    },
    addressLine: payeeAddressLine(values),
    branchCode: row.branchCode,
    whtCondition: row.whtCondition,
    isVerified: row.isVerified,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    verifiedByName: row.verifiedByUser?.fullName ?? null,
    legalName: row.legalName,
    incomeCategoryOverride: values.incomeCategoryOverride,
    bankAccountNameMatches: checkBankAccountName(legalNameOf(row, row.user.fullName), row.accountName).matches,
    missingForVerification: missingFieldsForVerification(values, {
      typeDefaultAvailable: rowTypeDefaultAvailable(row, typeDefaults),
    }),
    advanceReturnOutstandingSatang: row.advances.reduce(
      (total, advance) =>
        total +
        advanceReturnOutstandingSatang({
          returnSatang: advance.returnSatang,
          collectedSatang: advance.returns.map((entry) => entry.amountSatang),
        }),
      0,
    ),
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
  const typeDefaults = await loadTypeDefaults(user.organizationId)
  return rows.map((row) => toDto(row, full, typeDefaults))
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
  return toDto(await findPayeeRow(user, payeeId), canManage(user), await loadTypeDefaults(user.organizationId))
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
  assertCorporateLegalName(values)
  const normalized = normalizePayeeValues(values)
  return {
    payeeType: normalized.payeeType,
    taxProfileId: normalized.taxProfileId,
    nationalId: assertPayeeNationalId(normalized.nationalId),
    bankName: normalized.bankName,
    accountName: normalized.accountName,
    accountNumber: normalized.accountNumber,
    idDocumentUrl: normalized.idDocumentUrl,
    wht402Pct: normalized.wht402Pct,
    nameTitle: normalized.nameTitle,
    addressDetail: normalized.addressDetail,
    addressSubdistrict: normalized.addressSubdistrict,
    addressDistrict: normalized.addressDistrict,
    addressProvince: normalized.addressProvince,
    addressPostalCode: normalized.addressPostalCode,
    branchCode: normalized.branchCode,
    whtCondition: normalized.whtCondition,
    legalName: normalized.legalName,
    incomeCategoryOverride: normalized.incomeCategoryOverride,
  }
}

/** ชื่อที่ใช้เทียบกับชื่อบัญชี — นิติบุคคลเทียบกับชื่อตามหนังสือรับรอง (staging E-010) */
function legalNameOf(row: { payeeType: PayeeType; legalName: string | null }, userFullName: string): string {
  return payeeLegalName({ payeeType: row.payeeType, legalName: row.legalName, userFullName })
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
): Promise<PayeeCandidateDto[]> {
  const rows = await prisma.user.findMany({
    where: {
      organizationId: user.organizationId,
      deletedAt: null,
      status: 'active',
      payeeProfile: { none: {} },
      role: { roleGroup: { in: ['system', 'inhouse', 'outsource'] } },
    },
    select: {
      id: true,
      fullName: true,
      team: { select: { name: true, side: true } },
      role: { select: { name: true, roleGroup: true } },
    },
    orderBy: { fullName: 'asc' },
    take: 300,
  })
  return rows.map((row) => ({
    id: row.id,
    fullName: row.fullName,
    teamName: row.team?.name ?? null,
    roleName: row.role.name,
    payoutSide: resolvePayoutSide({ teamSide: row.team?.side ?? null, roleGroup: row.role.roleGroup }),
  }))
}

/**
 * ผู้รับเงินที่ยังใช้งานอยู่ขององค์กร (ผู้ใช้ active) — ผู้เรียกต้องผ่านยาม `ON_BEHALF_CAPABILITIES` ที่ route แล้ว
 * ผู้ใช้ที่ยังไม่มี Payee Profile ไม่อยู่ในรายการ (การเงินสร้างให้ที่หน้าผู้รับเงิน/ผู้ใช้ก่อน)
 */
export async function listPayeeOptions(user: SessionUser): Promise<PayeeOptionDto[]> {
  const rows = await prisma.payeeProfile.findMany({
    where: { organizationId: user.organizationId, deletedAt: null, user: { deletedAt: null, status: 'active' } },
    select: { id: true, userId: true, user: { select: { fullName: true, team: { select: { name: true } } } } },
    orderBy: { user: { fullName: 'asc' } },
    take: 500,
  })
  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    name: row.user.fullName,
    teamName: row.user.team?.name ?? null,
  }))
}

/** 1 ผู้ใช้ = 1 payee (unique `organization_id, user_id`) — แนบ id payee เดิมให้ UI ลิงก์ไปเปิดได้ */
async function assertNoPayeeForUser(organizationId: string, userId: string): Promise<void> {
  const duplicate = await prisma.payeeProfile.findFirst({
    where: { organizationId, userId },
    select: { id: true },
  })
  if (duplicate !== null) {
    throw new PayeeError('PAYEE_ALREADY_EXISTS', {
      detail: `user=${userId} payee=${duplicate.id}`,
      context: { payeeId: duplicate.id },
    })
  }
}

/**
 * มติ PO 06/10/2569 U105 — ค่าตั้ง "อนุญาตเงื่อนไข (2)/(3)" ที่มีผลวันนี้ (ฟอร์มผู้รับใช้กรองตัวเลือก)
 * ใช้ resolver เดียวกับรอบจ่าย ⇒ ฟอร์ม/การบันทึก/การสร้างรอบเห็นค่าเดียวกัน
 */
export async function getPayeeWhtConditionPolicy(
  user: SessionUser,
  now: Date = new Date(),
): Promise<{ allowGrossUpConditions: boolean }> {
  const { values } = await resolveWhtPolicyForPayout(user.organizationId, now)
  return { allowGrossUpConditions: values.allowGrossUpConditions }
}

/**
 * เงื่อนไข (2)/(3) บันทึกได้เฉพาะเมื่อค่าตั้งอนุญาต (U105) — ค่าเดิมที่ตั้งไว้ก่อนปิดค่าตั้ง **คงไว้ได้**
 * (แก้ข้อมูลอื่นของผู้รับได้ตามปกติ) แต่รอบจ่ายจะบล็อกจนกว่าจะเปลี่ยนเป็น (1) หรือเปิดค่าตั้ง
 */
async function assertWhtConditionAllowed(
  organizationId: string,
  condition: WhtCondition,
  previous: WhtCondition | null,
): Promise<void> {
  if (condition === 'withhold' || condition === previous) return
  const { values } = await resolveWhtPolicyForPayout(organizationId, new Date())
  if (isWhtConditionAllowed(values, condition)) return
  throw new PayeeError('WHT_CONDITION_NOT_ALLOWED', { detail: `wht_condition=${condition}` })
}

export type PayeeTxClient = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>
type PayeeTx = PayeeTxClient
/**
 * ข้อมูลเขียน + สถานะการตรวจเอกสารยืนยันตัวตน (มติ PO U150) — ฟิลด์ hash/flag มีเฉพาะเมื่อเอกสารเปลี่ยน
 * (คงเอกสารเดิม = ไม่แตะ hash/flag เดิม)
 */
type PayeeWriteData = ReturnType<typeof toWriteData> & { idDocumentHash?: string | null; idDocumentUnverified?: boolean }

/**
 * มติ PO U150 — เอกสารยืนยันตัวตนต้องเป็นไฟล์ที่อัปโหลดผ่าน server (target `payee_id_document`)
 * เปลี่ยนเอกสาร ⇒ ดาวน์โหลดมาตรวจ (prefix ขององค์กร · มีจริง · magic bytes · ขนาด) + SHA-256 · ล้าง ⇒ ล้าง hash
 * เอกสารเดิมไม่เปลี่ยน (รวม URL เก่าที่ไม่ผ่านการตรวจ) ⇒ ไม่แตะ · ⚠️ เรียกนอก transaction (I/O เครือข่าย)
 */
async function resolveIdDocumentWrite(
  organizationId: string,
  nextPath: string | null,
  previousPath: string | null,
): Promise<{ idDocumentHash?: string | null; idDocumentUnverified?: boolean }> {
  if (nextPath === previousPath) return {}
  if (nextPath === null) return { idDocumentHash: null, idDocumentUnverified: false }
  const verified = await verifyUploadedFile(nextPath, payeeIdDocumentRule(organizationId))
  return { idDocumentHash: verified.sha256, idDocumentUnverified: false }
}

/** ตรวจ + เตรียมข้อมูลเขียน (นอก transaction) — ใช้ร่วม API ผู้รับเงิน และฟอร์มผู้ใช้ (U131) */
async function preparePayeeWrite(
  organizationId: string,
  input: PayeeFieldsInput,
  before: PayeeValues | null,
): Promise<PayeeWriteData> {
  await assertTaxProfileUsable(organizationId, input.taxProfileId)
  // ไม่ส่งอัตรา 40(2)/ฟิลด์ใบ 50 ทวิ มา = คงค่าเดิม (กันฟอร์ม/ผู้เรียกที่ไม่รู้จักฟิลด์ล้างค่าทิ้ง)
  const data = toWriteData(mergeInput(input, before ?? NEW_PAYEE_BASE))
  await assertWhtConditionAllowed(organizationId, data.whtCondition, before?.whtCondition ?? null)
  const previousPath = before === null ? null : normalizePayeeValues(before).idDocumentUrl
  return { ...data, ...(await resolveIdDocumentWrite(organizationId, data.idDocumentUrl, previousPath)) }
}

async function insertPayeeInTx(
  tx: PayeeTx,
  context: PayeeMutationContext,
  userId: string,
  data: PayeeWriteData,
): Promise<PayeeRow> {
  const organizationId = context.actor.organizationId
  const row = await tx.payeeProfile.create({
    data: { organizationId, userId, ...data, createdBy: context.actor.id },
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
      after: { ...toPayeeAuditPayload(toValues(row)), id_document_hash: row.idDocumentHash },
      reason: context.reason,
      ipAddress: context.meta.ipAddress,
      userAgent: context.meta.userAgent,
    },
    tx,
  )
  return row
}

async function updatePayeeInTx(
  tx: PayeeTx,
  context: PayeeMutationContext,
  current: PayeeRow,
  data: PayeeWriteData,
): Promise<PayeeRow> {
  const before = toValues(current)
  // `18` §9 — verified + แก้ธนาคาร/ภาษี ⇒ ต้องยืนยันใหม่ (ล้างผู้ยืนยันเดิมออกด้วย ไม่ใช่แค่ flag)
  const reset = shouldResetVerification({ isVerified: current.isVerified, before, after: data })
  const row = await tx.payeeProfile.update({
    where: { id: current.id },
    data: {
      ...data,
      ...(reset ? { isVerified: false, verifiedBy: null, verifiedAt: null } : {}),
      updatedBy: context.actor.id,
    },
    select: payeeSelect,
  })
  await emitAudit(
    {
      organizationId: context.actor.organizationId,
      actorId: context.actor.id,
      actorRole: context.actor.roleName,
      action: 'update',
      targetType: TARGET,
      targetId: current.id,
      before: { ...toPayeeAuditPayload(before), id_document_hash: current.idDocumentHash, is_verified: current.isVerified },
      after: { ...toPayeeAuditPayload(toValues(row)), id_document_hash: row.idDocumentHash, is_verified: row.isVerified },
      reason: context.reason,
      ipAddress: context.meta.ipAddress,
      userAgent: context.meta.userAgent,
      diffOnly: false,
    },
    tx,
  )
  return row
}

/** ความพร้อม + policy เอกสาร (`18` §9/§10) + ค่าเริ่มต้นตามประเภท (BUG-SF1) — แถวต้องเป็นค่าล่าสุดแล้ว */
function assertRowReadyForVerification(
  row: PayeeRow,
  policy: { requirePayeeIdDocument: boolean },
  typeDefaults: TaxProfileDefaults<unknown>,
): void {
  assertPayeeReadyForVerification({
    // มติ PO U150 — เอกสารที่ไม่ผ่านการตรวจของ server (URL เก่าที่พิมพ์เอง) = ไม่มีเอกสาร
    values: { ...toValues(row), idDocumentUrl: isIdDocumentVerified(row) ? row.idDocumentUrl : null },
    requireIdDocument: policy.requirePayeeIdDocument,
    typeDefaultAvailable: rowTypeDefaultAvailable(row, typeDefaults),
  })
}

async function markPayeeVerifiedInTx(tx: PayeeTx, context: PayeeMutationContext, current: PayeeRow): Promise<PayeeRow> {
  const row = await tx.payeeProfile.update({
    where: { id: current.id },
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
      organizationId: context.actor.organizationId,
      actorId: context.actor.id,
      actorRole: context.actor.roleName,
      action: 'approve',
      targetType: TARGET,
      targetId: current.id,
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

  await assertNoPayeeForUser(organizationId, input.userId)
  const data = await preparePayeeWrite(organizationId, input, null)

  const created = await prisma
    .$transaction((tx) => insertPayeeInTx(tx, context, input.userId, data))
    .catch(
      // ชน unique `(organization_id, user_id)` — 1 ผู้ใช้ = 1 payee · คำขอพร้อมกันหลุด pre-check ทั้งคู่ (UAT BUG-016)
      onUniqueViolation(async () => {
        await assertNoPayeeForUser(organizationId, input.userId)
        throw new PayeeError('PAYEE_ALREADY_EXISTS', { detail: `user=${input.userId} (unique violation)` })
      }),
    )

  return {
    payee: toDto(created, true, await loadTypeDefaults(organizationId)),
    warning: bankNameWarning(legalNameOf(data, owner.fullName), data.accountName),
  }
}

export async function updatePayee(
  context: PayeeMutationContext,
  payeeId: string,
  input: PayeeFieldsInput,
): Promise<PayeeMutationResult> {
  const organizationId = context.actor.organizationId
  const current = await findPayeeRow(context.actor, payeeId)
  const data = await preparePayeeWrite(organizationId, input, toValues(current))

  const updated = await prisma.$transaction((tx) => updatePayeeInTx(tx, context, current, data))

  return {
    payee: toDto(updated, true, await loadTypeDefaults(organizationId)),
    warning: bankNameWarning(legalNameOf(data, current.user.fullName), data.accountName),
  }
}

/**
 * `18` §9 — การเงินกดยืนยัน ⇒ `is_verified = true` พร้อมบันทึกว่าใครยืนยันเมื่อไหร่ (`18` §13)
 * เกตความครบถ้วน + policy `require_payee_id_document` อยู่ที่ pure module (`13` §6.2.1)
 */
export async function verifyPayee(context: PayeeMutationContext, payeeId: string): Promise<PayeeMutationResult> {
  const organizationId = context.actor.organizationId
  const current = await findPayeeRow(context.actor, payeeId)
  const policy = await getFinancePolicy(organizationId)
  const typeDefaults = await loadTypeDefaults(organizationId)

  // BUG-SF1 (มติ PO U121): ผู้รับที่ใช้ค่าเริ่มต้นตามประเภทยืนยันได้ — ไม่บังคับ Tax Profile รายคน
  assertRowReadyForVerification(current, policy, typeDefaults)

  const updated = await prisma.$transaction((tx) => markPayeeVerifiedInTx(tx, context, current))

  return {
    payee: toDto(updated, true, typeDefaults),
    warning: bankNameWarning(legalNameOf(updated, current.user.fullName), updated.accountName),
  }
}

// ── ข้อมูลรับเงินในฟอร์มผู้ใช้ (มติ PO U131) ─────────────────────────────────────────

/** ข้อมูลรับเงินที่ฟอร์มผู้ใช้ส่งมา — ฟิลด์เดียวกับฟอร์ม Payee + ติ๊กยืนยัน + เหตุผล (หมวด bank) */
export interface UserPaymentInput {
  fields: PayeeFieldsInput
  verify: boolean
  reason: string
}

/** ผลตรวจล่วงหน้า (นอก transaction) — ส่งต่อให้ `writeUserPaymentInTx()` */
export interface PreparedUserPayment {
  input: UserPaymentInput
  current: PayeeRow | null
  data: PayeeWriteData
  /** ค่าในฟอร์มเท่ากับของเดิมทุกช่อง ⇒ ไม่เขียนแถว/ไม่ลง audit ซ้ำ */
  unchanged: boolean
  policy: { requirePayeeIdDocument: boolean }
  typeDefaults: TaxProfileDefaults<unknown>
}

/**
 * ตรวจข้อมูลรับเงินก่อนเปิด transaction ของผู้ใช้ — สิทธิ์ `manage:manage_payee_profile` เดิมของหน้า Payee
 * (ทั้งบันทึกและยืนยัน · U106 คนแก้ = คนยืนยันได้) · `userId = null` = ผู้ใช้ใหม่ (ยังไม่มี payee)
 */
export async function prepareUserPayment(
  actor: SessionUser,
  userId: string | null,
  input: UserPaymentInput,
): Promise<PreparedUserPayment> {
  if (!canManage(actor)) {
    throw new AuthError('PERMISSION_DENIED', `user payment section needs manage:${MANAGE_PAYEE_PROFILE} user=${actor.id}`)
  }
  const organizationId = actor.organizationId
  const current =
    userId === null
      ? null
      : await prisma.payeeProfile.findFirst({
          where: { organizationId, userId, deletedAt: null },
          select: payeeSelect,
        })
  const before = current === null ? null : toValues(current)
  const data = await preparePayeeWrite(organizationId, input.fields, before)
  const unchanged =
    before !== null && JSON.stringify(normalizePayeeValues(before)) === JSON.stringify(normalizePayeeValues(data))
  return {
    input,
    current,
    data,
    unchanged,
    policy: await getFinancePolicy(organizationId),
    typeDefaults: await loadTypeDefaults(organizationId),
  }
}

export interface UserPaymentWriteResult {
  payeeId: string
  isVerified: boolean
  /** ชื่อบัญชีไม่ตรงชื่อผู้ใช้ — เตือน ไม่ block (`BANK_ACCOUNT_NAME_MISMATCH`) */
  warning?: ApiWarning
}

/**
 * สร้าง/อัปเดต Payee ของผู้ใช้ **ใน transaction เดียวกับผู้ใช้** (มติ PO U131) — ใช้ตัวเขียน + audit
 * ชุดเดียวกับ `createPayee`/`updatePayee`/`verifyPayee` · ชื่อผู้รับ = `users.full_name` จุดเดียว
 * `verify = true` ⇒ ตรวจความพร้อมจากค่าล่าสุด (หลังเขียน) แล้วยืนยันต่อในรอบเดียวกัน · ไม่พร้อม = rollback ทั้งหมด
 */
export async function writeUserPaymentInTx(
  tx: PayeeTx,
  context: PayeeMutationContext,
  userId: string,
  fullName: string,
  prepared: PreparedUserPayment,
): Promise<UserPaymentWriteResult> {
  let row: PayeeRow
  if (prepared.current === null) {
    row = await insertPayeeInTx(tx, context, userId, prepared.data)
  } else if (prepared.unchanged) {
    row = prepared.current
  } else {
    row = await updatePayeeInTx(tx, context, prepared.current, prepared.data)
  }
  if (prepared.input.verify && !row.isVerified) {
    // แถวอ่านใน tx เดียวกัน ⇒ ทีม/role ใหม่ของผู้ใช้มีผลกับค่าเริ่มต้นตามประเภทแล้ว
    const fresh = await tx.payeeProfile.findUniqueOrThrow({ where: { id: row.id }, select: payeeSelect })
    assertRowReadyForVerification(fresh, prepared.policy, prepared.typeDefaults)
    row = await markPayeeVerifiedInTx(tx, context, fresh)
  }
  return { payeeId: row.id, isVerified: row.isVerified, warning: bankNameWarning(legalNameOf(row, fullName), row.accountName) }
}

/**
 * ป้าย "ข้อมูลรับเงินไม่ครบ" (มติ PO U131) — ตั้งแต่ส่งเบิก: หน้ารายการเบิกของพนักงาน + คิวอนุมัติ
 * ครบ = ผ่านเกตความพร้อมก่อนยืนยันทุกข้อ (รวมแหล่งอัตราภาษี — BUG-SF1) · คืน map payeeId → ฟิลด์ที่ขาด
 */
export async function loadPayeeInfoGaps(
  organizationId: string,
  payeeIds: readonly string[],
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>()
  if (payeeIds.length === 0) return result
  const [rows, typeDefaults] = await Promise.all([
    prisma.payeeProfile.findMany({
      where: { organizationId, id: { in: [...new Set(payeeIds)] } },
      select: payeeSelect,
    }),
    loadTypeDefaults(organizationId),
  ])
  for (const row of rows) {
    result.set(
      row.id,
      missingFieldsForVerification(toValues(row), { typeDefaultAvailable: rowTypeDefaultAvailable(row, typeDefaults) }),
    )
  }
  return result
}
