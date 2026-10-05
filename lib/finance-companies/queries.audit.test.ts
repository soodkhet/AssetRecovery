import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveScope } from '@/lib/auth/scope'
import type { SessionUser } from '@/lib/auth/types'
import type { FinanceCompanyValues } from '@/lib/finance-companies/company'
import type { FinanceCompanyDto } from '@/lib/finance-companies/types'
import { Prisma } from '@/lib/generated/prisma/client'

/**
 * ชั้น service ของบริษัทไฟแนนซ์ — **UAT BUG-001** (มติ PO 03/10/2569): `vat_mode` และ
 * `wht_withheld_by_customer_pct` ต้องถูกบันทึกจริงทั้งตอนสร้าง/แก้ไข และลง audit (before/after) ครบ
 * พร้อม `reason` (ทั้ง 2 ฟิลด์อยู่หมวด **ภาษี** ของ `lib/audit/reason-policy.ts`)
 *
 * Prisma ถูก mock ทั้งก้อน — ตรวจ "เขียนอะไรลง DB/audit" ไม่ได้แตะ DB จริง (pattern `lib/roles/queries.audit.test.ts`)
 */
const prismaMock = vi.hoisted(() => {
  const client = {
    financeCompany: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    serviceFeeTemplate: { findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  }
  return client
})
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

const { createFinanceCompany, updateFinanceCompany } = await import('@/lib/finance-companies/queries')

const COMPANY_ID = '00000000-0000-4000-8000-0000000b0001'
const TEMPLATE_ID = '00000000-0000-4000-8000-0000000b0002'

const actor: SessionUser = {
  id: 'actor-1',
  organizationId: 'org-1',
  supabaseUid: 'uid-1',
  email: 'superadmin@example.com',
  fullName: 'ผู้ดูแลระบบ',
  status: 'active',
  roleId: 'role-superadmin',
  roleName: 'Superadmin',
  roleGroup: 'system',
  isSuperadmin: true,
  teamId: null,
  companyId: null,
  capabilities: {},
  scope: resolveScope({
    userId: 'actor-1',
    roleGroup: 'system',
    roleName: 'Superadmin',
    teamId: null,
    companyId: null,
    managedTeamIds: [],
    supervisedTeamIds: [],
  }),
  loginAt: new Date().toISOString(),
}

const context = {
  actor,
  meta: { ipAddress: '10.0.0.1', userAgent: 'vitest' },
  reason: 'บริษัทนี้ไม่หักภาษี ณ ที่จ่าย และตกลงราคารวม VAT',
}

const values: FinanceCompanyValues = {
  name: 'บริษัท ทดสอบไฟแนนซ์ จำกัด',
  shortName: 'TF',
  taxId: '0105512345678',
  branchCode: '00000',
  address: null,
  phone: null,
  email: null,
  contactName: null,
  contactPhone: null,
  signerName: null,
  serviceFeeTemplateId: TEMPLATE_ID,
  vatRegistered: true,
  vatMode: 'include_vat',
  whtWithheldByCustomerPct: null,
  defaultInvoiceDeliveryFormat: 'paper_pdf',
  billingDay: 1,
  paymentDueDays: 30,
}

/** แถวที่ Prisma คืนกลับ (รูปเดียวกับ `companySelect`) — Decimal เป็น `Prisma.Decimal` จริง */
function rowOf(overrides: { vatMode: FinanceCompanyValues['vatMode']; whtPct: string | null }) {
  return {
    id: COMPANY_ID,
    name: values.name,
    shortName: values.shortName,
    taxId: values.taxId,
    address: null,
    phone: null,
    email: null,
    contactName: null,
    contactPhone: null,
    signerName: null,
    serviceFeeTemplateId: TEMPLATE_ID,
    vatRegistered: true,
    vatMode: overrides.vatMode,
    whtWithheldByCustomerPct: overrides.whtPct === null ? null : new Prisma.Decimal(overrides.whtPct),
    defaultInvoiceDeliveryFormat: 'paper_pdf',
    billingDay: 1,
    paymentDueDays: 30,
    status: 'active',
    suspendedReason: null,
    updatedAt: new Date('2026-10-03T03:00:00Z'),
    serviceFeeTemplate: { name: 'มาตรฐาน', model: 'fixed' },
    _count: { cases: 0, users: 0 },
  }
}

type AuditData = { data: Record<string, unknown> }
type WriteArgs = { data: Record<string, unknown> }

function auditCall(): Record<string, unknown> {
  const args = prismaMock.auditLog.create.mock.calls[0]?.[0] as AuditData | undefined
  if (!args) throw new Error('ไม่มีการเขียน audit')
  return args.data
}

describe('createFinanceCompany — vat_mode + wht_withheld_by_customer_pct (UAT BUG-001)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.$transaction.mockImplementation((run: (tx: typeof prismaMock) => Promise<unknown>) => run(prismaMock))
    prismaMock.financeCompany.findFirst.mockResolvedValue(null)
    prismaMock.serviceFeeTemplate.findFirst.mockResolvedValue({ id: TEMPLATE_ID })
  })

  it('ลูกค้าไม่หัก (null) + ราคารวม VAT → บันทึก NULL จริง + include_vat และลง audit ครบพร้อม reason', async () => {
    prismaMock.financeCompany.create.mockResolvedValue(rowOf({ vatMode: 'include_vat', whtPct: null }))

    const dto = await createFinanceCompany(context, values)

    const write = prismaMock.financeCompany.create.mock.calls[0]?.[0] as WriteArgs
    expect(write.data.vatMode).toBe('include_vat')
    expect(write.data.whtWithheldByCustomerPct).toBeNull()

    expect(dto.vatMode).toBe('include_vat')
    expect(dto.whtWithheldByCustomerPct).toBeNull()

    const audit = auditCall()
    expect(audit).toMatchObject({
      actorId: 'actor-1',
      actorRole: 'Superadmin',
      action: 'create',
      targetType: 'finance_companies',
      targetId: COMPANY_ID,
      reason: context.reason,
    })
    expect(audit.afterData).toMatchObject({ vat_mode: 'include_vat', wht_withheld_by_customer_pct: null })
  })

  it('อัตราทศนิยม 2 ตำแหน่งถูกแปลงเป็น Decimal ผ่าน toFixed(2) (กันเศษ float) และ DTO คืนเป็น number', async () => {
    prismaMock.financeCompany.create.mockResolvedValue(rowOf({ vatMode: 'exclude_vat', whtPct: '1.50' }))

    const dto = await createFinanceCompany(context, { ...values, vatMode: 'exclude_vat', whtWithheldByCustomerPct: 1.5 })

    const write = prismaMock.financeCompany.create.mock.calls[0]?.[0] as WriteArgs
    expect(write.data.whtWithheldByCustomerPct).toBeInstanceOf(Prisma.Decimal)
    expect(String(write.data.whtWithheldByCustomerPct)).toBe('1.5')
    expect(dto.whtWithheldByCustomerPct).toBe(1.5)
  })
})

