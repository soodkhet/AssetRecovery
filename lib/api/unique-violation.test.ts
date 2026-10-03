import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveScope } from '@/lib/auth/scope'
import type { SessionUser } from '@/lib/auth/types'
import { Prisma } from '@/lib/generated/prisma/client'

/**
 * UAT BUG-016 — คำขอสร้าง master data ที่ยิงพร้อมกันหลุด pre-check ทั้งคู่ แล้วตัวที่แพ้ชน unique index
 * ได้ Prisma `P2002` ซึ่งเดิมหลุดเป็น 500 body ว่าง ⇒ ต้องได้ error code ของโมดูลตาม `24`
 *
 * จำลองสถานการณ์แข่งกัน: pre-check (findFirst) ไม่เจอแถวซ้ำ แต่ `$transaction` โยน P2002
 * Prisma ถูก mock ทั้งก้อน (pattern `lib/finance-companies/queries.audit.test.ts`)
 */
const prismaMock = vi.hoisted(() => ({
  team: { findFirst: vi.fn() },
  compensationPlan: { findFirst: vi.fn() },
  user: { findFirst: vi.fn(), findMany: vi.fn() },
  financeCompany: { findFirst: vi.fn() },
  serviceFeeTemplate: { findFirst: vi.fn() },
  taxProfile: { findFirst: vi.fn() },
  bankAccount: { findFirst: vi.fn() },
  payeeProfile: { findFirst: vi.fn() },
  $transaction: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

const { isUniqueViolation, onUniqueViolation } = await import('@/lib/api/unique-violation')
const { createTeam } = await import('@/lib/teams/queries')
const { createFinanceCompany } = await import('@/lib/finance-companies/queries')
const { createServiceFeeTemplate } = await import('@/lib/service-fee/queries')
const { createCompensationPlan } = await import('@/lib/compensation/queries')
const { createTaxProfile } = await import('@/lib/settings/queries/tax-profiles')
const { createBankAccount } = await import('@/lib/settings/queries/bank-accounts')
const { createPayee } = await import('@/lib/payees/queries')

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  })
}

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

const context = { actor, meta: { ipAddress: '10.0.0.1', userAgent: 'vitest' }, reason: 'ทดสอบ' }

beforeEach(() => {
  vi.clearAllMocks()
  for (const model of Object.values(prismaMock)) {
    if (typeof model === 'object') {
      for (const fn of Object.values(model)) fn.mockResolvedValue(null)
    }
  }
  prismaMock.user.findMany.mockResolvedValue([])
  prismaMock.$transaction.mockRejectedValue(p2002())
})

describe('onUniqueViolation()', () => {
  it('จับเฉพาะ P2002 แล้วเรียก handler', async () => {
    const handler = vi.fn(() => {
      throw new Error('converted')
    })
    await expect(Promise.reject(p2002()).catch(onUniqueViolation(handler))).rejects.toThrow('converted')
    expect(handler).toHaveBeenCalledOnce()
  })

  it('error อื่นโยนต่อเดิม ไม่เรียก handler', async () => {
    const other = new Prisma.PrismaClientKnownRequestError('FK failed', { code: 'P2003', clientVersion: 'test' })
    const handler = vi.fn(() => {
      throw new Error('converted')
    })
    await expect(Promise.reject(other).catch(onUniqueViolation(handler))).rejects.toBe(other)
    expect(handler).not.toHaveBeenCalled()
    expect(isUniqueViolation(other)).toBe(false)
    expect(isUniqueViolation(p2002())).toBe(true)
  })
})

