import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Prisma } from '@/lib/generated/prisma/client'
import { type AuditClient, buildAuditRecord, emitAudit } from '@/lib/audit/audit'
import { isAuditError } from '@/lib/audit/errors'
import type { AuditEntry, AuditRecordData } from '@/lib/audit/types'

// `lib/prisma.ts` สร้าง client ทันทีตอน import ⇒ ต้อง mock ไม่งั้นเทสต์ล้มเพราะไม่มี DATABASE_URL
const { createSpy } = vi.hoisted(() => ({ createSpy: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { auditLog: { create: createSpy } } }))

const base: AuditEntry = {
  organizationId: 'org-1',
  actorId: 'user-1',
  actorRole: 'ผู้ดูแลระบบ',
  action: 'create',
  targetType: 'case_documents',
  targetId: 'doc-1',
}

/** client ปลอมที่เก็บ payload ไว้ตรวจ — แทน tx client ของ `$transaction` */
function fakeClient(): { client: AuditClient; rows: Prisma.AuditLogUncheckedCreateInput[] } {
  const rows: Prisma.AuditLogUncheckedCreateInput[] = []
  return {
    rows,
    client: {
      auditLog: {
        create: async (args) => {
          rows.push(args.data)
          return args.data
        },
      },
    },
  }
}

beforeEach(() => {
  createSpy.mockReset()
})

describe('emitAudit — เขียนครบ 9 fields (`90` §13 · `02` §10)', () => {
  it('บันทึกครบทุก field ที่สเปคบังคับ (created_at มาจาก DB default)', async () => {
    const { client, rows } = fakeClient()
    await emitAudit(
      { ...base, after: { name: 'เอกสาร' }, ipAddress: '203.0.113.9', userAgent: 'vitest' },
      client,
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({
      organizationId: 'org-1',
      actorId: 'user-1',
      actorRole: 'ผู้ดูแลระบบ',
      action: 'create',
      targetType: 'case_documents',
      targetId: 'doc-1',
      beforeData: undefined,
      afterData: { name: 'เอกสาร' },
      reason: null,
      ipAddress: '203.0.113.9',
      userAgent: 'vitest',
    })
  })

  it('ไม่ส่ง client มา = เขียนผ่าน prisma singleton', async () => {
    await emitAudit({ ...base, after: { name: 'x' } })
    expect(createSpy).toHaveBeenCalledTimes(1)
  })

  it('entry ที่ผิดกติกา reason ต้องโยนก่อนแตะ DB (ไม่มีการเขียนครึ่ง ๆ กลาง ๆ)', async () => {
    const { client, rows } = fakeClient()
    await expect(
      emitAudit({ ...base, action: 'delete', targetType: 'case_documents' }, client),
    ).rejects.toSatisfy(isAuditError)
    expect(rows).toEqual([])
  })

  it('tx client จาก $transaction ใช้กับ emitAudit ได้ (ตรวจตอน compile — `44` §11)', () => {
    const asAuditClient = (tx: Prisma.TransactionClient): AuditClient => tx
    expect(typeof asAuditClient).toBe('function')
  })
})

describe('buildAuditRecord — before/after', () => {
  function record(entry: AuditEntry): AuditRecordData {
    return buildAuditRecord(entry)
  }

  it('action `update` เก็บเฉพาะฟิลด์ที่เปลี่ยนโดยอัตโนมัติ', () => {
    const data = record({
      ...base,
      action: 'update',
      before: { id: 'doc-1', title: 'ก', note: 'เดิม' },
      after: { id: 'doc-1', title: 'ข', note: 'เดิม' },
    })
    expect(data.beforeData).toEqual({ title: 'ก' })
    expect(data.afterData).toEqual({ title: 'ข' })
  })

  it('สั่ง diffOnly = false เพื่อเก็บ snapshot เต็มได้', () => {
    const data = record({
      ...base,
      action: 'update',
      diffOnly: false,
      before: { id: 'doc-1', title: 'ก' },
      after: { id: 'doc-1', title: 'ข' },
    })
    expect(data.beforeData).toEqual({ id: 'doc-1', title: 'ก' })
    expect(data.afterData).toEqual({ id: 'doc-1', title: 'ข' })
  })

  it('action `delete` เก็บ snapshot เต็มของ before เสมอ', () => {
    const data = record({
      ...base,
      action: 'delete',
      reason: 'ลบเอกสารซ้ำ',
      before: { id: 'doc-1', title: 'ก', note: 'เดิม' },
    })
    expect(data.beforeData).toEqual({ id: 'doc-1', title: 'ก', note: 'เดิม' })
    expect(data.afterData).toBeUndefined()
  })

  it('แปลง Date เป็น ISO UTC ก่อนลง JSONB (Rule 01)', () => {
    const data = record({ ...base, after: { closedAt: new Date('2026-08-14T07:30:00.000Z') } })
    expect(data.afterData).toEqual({ closedAt: '2026-08-14T07:30:00.000Z' })
  })

  it('ปิดบังรหัสผ่าน/token ไม่ให้ค้างใน audit 5 ปี (`90` §6.2)', () => {
    const data = record({ ...base, after: { email: 'a@b.co', password: 'plain' } })
    expect(data.afterData).toEqual({ email: 'a@b.co', password: '[redacted]' })
  })

  it('reason ถูก trim และค่าว่างกลายเป็น null', () => {
    expect(record({ ...base, reason: '   ' }).reason).toBeNull()
    expect(record({ ...base, action: 'delete', reason: ' ลบทิ้ง ' }).reason).toBe('ลบทิ้ง')
  })
})
