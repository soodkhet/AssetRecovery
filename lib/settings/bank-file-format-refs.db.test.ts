import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { resolveScope } from '@/lib/auth/scope'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'

/**
 * มติ PO U147 (Final Test ด่าน 5 ND-5) — บัญชีธนาคารอ้างรูปแบบไฟล์ด้วย **id** และชนิดต้องตรงช่อง
 *  · ช่อง statement อ้างรูปแบบไฟล์โอน (หรือกลับกัน) / รูปแบบที่ปิดใช้งาน ⇒ `BANK_FILE_FORMAT_NOT_FOUND`
 *  · ปิดใช้งานรูปแบบที่บัญชียังอ้างอยู่ ⇒ `BANK_FILE_FORMAT_IN_USE`
 *  · สร้างรูปแบบ: ชื่อธนาคารระบบเขียนจากรหัส · ทดสอบรูปแบบ statement ผ่านได้จริง
 *
 * ⚠️ ตั้ง `DATABASE_URL = TEST_DATABASE_URL` ก่อน import service
 */

const url = process.env.TEST_DATABASE_URL

function assertLocalTestDatabase(connectionString: string): void {
  const parsed = new URL(connectionString)
  const isLocal = ['localhost', '127.0.0.1', '::1', 'postgres'].includes(parsed.hostname)
  if (!isLocal || !parsed.pathname.includes('test')) {
    throw new Error(`TEST_DATABASE_URL ต้องเป็น DB ทดสอบบนเครื่อง/CI เท่านั้น (host=${parsed.hostname}) — Rule 07`)
  }
}

const suite = url ? describe : describe.skip

const ORG_ID = '00000000-0000-4000-8000-0000000d1470'
const ROLE_ID = '00000000-0000-4000-8000-0000000d1471'
const USER_ID = '00000000-0000-4000-8000-0000000d1472'

let client: PrismaClient | null = null
let formats: typeof import('@/lib/settings/queries/bank-file-formats')
let accounts: typeof import('@/lib/settings/queries/bank-accounts')

function db(): PrismaClient {
  if (!url) throw new Error('ไม่มี TEST_DATABASE_URL')
  if (!client) {
    assertLocalTestDatabase(url)
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  }
  return client
}

const actor: SessionUser = {
  id: USER_ID,
  organizationId: ORG_ID,
  supabaseUid: 'uid-u147',
  email: 'sa-u147@test.local',
  fullName: 'ผู้ดูแล U147',
  status: 'active',
  roleId: ROLE_ID,
  roleName: 'Superadmin',
  roleGroup: 'system',
  isSuperadmin: true,
  teamId: null,
  companyId: null,
  capabilities: {},
  scope: resolveScope({
    userId: USER_ID,
    roleGroup: 'system',
    roleName: 'Superadmin',
    teamId: null,
    companyId: null,
    managedTeamIds: [],
    supervisedTeamIds: [],
  }),
  loginAt: new Date().toISOString(),
}

const context = { actor, meta: { ipAddress: '127.0.0.1', userAgent: 'vitest' }, reason: 'ทดสอบมติ U147' }

async function expectCode(run: () => Promise<unknown>, code: string): Promise<void> {
  await expect(run()).rejects.toMatchObject({ code })
}

const baseAccount = {
  bankName: 'ธนาคารกสิกรไทย',
  accountName: 'บจก. ทดสอบ U147',
  accountType: 'current' as const,
  usage: 'both' as const,
  autoMatchToleranceDays: 7,
  isPrimary: false,
}

