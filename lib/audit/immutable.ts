import { Prisma } from '@/lib/generated/prisma/client'
import { AuditError } from '@/lib/audit/errors'

/**
 * Immutable guard ระดับ service ของ `audit_logs` (`02` §13 · `90` §10/§17 · Rule 03)
 * "ห้ามแก้ไข/ลบเด็ดขาด ไม่มีข้อยกเว้น แม้แต่ Superadmin"
 *
 * ชั้นนี้กันทางที่ผ่าน Prisma Client (ต่อสายจริงใน `lib/prisma.ts` ผ่าน `$extends`)
 * ส่วนทาง raw SQL / psql / งาน ops กันด้วย trigger ระดับ DB
 * (migration `20260814091702_audit_logs_immutable`) — ต้องมีทั้งสองชั้นเสมอ
 */

/** operation ของ Prisma ที่ทำให้แถว audit เปลี่ยน/หาย — ห้ามทั้งหมด */
export const AUDIT_LOG_FORBIDDEN_OPERATIONS: readonly string[] = [
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
  'upsert',
]

export function isForbiddenAuditLogOperation(operation: string): boolean {
  return AUDIT_LOG_FORBIDDEN_OPERATIONS.includes(operation)
}

/** โยน `AUDIT_IMMUTABLE` เมื่อพยายามแก้/ลบ audit log — ปล่อยผ่านเฉพาะ create/read */
export function assertAuditLogOperationAllowed(operation: string): void {
  if (isForbiddenAuditLogOperation(operation)) {
    throw new AuditError('AUDIT_IMMUTABLE', `prisma.auditLog.${operation}()`)
  }
}

/**
 * Prisma extension ที่ต่อสายยามตัวบนเข้ากับ client จริง — ใช้ใน `lib/prisma.ts`
 * แยกออกมาเป็นค่าคงที่เพื่อให้เทสต์ประกอบ client ชุดเดียวกันมาพิสูจน์ได้ว่ากันได้จริง
 */
export const auditLogImmutableExtension = Prisma.defineExtension({
  name: 'audit-logs-immutable',
  query: {
    auditLog: {
      $allOperations({ operation, args, query }) {
        assertAuditLogOperationAllowed(operation)
        return query(args)
      },
    },
  },
})
