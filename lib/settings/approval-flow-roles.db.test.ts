import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@/lib/generated/prisma/client'

/**
 * มติ PO U149 (Final Test ด่าน 5 ND-7) — สายอนุมัติเก็บ **role id**
 *  · ชื่อขั้นอ่านสดจาก role ⇒ เปลี่ยนชื่อ role แล้วสายยังชี้ role เดิม
 *  · นับสายที่อ้าง role (ฐานของ `ROLE_IN_USE` ตอนลบ role) — สายที่ปิดใช้งานแล้วไม่นับ
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

const ORG_ID = '00000000-0000-4000-8000-0000000d1490'
const ROLE_MANAGER = '00000000-0000-4000-8000-0000000d1491'
const ROLE_FINANCE = '00000000-0000-4000-8000-0000000d1492'
const ROLE_CUSTOM = '00000000-0000-4000-8000-0000000d1493'
const USER_ID = '00000000-0000-4000-8000-0000000d1494'
const MATRIX_A = '00000000-0000-4000-8000-0000000d1495'
const MATRIX_B = '00000000-0000-4000-8000-0000000d1496'
const MATRIX_OFF = '00000000-0000-4000-8000-0000000d1497'

let client: PrismaClient | null = null
let matrixQueries: typeof import('@/lib/settings/queries/approval-matrix')
let roleQueries: typeof import('@/lib/roles/queries')

function db(): PrismaClient {
  if (!url) throw new Error('ไม่มี TEST_DATABASE_URL')
  if (!client) {
    assertLocalTestDatabase(url)
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  }
  return client
}

/** ล้างเฉพาะสายอนุมัติ — users/roles คงไว้แบบ upsert (ลบ user แตะ audit_logs ที่ immutable) */
async function cleanup(): Promise<void> {
  await db().$executeRawUnsafe(`DELETE FROM approval_matrices WHERE organization_id = '${ORG_ID}'`)
}

suite('สายอนุมัติอ้าง role ด้วย id (มติ PO U149)', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = url
    matrixQueries = await import('@/lib/settings/queries/approval-matrix')
    roleQueries = await import('@/lib/roles/queries')
    await db().$executeRawUnsafe(`
      INSERT INTO organizations (id, name, tax_id, address)
      VALUES ('${ORG_ID}', 'ApprovalFlowU149', '9999999914900', 'ที่อยู่ทดสอบ U149') ON CONFLICT (id) DO NOTHING
    `)
    await cleanup()
    await db().$executeRawUnsafe(`
      INSERT INTO roles (id, organization_id, name, role_group, is_seed) VALUES
        ('${ROLE_MANAGER}', '${ORG_ID}', 'ผู้จัดการทีมติดตามทรัพย์', 'inhouse', true),
        ('${ROLE_FINANCE}', '${ORG_ID}', 'การเงิน', 'system', true),
        ('${ROLE_CUSTOM}', '${ORG_ID}', 'ผู้ตรวจพิเศษ', 'system', false)
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
    `)
    await db().$executeRawUnsafe(`
      INSERT INTO users (id, organization_id, role_id, email, full_name, status)
      VALUES ('${USER_ID}', '${ORG_ID}', '${ROLE_FINANCE}', 'fin-u149@test.local', 'การเงิน U149', 'active')
      ON CONFLICT (id) DO NOTHING
    `)
    await db().$executeRawUnsafe(`
      INSERT INTO approval_matrices
        (id, organization_id, condition, condition_threshold_satang, approval_flow_role_ids, enforce_segregation_of_duties, created_by, deleted_at)
      VALUES
        ('${MATRIX_A}', '${ORG_ID}', 'ปกติ', 500000, ARRAY['${ROLE_MANAGER}', '${ROLE_FINANCE}']::uuid[], false, '${USER_ID}', NULL),
        ('${MATRIX_B}', '${ORG_ID}', 'พิเศษ', NULL, ARRAY['${ROLE_CUSTOM}']::uuid[], false, '${USER_ID}', NULL),
        ('${MATRIX_OFF}', '${ORG_ID}', 'ปิดแล้ว', NULL, ARRAY['${ROLE_CUSTOM}']::uuid[], false, '${USER_ID}', NOW())
    `)
  })

  afterAll(async () => {
    await cleanup()
    await client?.$disconnect()
  })

  it('DTO คืน role id ที่เก็บจริง + ชื่อปัจจุบันของแต่ละขั้น', async () => {
    const matrix = await matrixQueries.getApprovalMatrix(ORG_ID, MATRIX_A)
    expect(matrix.approvalFlowRoleIds).toEqual([ROLE_MANAGER, ROLE_FINANCE])
    expect(matrix.approvalFlow).toEqual(['ผู้จัดการทีมติดตามทรัพย์', 'การเงิน'])
  })

  it('เปลี่ยนชื่อ role แล้วสายยังชี้ role เดิม (ชื่อใหม่แสดงทันที ไม่ต้องแก้สาย)', async () => {
    await db().role.update({ where: { id: ROLE_CUSTOM }, data: { name: 'ผู้ตรวจพิเศษ (ใหม่)' } })
    const matrix = await matrixQueries.getApprovalMatrix(ORG_ID, MATRIX_B)
    expect(matrix.approvalFlowRoleIds).toEqual([ROLE_CUSTOM])
    expect(matrix.approvalFlow).toEqual(['ผู้ตรวจพิเศษ (ใหม่)'])
  })

  it('นับสายที่ยังใช้งานซึ่งอ้าง role — สายที่ปิดแล้วไม่นับ · role ที่ไม่อยู่ในสาย = 0', async () => {
    expect(await roleQueries.countRoleApprovalMatrices(ORG_ID, ROLE_CUSTOM)).toBe(1)
    expect(await roleQueries.countRoleApprovalMatrices(ORG_ID, ROLE_FINANCE)).toBe(1)
    expect(await roleQueries.countRoleApprovalMatrices(ORG_ID, USER_ID)).toBe(0)
  })

  it('ตัวตรวจขั้นใช้ role id — role สร้างเองไม่ใช่ผู้อนุมัติ', async () => {
    expect(await matrixQueries.findInvalidApprovalSteps(ORG_ID, [ROLE_MANAGER, ROLE_FINANCE])).toEqual([])
    expect(await matrixQueries.findInvalidApprovalSteps(ORG_ID, [ROLE_CUSTOM])).toEqual([ROLE_CUSTOM])
  })
})
