import type { ExceptionLevel } from '@/lib/generated/prisma/enums'

/**
 * แดชบอร์ดการเงิน (ไฟล์ 14) — ชั้น **pure ล้วน ไม่มี I/O**
 *
 * ### กติกาที่ห้ามหลุด
 * - หน้านี้ **read-only ทั้งหน้า** (`14` §10 · §13) — ไม่มี mutation ⇒ ไม่มี audit
 *   ทุกปุ่มลิงก์กลับไฟล์ต้นทางเท่านั้น (`exceptionLinkOf()`)
 * - KPI 4 ตัวตาม `14` §6.1 เป๊ะ — **กำไรขั้นต้นเดือนนี้** ใช้สูตรของไฟล์ 21 (`22` §6.12)
 *   ห้ามคิดสูตรใหม่ที่นี่ (mockup วาดการ์ดที่ 4 เป็น "รายได้รวม" — สเปคชนะ mockup)
 * - Exception 3 ระดับใช้ชุดเดียวกับไฟล์ 34 (`14` §6.2) — `critical` บล็อก Export Accounting Pack
 */

// ── KPI (`14` §6.1) ─────────────────────────────────────────────────────────

export const DASHBOARD_KPI_IDS = ['pending_approval', 'pending_payout', 'ar_outstanding', 'gross_profit'] as const
export type DashboardKpiId = (typeof DASHBOARD_KPI_IDS)[number]

/** โทนสีตาม `14` §8 — amber=รออนุมัติ · blue=รอจ่าย · red=ค้างรับ · emerald=กำไร */
export type KpiTone = 'amber' | 'blue' | 'red' | 'emerald'

export interface DashboardKpiMeta {
  id: DashboardKpiId
  label: string
  tone: KpiTone
  /** ที่มาของตัวเลข — โชว์ใต้การ์ดให้ผู้ใช้ตามรอยกลับไฟล์ต้นทางได้ (`14` §4) */
  source: string
}

export const DASHBOARD_KPI_META: readonly DashboardKpiMeta[] = [
  { id: 'pending_approval', label: 'เงินรออนุมัติ (Claim)', tone: 'amber', source: 'ไฟล์ 15/16' },
  { id: 'pending_payout', label: 'เงินรอจ่าย (Payout)', tone: 'blue', source: 'ไฟล์ 17' },
  { id: 'ar_outstanding', label: 'ยอดค้างรับ (AR)', tone: 'red', source: 'ไฟล์ 19' },
  { id: 'gross_profit', label: 'กำไรขั้นต้นเดือนนี้', tone: 'emerald', source: 'ไฟล์ 21' },
]

export const KPI_TONE_CLASS: Readonly<Record<KpiTone, string>> = {
  amber: 'border-amber-200 bg-amber-50',
  blue: 'border-blue-200 bg-blue-50',
  red: 'border-red-200 bg-red-50',
  emerald: 'border-emerald-200 bg-emerald-50',
}

// ── Exception (`14` §6.2 · ไฟล์ 34) ─────────────────────────────────────────

export const EXCEPTION_LEVEL_LABEL: Readonly<Record<ExceptionLevel, string>> = {
  critical: 'ต้องแก้ก่อนปิดงวด',
  warning: 'ควรแก้ไข',
  info: 'ข้อมูลทั่วไป',
}

/** ลำดับความเร่งด่วน — `critical` ขึ้นก่อนเสมอ (`14` §8 "Alerts ที่ต้องจัดการ") */
const LEVEL_ORDER: Readonly<Record<ExceptionLevel, number>> = { critical: 0, warning: 1, info: 2 }

export function compareExceptionLevel(a: ExceptionLevel, b: ExceptionLevel): number {
  return LEVEL_ORDER[a] - LEVEL_ORDER[b]
}

export interface ExceptionCounts {
  critical: number
  warning: number
  info: number
  total: number
}

