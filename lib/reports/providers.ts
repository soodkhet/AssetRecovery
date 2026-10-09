import { ACCOUNTING_REPORT_PROVIDERS } from '@/lib/reports/accounting/providers'
import { EXECUTIVE_REPORT_PROVIDERS } from '@/lib/reports/executive/providers'
import { FINANCE_REPORT_PROVIDERS } from '@/lib/reports/finance/providers'
import { OPERATIONS_REPORT_PROVIDERS } from '@/lib/reports/operations/providers'
import type { ReportProvider } from '@/lib/reports/provider-types'

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

export type { ReportContext, ReportProvider } from '@/lib/reports/provider-types'

/**
 * report id → provider (6.2–6.5 เติมที่นี่)
 *
 * โมดูลเจ้าของงานส่งทะเบียนของหมวดตัวเองเข้ามา (แนวเดียวกับ `JOB_HANDLERS`) — ทิศทางการ import
 * เป็น "ทะเบียนกลาง → โมดูลหมวด" ทางเดียวเสมอ ส่วนโมดูลหมวดอ้างรูป provider จาก
 * `lib/reports/provider-types.ts` ⇒ ไม่มี import วน
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