describe('P2002 จากคำขอพร้อมกัน → error code ของโมดูล (ไม่ใช่ 500)', () => {
  it('POST /api/teams ชื่อซ้ำ → DUPLICATE_TEAM_NAME (400)', async () => {
    prismaMock.compensationPlan.findFirst.mockResolvedValue({ id: 'plan-1' })
    await expect(
      createTeam(context, {
        name: 'ทีมกรุงเทพ',
        side: 'inhouse',
        compensationPlanId: 'plan-1',
        supervisorId: null,
        managerIds: [],
        provinces: ['กรุงเทพมหานคร'],
        status: 'active',
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_TEAM_NAME', status: 400 })
  })

  it('pre-check ซ้ำเจอแถวของอีกคำขอแล้ว → ยังได้ DUPLICATE_TEAM_NAME', async () => {
    prismaMock.compensationPlan.findFirst.mockResolvedValue({ id: 'plan-1' })
    prismaMock.team.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'team-winner' })
    await expect(
      createTeam(context, {
        name: 'ทีมกรุงเทพ',
        side: 'inhouse',
        compensationPlanId: 'plan-1',
        supervisorId: null,
        managerIds: [],
        provinces: ['กรุงเทพมหานคร'],
        status: 'active',
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_TEAM_NAME' })
  })

  it('บริษัทไฟแนนซ์ tax_id ซ้ำ → DUPLICATE_TAX_ID', async () => {
    prismaMock.serviceFeeTemplate.findFirst.mockResolvedValue({ id: 'tpl-1' })
    await expect(
      createFinanceCompany(context, {
        name: 'บริษัท ทดสอบ จำกัด',
        shortName: 'T',
        taxId: '0105512345678',
        address: null,
        phone: null,
        email: null,
        contactName: null,
        contactPhone: null,
        signerName: null,
        serviceFeeTemplateId: 'tpl-1',
        vatRegistered: true,
        vatMode: 'exclude_vat',
        whtWithheldByCustomerPct: null,
        defaultInvoiceDeliveryFormat: 'paper_pdf',
        billingDay: 1,
        paymentDueDays: 30,
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_TAX_ID', status: 400 })
  })

  it('เทมเพลตค่าบริการชื่อซ้ำ → DUPLICATE_TEMPLATE_NAME', async () => {
    await expect(
      createServiceFeeTemplate(context, {
        name: 'ค่าบริการมาตรฐาน',
        model: 'FLAT',
        baseSatang: 50000,
        ratePct: 0,
        basis: null,
        chargeOnFail: false,
        chargePerTrackingRound: false,
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_TEMPLATE_NAME' })
  })

  it('แผนค่าตอบแทนชื่อซ้ำ → DUPLICATE_TEMPLATE_NAME', async () => {
    await expect(
      createCompensationPlan(context, {
        name: 'แผน A',
        side: 'inhouse',
        fuelMode: 'PER_KM',
        fuelRatePerKmSatang: 500,
        fuelMaxPerCaseSatang: null,
        fuelDailyFlatSatang: null,
        allowanceSatang: 0,
        commissionSatang: 100000,
        noSuccessFeeSatang: 0,
        hotelMaxPerNightSatang: null,
        hotelReceiptRequired: false,
        whtPct: 3,
        effectiveFrom: '2026-10-01',
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_TEMPLATE_NAME' })
  })

  it('tax profile ชื่อซ้ำ → DUPLICATE_TAX_PROFILE_NAME', async () => {
    await expect(
      createTaxProfile(context, {
        name: 'บุคคลธรรมดา 3%',
        whtPct: 3,
        whtBasis: 'before_vat',
        whtMinThresholdSatang: 100000,
        incomeType: '40(2)',
        filingForm: 'PND3',
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_TAX_PROFILE_NAME' })
  })

  it('บัญชีธนาคารเลขซ้ำ → DUPLICATE_BANK_ACCOUNT', async () => {
    await expect(
      createBankAccount(context, {
        bankName: 'KBANK',
        accountName: 'บริษัท ทดสอบ',
        accountNumber: '1234567890',
        accountType: 'current',
        usage: 'both',
        statementFormat: null,
        paymentFileFormat: null,
        autoMatchToleranceDays: 3,
        isPrimary: false,
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_BANK_ACCOUNT' })
  })

  it('payee ของผู้ใช้คนเดิม (1 user = 1 payee) → PAYEE_ALREADY_EXISTS', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 'user-1', fullName: 'สมชาย' })
    await expect(
      createPayee(context, {
        userId: 'user-1',
        payeeType: 'individual',
        taxProfileId: null,
        nationalId: null,
        bankName: null,
        accountName: null,
        accountNumber: null,
        idDocumentUrl: null,
      }),
    ).rejects.toMatchObject({ code: 'PAYEE_ALREADY_EXISTS' })
  })
})
