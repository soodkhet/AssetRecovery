import type { AuditAction } from '@/lib/generated/prisma/enums'
import type { AuditJsonValue } from '@/lib/audit/diff'

/**
 * โครงข้อมูล audit 9 fields บังคับ (`90` §13 · `02` §10 · Rule 03)
 * `created_at` มาจาก DB default — ที่เหลืออีก 8 fields อยู่ในนี้ทั้งหมด
 */
export interface AuditEntry {
  organizationId: string
  /** NULL = system job (ต้องระบุ job id ใน `reason`) หรือ failed login ที่ยังระบุตัวตนไม่ได้ */
  actorId: string | null
  actorRole: string | null
  action: AuditAction
  /** ชื่อ**ตาราง**ปลายทาง (snake_case ตาม `02`) เช่น 'users' | 'cases' | 'expenses' */
  targetType: string
  targetId: string | null
  /** snapshot ก่อน — ส่ง record ดิบจาก Prisma ได้เลย (Date/Decimal ถูกแปลงให้เอง) */
  before?: unknown
  /** snapshot หลัง */
  after?: unknown
  /** บังคับเมื่อกระทบเงิน/สิทธิ์/ธนาคาร/ภาษี/lock period (`90` §13) — ดู `lib/audit/reason-policy.ts` */
  reason?: string | null
  ipAddress?: string | null
  userAgent?: string | null
  /**
   * true = เก็บเฉพาะ field ที่เปลี่ยนจริงลง before/after (ใช้กับ action `update` ของ row ใหญ่)
   * default ของ action `update` = true · action อื่น = false (create/delete ต้องเก็บ snapshot เต็ม)
   */
  diffOnly?: boolean
}

/** ผลลัพธ์ที่เขียนลง DB จริง — ใช้ในเทสต์/ตรวจสอบว่าครบ 9 fields */
export interface AuditRecordData {
  organizationId: string
  actorId: string | null
  actorRole: string | null
  action: AuditAction
  targetType: string
  targetId: string | null
  beforeData: AuditJsonValue | undefined
  afterData: AuditJsonValue | undefined
  reason: string | null
  ipAddress: string | null
  userAgent: string | null
}
