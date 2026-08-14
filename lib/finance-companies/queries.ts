import { emitAudit } from '@/lib/audit/audit'
import { AuthError } from '@/lib/auth/errors'
import type { RequestMeta } from '@/lib/auth/request-meta'
import { isWithinScope } from '@/lib/auth/scope'
import type { SessionUser } from '@/lib/auth/types'
import {
  normalizeCompanyValues,
  resolveSuspendedReason,
  toCompanyAuditPayload,
  type CompanyStatus,
  type FinanceCompanyValues,
} from '@/lib/finance-companies/company'
import { FinanceCompanyError } from '@/lib/finance-companies/errors'
import type { FinanceCompanyListQuery } from '@/lib/finance-companies/schemas'
import type { CompanyUserDto, FinanceCompanyDto } from '@/lib/finance-companies/types'
import { Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'

/**
 * ชั้นข้อมูลของโมดูลบริษัทไฟแนนซ์ (ไฟล์ 10) — **แยกจาก pure logic** (`lib/finance-companies/company.ts`)
 *
 * ทุก query กรองด้วย `organization_id` เสมอ (`02` §2) · ทุก mutation อยู่ใน `$transaction`
 * เดียวกับ `emitAudit()` พร้อม `reason` เพราะ `finance_companies` อยู่หมวด **เงิน** (`90` §13)
 *
 * ⚠️ ไม่มีการคำนวณค่าบริการที่นี่ — เคสจะ snapshot ตัวเลขจาก template ตอน `approved` (`10` §9.2)
 * ซึ่งเป็นงานของ Phase 2.3 · การเปลี่ยน template ที่นี่จึงกระทบเฉพาะเคสที่ยังไม่ approved
 */

const companySelect = {
  id: true,
  name: true,
  shortName: true,
  taxId: true,
  address: true,
  phone: true,
  email: true,
  contactName: true,
  contactPhone: true,
  signerName: true,
  serviceFeeTemplateId: true,
  vatRegistered: true,
  defaultInvoiceDeliveryFormat: true,
  billingDay: true,
  paymentDueDays: true,
  status: true,
  suspendedReason: true,
  updatedAt: true,
  serviceFeeTemplate: { select: { name: true, model: true } },
  _count: {
    select: {
      cases: { where: { deletedAt: null } },
      users: { where: { deletedAt: null } },
    },
  },
} as const

type CompanyRow = Prisma.FinanceCompanyGetPayload<{ select: typeof companySelect }>

/** `status` เป็น TEXT ใน `02` §5 — normalize ค่าที่ไม่รู้จักเป็น `active` (ไม่ให้ UI พังเพราะข้อมูลเก่า) */
function toStatus(value: string): CompanyStatus {
  return value === 'suspended' ? 'suspended' : 'active'
}

function toDto(row: CompanyRow): FinanceCompanyDto {
  return {
    id: row.id,
    name: row.name,
    shortName: row.shortName,
    taxId: row.taxId,
    address: row.address,
    phone: row.phone,
    email: row.email,
    contactName: row.contactName,
    contactPhone: row.contactPhone,
    signerName: row.signerName,
    serviceFeeTemplateId: row.serviceFeeTemplateId ?? '',
    serviceFeeTemplateName: row.serviceFeeTemplate?.name ?? null,
    serviceFeeTemplateModel: row.serviceFeeTemplate?.model ?? null,
    vatRegistered: row.vatRegistered,
    defaultInvoiceDeliveryFormat: row.defaultInvoiceDeliveryFormat,
    billingDay: row.billingDay,
    paymentDueDays: row.paymentDueDays,
    status: toStatus(row.status),
    suspendedReason: row.suspendedReason,
    caseCount: row._count.cases,
    userCount: row._count.users,
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toValues(dto: FinanceCompanyDto): FinanceCompanyValues {
  return {
    name: dto.name,
    shortName: dto.shortName,
    taxId: dto.taxId,
    address: dto.address,
    phone: dto.phone,
    email: dto.email,
    contactName: dto.contactName,
    contactPhone: dto.contactPhone,
    signerName: dto.signerName,
    serviceFeeTemplateId: dto.serviceFeeTemplateId,
    vatRegistered: dto.vatRegistered,
    defaultInvoiceDeliveryFormat: dto.defaultInvoiceDeliveryFormat,
    billingDay: dto.billingDay,
    paymentDueDays: dto.paymentDueDays,
  }
}

/**
 * scope ระดับแถว (Rule 03 · `10` §10/§16) — **company user เห็นเฉพาะบริษัทตัวเอง**
 * `global` เห็นทุกบริษัท · scope `team`/`self` ไม่มีสิทธิ์ `view_master_data` อยู่แล้วที่ชั้น capability
 */
function companyScopeFilter(user: SessionUser): { id?: string } {
  if (user.scope.kind !== 'company') return {}
  // `companyId` เป็น null ไม่ได้เมื่อ scope = company (resolveScope การันตี) — กันไว้ด้วยค่าที่ match ไม่ได้
  return { id: user.scope.companyId ?? '00000000-0000-0000-0000-000000000000' }
}

/** บริษัทที่อยู่นอก scope ตอบ 403 ไม่ใช่ 404 (`10` §16 "ไม่เห็น/403") */
function assertCompanyInScope(user: SessionUser, companyId: string): void {
  if (!isWithinScope(user.scope, { companyId })) {
    throw new AuthError('PERMISSION_DENIED', `company=${companyId} user=${user.id}`)
  }
}

export async function listFinanceCompanies(
  user: SessionUser,
  query: FinanceCompanyListQuery,
): Promise<FinanceCompanyDto[]> {
  const organizationId = user.organizationId
  const rows = await prisma.financeCompany.findMany({
    where: {
      organizationId,
      deletedAt: null,
      ...companyScopeFilter(user),
      status: query.status === 'all' ? undefined : query.status,
      ...(query.search === undefined
        ? {}
        : {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { shortName: { contains: query.search, mode: 'insensitive' } },
              { taxId: { contains: query.search.replace(/[\s-]/g, '') } },
            ],
          }),
    },
    select: companySelect,
    // การ์ด active ขึ้นก่อน suspended (`10` §8) — 'active' < 'suspended' ตามลำดับตัวอักษร
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
  })
  return rows.map(toDto)
}

export async function getFinanceCompany(user: SessionUser, companyId: string): Promise<FinanceCompanyDto> {
  const row = await prisma.financeCompany.findFirst({
    where: { id: companyId, organizationId: user.organizationId, deletedAt: null },
    select: companySelect,
  })
  if (!row) throw new FinanceCompanyError('COMPANY_NOT_FOUND', { detail: `company=${companyId}` })
  assertCompanyInScope(user, row.id)
  return toDto(row)
}

/**
 * บัญชีผู้ใช้ฝั่งบริษัท (`10` §7.2/§14) — **read-only ใน Phase 1.8**
 * การสร้าง user ต้อง provision Supabase Auth ซึ่งขึ้นกับ flow invite/first-login (D2 ข้อ D1 ยังเปิดอยู่)
 * จึงเป็นงานของ Users module (Phase 1.9) — ที่นี่แสดงรายชื่อกับจำนวนบนการ์ดเท่านั้น
 */
export async function listCompanyUsers(user: SessionUser, companyId: string): Promise<CompanyUserDto[]> {
  await getFinanceCompany(user, companyId)
  const rows = await prisma.user.findMany({
    where: { organizationId: user.organizationId, companyId, deletedAt: null },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      status: true,
      lastLoginAt: true,
      role: { select: { name: true } },
    },
    orderBy: { fullName: 'asc' },
  })

  return rows.map((row) => ({
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    phone: row.phone,
    roleName: row.role.name,
    status: row.status,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
  }))
}

interface MutationContext {
  actor: SessionUser
  meta: RequestMeta
  reason: string
}

/** 1 บริษัท = 1 เลขประจำตัวผู้เสียภาษี (`10` §6/§11 — UNIQUE `organization_id, tax_id`) */
async function assertTaxIdAvailable(organizationId: string, taxId: string, exceptId?: string): Promise<void> {
  const duplicate = await prisma.financeCompany.findFirst({
    where: { organizationId, taxId, deletedAt: null, id: exceptId === undefined ? undefined : { not: exceptId } },
    select: { id: true, name: true },
  })
  if (duplicate) {
    throw new FinanceCompanyError('DUPLICATE_TAX_ID', {
      detail: `tax_id=${taxId} company=${duplicate.name}`,
      context: { duplicateCompanyName: duplicate.name },
    })
  }
}

/** ทุกบริษัทต้องผูกเทมเพลตค่าบริการที่ยังใช้งานอยู่และเป็นเวอร์ชันปัจจุบัน (`10` §9.1 · `12` §9) */
async function assertTemplateUsable(organizationId: string, templateId: string): Promise<void> {
  const template = await prisma.serviceFeeTemplate.findFirst({
    where: { id: templateId, organizationId, deletedAt: null, isCurrent: true },
    select: { id: true },
  })
  if (!template) throw new FinanceCompanyError('TEMPLATE_NOT_FOUND', { detail: `template=${templateId}` })
}

export async function createFinanceCompany(
  context: MutationContext,
  input: FinanceCompanyValues,
): Promise<FinanceCompanyDto> {
  const organizationId = context.actor.organizationId
  const values = normalizeCompanyValues(input)

  await assertTaxIdAvailable(organizationId, values.taxId)
  await assertTemplateUsable(organizationId, values.serviceFeeTemplateId)

  const created = await prisma.$transaction(async (tx) => {
    const company = await tx.financeCompany.create({
      data: {
        organizationId,
        name: values.name,
        shortName: values.shortName,
        taxId: values.taxId,
        address: values.address,
        phone: values.phone,
        email: values.email,
        contactName: values.contactName,
        contactPhone: values.contactPhone,
        signerName: values.signerName,
        serviceFeeTemplateId: values.serviceFeeTemplateId,
        vatRegistered: values.vatRegistered,
        defaultInvoiceDeliveryFormat: values.defaultInvoiceDeliveryFormat,
        billingDay: values.billingDay,
        paymentDueDays: values.paymentDueDays,
        status: 'active',
        createdBy: context.actor.id,
      },
      select: companySelect,
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'create',
        targetType: 'finance_companies',
        targetId: company.id,
        after: toCompanyAuditPayload(values, { status: 'active', suspendedReason: null }),
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
      },
      tx,
    )

    return company
  })

  return toDto(created)
}

export async function updateFinanceCompany(
  context: MutationContext,
  current: FinanceCompanyDto,
  input: FinanceCompanyValues,
): Promise<FinanceCompanyDto> {
  const organizationId = context.actor.organizationId
  const values = normalizeCompanyValues(input)
  const before = toValues(current)

  if (values.taxId !== current.taxId) await assertTaxIdAvailable(organizationId, values.taxId, current.id)
  if (values.serviceFeeTemplateId !== current.serviceFeeTemplateId) {
    await assertTemplateUsable(organizationId, values.serviceFeeTemplateId)
  }

  const updated = await prisma.$transaction(async (tx) => {
    const company = await tx.financeCompany.update({
      where: { id: current.id },
      data: {
        name: values.name,
        shortName: values.shortName,
        taxId: values.taxId,
        address: values.address,
        phone: values.phone,
        email: values.email,
        contactName: values.contactName,
        contactPhone: values.contactPhone,
        signerName: values.signerName,
        serviceFeeTemplateId: values.serviceFeeTemplateId,
        vatRegistered: values.vatRegistered,
        defaultInvoiceDeliveryFormat: values.defaultInvoiceDeliveryFormat,
        billingDay: values.billingDay,
        paymentDueDays: values.paymentDueDays,
        updatedBy: context.actor.id,
      },
      select: companySelect,
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'update',
        targetType: 'finance_companies',
        targetId: current.id,
        before: toCompanyAuditPayload(before, { status: current.status, suspendedReason: current.suspendedReason }),
        after: toCompanyAuditPayload(values, { status: current.status, suspendedReason: current.suspendedReason }),
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
      },
      tx,
    )

    return company
  })

  return toDto(updated)
}

/**
 * ระงับ / เปิดใช้งานบริษัท (`10` §9.3) — เหตุผลของการระงับถูกเก็บ 2 ที่โดยตั้งใจ:
 * คอลัมน์ `suspended_reason` (แสดงบนการ์ด) และ audit log (ประวัติย้อนหลัง)
 *
 * event `finance-company.suspended` (`10` §14) ยังไม่ยิงจริงในเฟสนี้ — event bus เกิด Phase 2.1
 * (ไฟล์ `45` §7) · ตัวบล็อกเคสใหม่จากบริษัท suspended อยู่ที่ไฟล์ 38 ซึ่งอ่านสถานะจากตารางนี้ตรง ๆ
 */
export async function setFinanceCompanyStatus(
  context: MutationContext,
  current: FinanceCompanyDto,
  nextStatus: CompanyStatus,
): Promise<FinanceCompanyDto> {
  const organizationId = context.actor.organizationId
  const suspendedReason = resolveSuspendedReason(nextStatus, context.reason)

  if (current.status === nextStatus && current.suspendedReason === suspendedReason) return current

  const updated = await prisma.$transaction(async (tx) => {
    const company = await tx.financeCompany.update({
      where: { id: current.id },
      data: { status: nextStatus, suspendedReason, updatedBy: context.actor.id },
      select: companySelect,
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'update',
        targetType: 'finance_companies',
        targetId: current.id,
        before: { status: current.status, suspended_reason: current.suspendedReason },
        after: { status: nextStatus, suspended_reason: suspendedReason },
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )

    return company
  })

  return toDto(updated)
}
