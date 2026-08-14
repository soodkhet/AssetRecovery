import { describe, expect, it } from 'vitest'
import { isAuditError } from '@/lib/audit/errors'
import {
  AUDIT_LOG_FORBIDDEN_OPERATIONS,
  assertAuditLogOperationAllowed,
  isForbiddenAuditLogOperation,
} from '@/lib/audit/immutable'

describe('immutable guard ระดับ service (`02` §13 · `90` §17)', () => {
  it.each([...AUDIT_LOG_FORBIDDEN_OPERATIONS])('prisma.auditLog.%s() ต้องโยน AUDIT_IMMUTABLE', (operation) => {
    try {
      assertAuditLogOperationAllowed(operation)
    } catch (error) {
      expect(isAuditError(error)).toBe(true)
      if (isAuditError(error)) {
        expect(error.code).toBe('AUDIT_IMMUTABLE')
        expect(error.status).toBe(403)
      }
      return
    }
    throw new Error(`operation ${operation} ต้องถูกปฏิเสธ`)
  })

  it.each(['create', 'createMany', 'findMany', 'findFirst', 'count', 'aggregate'])(
    'operation `%s` ยังทำได้ตามปกติ',
    (operation) => {
      expect(isForbiddenAuditLogOperation(operation)).toBe(false)
      expect(() => assertAuditLogOperationAllowed(operation)).not.toThrow()
    },
  )

  it('ครอบคลุม operation ที่ลบ/แก้ได้ครบทุกตัวของ Prisma', () => {
    expect([...AUDIT_LOG_FORBIDDEN_OPERATIONS].sort()).toEqual(
      ['delete', 'deleteMany', 'update', 'updateMany', 'updateManyAndReturn', 'upsert'].sort(),
    )
  })
})
