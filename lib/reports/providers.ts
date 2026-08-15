import type { SessionUser } from '@/lib/auth/types'
import { ACCOUNTING_REPORT_PROVIDERS } from '@/lib/reports/accounting/providers'
import { EXECUTIVE_REPORT_PROVIDERS } from '@/lib/reports/executive/providers'
import { FINANCE_REPORT_PROVIDERS } from '@/lib/reports/finance/providers'
import { OPERATIONS_REPORT_PROVIDERS } from '@/lib/reports/operations/providers'
import type { ReportDefinition } from '@/lib/reports/catalog'
import type { ReportData } from '@/lib/reports/payload'
import type { ReportRange } from '@/lib/reports/range'

/**
 * ทะเบียนตัวคำนวณของรายงานแต่ละตัว — **ไม่มี business logic ในไฟล์นี้**
 * (แนวเดียวกับ `JOB_HANDLERS` ของ 5.3: ทะเบียนกลางเปล่า ๆ ที่โมดูลเจ้าของงานมาต่อสาย)
 *
 * Phase 6.1 วางแค่โครง — 6.2 (หมวด F), 6.3 (O), 6.4 (A), 6.5 (E) เติม provider ของตัวเองครบแล้ว
 * ⇒ **รายงานทั้ง 17 ตัวของ `96` เปิดใช้งานครบ** · กลไก "ยังไม่เปิดใช้งาน" (API ตอบ
 * `REPORT_NOT_FOUND` / หน้าจอไม่ลิงก์ให้กด) ยังคงอยู่สำหรับรายงานที่จะเพิ่มในอนาคต
 *
 * ### กติกาของ provider
 * - **อ่านอย่างเดียว** (`96` §1) — ห้าม mutation ห้าม audit ห้ามสร้าง/แก้ข้อมูลต้นทาง
 * - กรองด้วย `ctx.user.organizationId` เสมอ และถ้า `ctx.teamIds !== null` ต้องกรองทีมด้วย
 *   (ผู้จัดการเห็นเฉพาะทีมตัวเอง — `96` §10) · รายการทีมว่าง = ผลลัพธ์ว่าง ห้ามตีความว่า "ทุกทีม"
 * - คืนเงินเป็น **satang** และวันที่เป็น ISO เสมอ — การจัดรูปเป็น พ.ศ./บาท อยู่ชั้นแสดงผล
 * - ห้ามอ่านแคชเอง: ตัวรัน (`runReport()`) ห่อแคชตามโหมดของ `96` §8 ให้แล้ว
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

/**
 * report id → provider (6.2–6.5 เติมที่นี่)
 *
 * โมดูลเจ้าของงานส่งทะเบียนของหมวดตัวเองเข้ามา (แนวเดียวกับ `JOB_HANDLERS`) — ทิศทางการ import
 * เป็น "ทะเบียนกลาง → โมดูลหมวด" ทางเดียวเสมอ ส่วนโมดูลหมวดอ้าง `ReportContext` ด้วย `import type`
 * เท่านั้น ⇒ ไม่มี cycle ตอนรันจริง
 */
export const REPORT_PROVIDERS: Partial<Record<string, ReportProvider>> = {
  ...FINANCE_REPORT_PROVIDERS,
  ...OPERATIONS_REPORT_PROVIDERS,
  ...ACCOUNTING_REPORT_PROVIDERS,
  ...EXECUTIVE_REPORT_PROVIDERS,
}

export function reportProviderOf(id: string): ReportProvider | null {
  return REPORT_PROVIDERS[id] ?? null
}

export function hasReportProvider(id: string): boolean {
  return REPORT_PROVIDERS[id] !== undefined
}