describe('updateFinanceCompany — เปลี่ยน vat_mode / อัตราที่ลูกค้าหัก', () => {
  const current: FinanceCompanyDto = {
    id: COMPANY_ID,
    name: values.name,
    shortName: values.shortName,
    taxId: values.taxId,
    branchCode: values.branchCode,
    address: null,
    phone: null,
    email: null,
    contactName: null,
    contactPhone: null,
    signerName: null,
    serviceFeeTemplateId: TEMPLATE_ID,
    serviceFeeTemplateName: 'มาตรฐาน',
    serviceFeeTemplateModel: 'fixed',
    vatRegistered: true,
    vatMode: 'exclude_vat',
    whtWithheldByCustomerPct: 3,
    defaultInvoiceDeliveryFormat: 'paper_pdf',
    billingDay: 1,
    paymentDueDays: 30,
    status: 'active',
    suspendedReason: null,
    caseCount: 0,
    userCount: 0,
    updatedAt: '2026-10-03T03:00:00.000Z',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.$transaction.mockImplementation((run: (tx: typeof prismaMock) => Promise<unknown>) => run(prismaMock))
  })

  it('3.00% → ไม่หัก และ exclude → include: เขียนลง DB + audit before/after เฉพาะฟิลด์ที่เปลี่ยน พร้อม reason', async () => {
    prismaMock.financeCompany.update.mockResolvedValue(rowOf({ vatMode: 'include_vat', whtPct: null }))

    const dto = await updateFinanceCompany(context, current, values)

    const write = prismaMock.financeCompany.update.mock.calls[0]?.[0] as WriteArgs
    expect(write.data.vatMode).toBe('include_vat')
    expect(write.data.whtWithheldByCustomerPct).toBeNull()
    expect(dto.whtWithheldByCustomerPct).toBeNull()

    const audit = auditCall()
    expect(audit).toMatchObject({ action: 'update', targetType: 'finance_companies', reason: context.reason })
    expect(audit.beforeData).toEqual({ vat_mode: 'exclude_vat', wht_withheld_by_customer_pct: 3 })
    expect(audit.afterData).toEqual({ vat_mode: 'include_vat', wht_withheld_by_customer_pct: null })
    // ไม่แตะตรวจเลขภาษี/เทมเพลตซ้ำเมื่อสองค่านั้นไม่เปลี่ยน
    expect(prismaMock.financeCompany.findFirst).not.toHaveBeenCalled()
  })
})
