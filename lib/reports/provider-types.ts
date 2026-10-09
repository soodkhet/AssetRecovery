import type { SessionUser } from '@/lib/auth/types'
import type { ReportDefinition } from '@/lib/reports/catalog'
import type { ReportData } from '@/lib/reports/payload'
import type { ReportRange } from '@/lib/reports/range'

/**
 * รูปของ provider รายงาน — แยกจากทะเบียน `lib/reports/providers.ts` ให้โมดูลหมวด (F/O/A/E) อ้างได้
 * โดยไม่ import ทะเบียนกลางกลับ (ตัด import วนแม้แบบ type-only — staging S-008) · กติกา provider ดูหัวไฟล์ทะเบียน
 */

export interface ReportContext {
  readonly user: SessionUser
  readonly report: ReportDefinition
  readonly range: ReportRange
  /** ทีมที่ผู้เรียกเห็นได้ — `null` = ทุกทีมในองค์กร (`lib/reports/access.ts`) */
  readonly teamIds: readonly string[] | null
  /** พารามิเตอร์เฉพาะรายงาน (เช่น `dimension`, `companyId`) — มาจาก query string ที่ผ่าน Zod แล้ว */
  readonly params: Readonly<Record<string, string>>
  readonly now: Date
}

export type ReportProvider = (context: ReportContext) => Promise<ReportData>