/** นับ exception ตามระดับ — ตัวเลข `critical` คือตัวที่บล็อก Export Accounting Pack (`14` §6.2) */
export function countExceptionLevels(rows: readonly { level: ExceptionLevel }[]): ExceptionCounts {
  const counts: ExceptionCounts = { critical: 0, warning: 0, info: 0, total: rows.length }
  for (const row of rows) counts[row.level] += 1
  return counts
}

/**
 * ปลายทางของปุ่ม "ดูรายละเอียด" — `14` §8 บังคับว่าต้องกลับไปถึงไฟล์ต้นทางได้จริง (§15)
 *
 * `source_module` ของ `exceptions` เป็น free text (`02` §9) ⇒ โมดูลที่ไม่รู้จักคืน `null`
 * แล้วให้ UI แสดงปุ่มจาง ๆ แทนการเดาเส้นทางผิด (หน้าบัญชีจริงเกิดใน Phase 4.7)
 */
export function exceptionLinkOf(sourceModule: string): string | null {
  switch (sourceModule) {
    case 'billing':
    case 'revenue':
      return '/finance?tab=revenue'
    case 'payout':
      return '/finance?tab=payout'
    case 'expense':
    case 'claim':
      return '/finance?tab=approval'
    case 'advance':
      return '/finance?tab=advances'
    case 'adjustment':
      return '/finance?tab=adjustment'
    case 'warehouse':
      return '/warehouse'
    case 'case':
      return '/cases/submit'
    case 'bank':
    case 'sales':
    case 'tax_invoice':
    case 'wht':
    case 'period':
    case 'export':
      return '/accounting'
    default:
      return null
  }
}

/**
 * ป้ายโมดูลต้นทางของข้อยกเว้น — **ห้ามมีเลขอ้างอิงสเปค** (Rule 05 · UAT R7cv3-B04)
 * ที่มา: billing/revenue `19` · payout `17` · expense/claim `15`/`16` · advance `15` · adjustment `20`
 * · warehouse `44` · case `38` · bank `35` · sales/tax_invoice `31` · wht `33` · period `30` · export `37`
 */
export const EXCEPTION_MODULE_LABEL: Readonly<Record<string, string>> = {
  billing: 'วางบิล',
  revenue: 'รายได้',
  payout: 'รอบจ่ายเงิน',
  expense: 'รายการเบิก',
  // `claim` = ค่าเดิมที่อาจมีในข้อมูลเก่า (โมดูลเดียวกับ `expense`) — แสดงป้ายเดียวกัน แต่ไม่ให้เลือกซ้ำในฟอร์ม
  claim: 'รายการเบิก',
  advance: 'เงินทดรองจ่าย',
  adjustment: 'ปรับปรุงรายการ',
  warehouse: 'คลังสินค้า',
  case: 'เคส',
  bank: 'กระทบยอดธนาคาร',
  sales: 'ขาย/ใบเสร็จ',
  tax_invoice: 'ใบกำกับภาษี',
  wht: 'ภาษีหัก ณ ที่จ่าย',
  // `lib/customer-wht/queries.ts` CUSTOMER_WHT_EXCEPTION_MODULE — หนังสือ 50 ทวิ ที่ลูกค้าหัก (preship R3-039)
  customer_wht: '50 ทวิ ลูกค้า',
  period: 'ปิดงวด',
  export: 'ส่งข้อมูลบัญชี',
}

/** ตัวเลือกโมดูลในฟอร์มข้อยกเว้น — ไม่ซ้ำป้าย (`claim` รวมอยู่ใน `expense`) */
export const EXCEPTION_MODULE_OPTIONS: readonly (readonly [string, string])[] = Object.entries(
  EXCEPTION_MODULE_LABEL,
).filter(([value]) => value !== 'claim')

/** ป้ายโมดูลที่ผู้ใช้อ่านรู้เรื่อง — โมดูลนอกทะเบียนแสดงค่าดิบ (ดีกว่าซ่อนข้อมูล) */
export function exceptionModuleLabel(sourceModule: string): string {
  return EXCEPTION_MODULE_LABEL[sourceModule] ?? sourceModule
}