suite('รูปแบบไฟล์ธนาคาร ↔ บัญชีธนาคาร (มติ PO U147)', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = url
    formats = await import('@/lib/settings/queries/bank-file-formats')
    accounts = await import('@/lib/settings/queries/bank-accounts')
    await db().$executeRawUnsafe(`
      INSERT INTO organizations (id, name, tax_id, address)
      VALUES ('${ORG_ID}', 'BankFileU147', '9999999914700', 'ที่อยู่ทดสอบ U147') ON CONFLICT (id) DO NOTHING
    `)
    await db().$executeRawUnsafe(`
      INSERT INTO roles (id, organization_id, name, role_group, is_seed)
      VALUES ('${ROLE_ID}', '${ORG_ID}', 'Superadmin', 'system', true) ON CONFLICT (id) DO NOTHING
    `)
    await db().$executeRawUnsafe(`
      INSERT INTO users (id, organization_id, role_id, email, full_name, status)
      VALUES ('${USER_ID}', '${ORG_ID}', '${ROLE_ID}', 'sa-u147@test.local', 'ผู้ดูแล U147', 'active')
      ON CONFLICT (id) DO NOTHING
    `)
    // รอบก่อนอาจทิ้งแถวไว้ — บัญชี/รูปแบบของ org นี้เท่านั้น (audit_logs ไม่แตะ)
    await db().$executeRawUnsafe(`DELETE FROM bank_accounts WHERE organization_id = '${ORG_ID}'`)
    await db().$executeRawUnsafe(`DELETE FROM bank_file_formats WHERE organization_id = '${ORG_ID}'`)
  })

  afterAll(async () => {
    await db().$executeRawUnsafe(`DELETE FROM bank_accounts WHERE organization_id = '${ORG_ID}'`)
    await db().$executeRawUnsafe(`DELETE FROM bank_file_formats WHERE organization_id = '${ORG_ID}'`)
    await client?.$disconnect()
  })

  it('สร้างรูปแบบ: ชื่อธนาคารมาจากรายการมาตรฐานตามรหัส · statement ทดสอบผ่านจริง', async () => {
    const statement = await formats.createBankFileFormat(context, {
      purpose: 'statement',
      bankCode: '004',
      fileType: 'CSV',
      encoding: 'UTF_8',
      columnMapping: 'transaction_date,description,amount_in,amount_out',
    })
    expect(statement.bankName).toBe('ธนาคารกสิกรไทย')
    expect(statement.purpose).toBe('statement')
    const tested = await formats.testBankFileFormat(context, statement)
    expect(tested.result.issues).toEqual([])
    expect(tested.format.testStatus).toBe('passed')
  })

  it('บัญชีอ้างรูปแบบด้วย id — ชนิดตรงช่องเท่านั้น · ปิดใช้งานรูปแบบที่ถูกอ้างไม่ได้', async () => {
    const statement = await formats.createBankFileFormat(context, {
      purpose: 'statement',
      bankCode: '014',
      fileType: 'CSV',
      encoding: 'UTF_8',
      columnMapping: 'transaction_date,amount',
    })
    const payment = await formats.createBankFileFormat(context, {
      purpose: 'payment',
      bankCode: '014',
      fileType: 'CSV',
      encoding: 'UTF_8',
      columnMapping: 'receiving_bank_code,receiving_account_no,receiving_account_name,amount',
    })

    // ผิดช่อง (statement ↔ ไฟล์โอน) = ไม่พบรูปแบบของชนิดนั้น
    await expectCode(
      () =>
        accounts.createBankAccount(context, {
          ...baseAccount,
          accountNumber: '1470000001',
          statementFormatId: payment.id,
          paymentFileFormatId: null,
        }),
      'BANK_FILE_FORMAT_NOT_FOUND',
    )

    const account = await accounts.createBankAccount(context, {
      ...baseAccount,
      accountNumber: '1470000002',
      statementFormatId: statement.id,
      paymentFileFormatId: payment.id,
    })
    expect(account.statementFormatId).toBe(statement.id)
    expect(account.paymentFileFormatLabel).toContain('ธนาคารไทยพาณิชย์')

    await expectCode(() => formats.deleteBankFileFormat(context, statement), 'BANK_FILE_FORMAT_IN_USE')

    // ปลดออกจากบัญชีแล้ว ⇒ ปิดใช้งานได้ · หลังปิดแล้วบัญชีอ้างใหม่ไม่ได้
    const detached = await accounts.updateBankAccount(context, account, {
      ...baseAccount,
      accountNumber: '1470000002',
      statementFormatId: null,
      paymentFileFormatId: payment.id,
    })
    expect(detached.statementFormatId).toBeNull()
    const closed = await formats.deleteBankFileFormat(context, statement)
    expect(closed.isActive).toBe(false)
    await expectCode(
      () =>
        accounts.updateBankAccount(context, detached, {
          ...baseAccount,
          accountNumber: '1470000002',
          statementFormatId: statement.id,
          paymentFileFormatId: payment.id,
        }),
      'BANK_FILE_FORMAT_NOT_FOUND',
    )
  })
})
