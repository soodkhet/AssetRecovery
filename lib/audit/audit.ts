import type { Prisma } from '@/lib/generated/prisma/client'
import type { AuditAction } from '@/lib/generated/prisma/enums'
import { prisma } from '@/lib/prisma'

/**
 * Audit emit helper — **ทุก mutation ต้องผ่านที่นี่** (`90` §13 · Rule 03)
 *
 * ⚠️ ก้อนนี้เป็น interface ตั้งต้นที่ Phase 1.3 ต้องใช้ก่อน (audit login/logout/failed login)
 *    **Phase 1.4 (Audit Core)** จะต่อยอดไฟล์นี้: validator บังคับ `reason` เมื่อกระทบเงิน/สิทธิ์/
 *    ธนาคาร/ภาษี/lock period · before/after diff util · immutable guard ระดับ DB (trigger กัน UPDATE/DELETE)
 *    — ห้ามสร้าง helper audit ตัวใหม่ซ้ำที่อื่น ให้แก้ไฟล์นี้แทน
 *
 * ครบ 9 fields บังคับ: actor_id, role, action, target_type, target_id, before, after, reason, created_at
 * (`created_at` มาจาก DB default)
 */
export interface AuditEntry {
  organizationId: string
  /** NULL = system job (ต้องระบุ job id ใน `reason`) หรือ failed login ที่ยังระบุตัวตนไม่ได้ */
  actorId: string | null
  actorRole: string | null
  action: AuditAction
  /** ชื่อตารางปลายทาง เช่น 'users' | 'cases' | 'expenses' */
  targetType: string
  targetId: string | null
  before?: Prisma.InputJsonValue | null
  after?: Prisma.InputJsonValue | null
  /** บังคับเมื่อกระทบเงิน/สิทธิ์/ธนาคาร/ภาษี/lock period (validator เต็มอยู่ใน Phase 1.4) */
  reason?: string | null
  ipAddress?: string | null
  userAgent?: string | null
}

export async function emitAudit(entry: AuditEntry): Promise<void> {
  await prisma.auditLog.create({
    data: {
      organizationId: entry.organizationId,
      actorId: entry.actorId,
      actorRole: entry.actorRole,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      beforeData: entry.before ?? undefined,
      afterData: entry.after ?? undefined,
      reason: entry.reason ?? null,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
    },
  })
}
