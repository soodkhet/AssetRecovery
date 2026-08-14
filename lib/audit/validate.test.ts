import { describe, expect, it } from 'vitest'
import { isAuditError } from '@/lib/audit/errors'
import type { AuditEntry } from '@/lib/audit/types'
import { normalizeReason, validateAuditEntry } from '@/lib/audit/validate'

const base: AuditEntry = {
  organizationId: 'org-1',
  actorId: 'user-1',
  actorRole: 'Superadmin',
  action: 'update',
  targetType: 'case_documents',
  targetId: 'doc-1',
}

function expectAuditError(fn: () => unknown, code: string): void {
  try {
    fn()
  } catch (error) {
    expect(isAuditError(error)).toBe(true)
    if (isAuditError(error)) expect(error.code).toBe(code)
    return
  }
  throw new Error(`คาดว่าจะโยน ${code} แต่ผ่านไปได้`)
}

describe('validateAuditEntry — 9 fields บังคับ (`90` §13)', () => {
  it('organization_id ว่าง → REQUIRED_MISSING', () => {
    expectAuditError(() => validateAuditEntry({ ...base, organizationId: '  ' }), 'REQUIRED_MISSING')
  })

  it('target_type ว่าง → REQUIRED_MISSING', () => {
    expectAuditError(() => validateAuditEntry({ ...base, targetType: '' }), 'REQUIRED_MISSING')
  })

  it('entry ปกติผ่านและคืน reason = null', () => {
    expect(validateAuditEntry({ ...base, before: { a: 1 }, after: { a: 2 } })).toBeNull()
  })
})

describe('validateAuditEntry — บังคับ reason ตามนโยบาย', () => {
  it('แก้ยอดเงินของ expense โดยไม่มีเหตุผล → AUDIT_REASON_REQUIRED', () => {
    expectAuditError(
      () =>
        validateAuditEntry({
          ...base,
          targetType: 'expenses',
          before: { amountSatang: 10050 },
          after: { amountSatang: 20000 },
        }),
      'AUDIT_REASON_REQUIRED',
    )
  })

  it('reason ที่มีแต่ช่องว่าง ถือว่าไม่มี', () => {
    expectAuditError(
      () => validateAuditEntry({ ...base, targetType: 'bank_accounts', action: 'create', reason: '   ' }),
      'AUDIT_REASON_REQUIRED',
    )
  })

  it('มี reason แล้วผ่าน และถูก trim ให้เรียบร้อย', () => {
    expect(
      validateAuditEntry({
        ...base,
        targetType: 'expenses',
        reason: '  แก้ยอดตามใบเสร็จจริง  ',
        before: { amountSatang: 10050 },
        after: { amountSatang: 20000 },
      }),
    ).toBe('แก้ยอดตามใบเสร็จจริง')
  })

  it('เปลี่ยน role ของ user โดยไม่มีเหตุผล → AUDIT_REASON_REQUIRED (กระทบสิทธิ์)', () => {
    expectAuditError(
      () =>
        validateAuditEntry({
          ...base,
          targetType: 'users',
          before: { roleId: 'r1', phone: '08' },
          after: { roleId: 'r2', phone: '08' },
        }),
      'AUDIT_REASON_REQUIRED',
    )
  })

  it('แก้เฉพาะเบอร์โทรของ user ไม่ต้องมีเหตุผล', () => {
    expect(
      validateAuditEntry({
        ...base,
        targetType: 'users',
        before: { roleId: 'r1', phone: '08' },
        after: { roleId: 'r1', phone: '09' },
      }),
    ).toBeNull()
  })

  it('audit ของ background job (actor = system) ต้องมี reason ที่ระบุ job id', () => {
    expectAuditError(
      () => validateAuditEntry({ ...base, actorId: null, actorRole: null, action: 'create' }),
      'AUDIT_REASON_REQUIRED',
    )
    expect(
      validateAuditEntry({
        ...base,
        actorId: null,
        actorRole: null,
        action: 'create',
        reason: 'job=advance-overdue-2026-08-14',
      }),
    ).toBe('job=advance-overdue-2026-08-14')
  })

  it('failed login (ยังไม่รู้ตัวตน) ไม่ต้องมี reason', () => {
    expect(
      validateAuditEntry({
        ...base,
        actorId: null,
        actorRole: null,
        action: 'login',
        targetType: 'users',
        after: { result: 'failed', code: 'INVALID_CREDENTIALS' },
      }),
    ).toBeNull()
  })
})

describe('normalizeReason', () => {
  it.each([
    [undefined, null],
    [null, null],
    ['', null],
    ['   ', null],
    [' เหตุผล ', 'เหตุผล'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeReason(input)).toBe(expected)
  })
})
