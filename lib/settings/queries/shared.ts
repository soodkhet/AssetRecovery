import type { RequestMeta } from '@/lib/auth/request-meta'
import type { SessionUser } from '@/lib/auth/types'
// `import type` เท่านั้น — ไม่ต้องการ runtime import ของ client (ไฟล์นี้ใช้แค่ชนิดของมัน)
import type { prisma } from '@/lib/prisma'

/**
 * ชิ้นส่วนร่วมของชั้นข้อมูลไฟล์ 13
 *
 * ทุก query ในโฟลเดอร์นี้กรองด้วย `organization_id` เสมอ (multi-tenant filter — `02` §2) และทุก
 * mutation อยู่ใน `$transaction` เดียวกับ `emitAudit()` พร้อม `reason` เพราะทุกตารางของไฟล์ 13
 * อยู่ในหมวดอ่อนไหว (money/permission/bank/tax — `lib/audit/reason-policy.ts`)
 */

export interface SettingsMutationContext {
  actor: SessionUser
  meta: RequestMeta
  reason: string
}

/**
 * client ภายใน `$transaction` ของ **client ที่ต่อ extension แล้ว** (`lib/prisma.ts` ใส่
 * `auditLogImmutableExtension`) — `Prisma.TransactionClient` ใช้กับ client ที่ไม่ได้ต่อ extension
 * จึงเข้ากันไม่ได้ ต้องอนุมานจาก `typeof prisma` เอง
 */
export type SettingsTxClient = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>

/** ตัวกรอง soft delete ที่ทุกแท็บใช้ร่วมกัน (`active` = `deleted_at IS NULL`) */
export function statusFilter(status: 'active' | 'inactive' | 'all'): { deletedAt?: null | { not: null } } {
  if (status === 'active') return { deletedAt: null }
  if (status === 'inactive') return { deletedAt: { not: null } }
  return {}
}

export function toIso(value: Date): string {
  return value.toISOString()
}

/** คอลัมน์ `DATE` → `YYYY-MM-DD` (ไม่แปลง timezone — ค่าที่เก็บคือเที่ยงคืน UTC ของวันนั้น) */
export function toDateOnlyIso(value: Date): string {
  return value.toISOString().slice(0, 10)
}
