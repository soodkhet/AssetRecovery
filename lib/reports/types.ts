import type { ExceptionLevel, ExceptionStatus } from '@/lib/generated/prisma/enums'
import type { DashboardKpiId, KpiTone } from '@/lib/reports/dashboard'
import type { CostBreakdownRow, ProfitDimension } from '@/lib/reports/profitability'
import type { ReportPeriodType } from '@/lib/reports/period'

/**
 * DTO ของรายงานกำไร (ไฟล์ 21) และแดชบอร์ดการเงิน (ไฟล์ 14) — ใช้ร่วม FE/BE
 * เงินทุกช่องเป็น **satang** (Rule 01) · `marginPct` เป็น `number | null` (`null` ⇒ แสดง `N/A`)
 * · ป้ายช่วงเวลาเป็น **พ.ศ.** เสมอ · instant เป็น ISO UTC (FE แปลงด้วย `fmtDateTime`)
 */

export interface ProfitabilityRowDto {
  key: string
  label: string
  revenueSatang: number
  directCostSatang: number
  grossProfitSatang: number
  /** `null` เมื่อ `revenue = 0` — ห้ามหารศูนย์ (`22` §6.12) */
  marginPct: number | null
  revenueCaseCount: number
  costCaseCount: number
}

export interface ProfitabilityReportDto {
  dimension: ProfitDimension
  periodType: ReportPeriodType
  /** ป้าย พ.ศ. เช่น "สิงหาคม 2569" / "ไตรมาส 3/2569" / "ปี 2569" */
  periodLabel: string
  /** ขอบเขตช่วงเวลาแบบ `YYYY-MM-DD` (ค.ศ.) — สำหรับ debug/ตรวจสอบ ไม่ใช่สำหรับแสดงผล */
  startDate: string
  endDate: string
  rows: readonly ProfitabilityRowDto[]
  total: {
    revenueSatang: number
    directCostSatang: number
    grossProfitSatang: number
    marginPct: number | null
  }
  /** เวลาที่ตัวเลขชุดนี้ถูกคำนวณ (ISO UTC) — แคชรายวัน (`21` §17) */
  computedAt: string
  fromCache: boolean
}

export interface ProfitabilityDrilldownDto {
  dimension: ProfitDimension
  dimensionId: string
  dimensionLabel: string
  periodLabel: string
  revenueSatang: number
  directCostSatang: number
  grossProfitSatang: number
  marginPct: number | null
  revenueCaseCount: number
  costCaseCount: number
  costBreakdown: readonly CostBreakdownRow[]
  /** เคสที่มีต้นทุนแต่ไม่มีรายได้ (`21` §16) — ตัวเลขที่พิสูจน์ว่า margin ถูกกดลงจริง */
  lossMaking: { caseCount: number; costSatang: number }
}

export interface DashboardKpiDto {
  id: DashboardKpiId
  label: string
  tone: KpiTone
  source: string
  amountSatang: number
  /** ข้อความใต้ตัวเลข เช่น "12 รายการ" */
  hint: string
  /** เฉพาะการ์ดกำไร — `null` ⇒ แสดง `N/A` */
  marginPct?: number | null
}

export interface DashboardKpiReportDto {
  /** ป้ายเดือนปัจจุบัน (พ.ศ.) ของการ์ดกำไรขั้นต้น */
  periodLabel: string
  kpis: readonly DashboardKpiDto[]
  exceptions: { critical: number; warning: number; info: number; total: number }
  computedAt: string
}

export interface ExceptionDto {
  id: string
  level: ExceptionLevel
  status: ExceptionStatus
  title: string
  description: string
  sourceModule: string
  sourceModuleLabel: string
  sourceRef: string | null
  /** งวดบัญชีของ exception (พ.ศ.) */
  periodLabel: string
  /** ปลายทางปุ่ม "ดูรายละเอียด" — `null` = ยังไม่มีหน้าจริงให้ลิงก์ไป (`14` §8) */
  link: string | null
  createdAt: string
}

export interface ExceptionListDto {
  rows: readonly ExceptionDto[]
  counts: { critical: number; warning: number; info: number; total: number }
}
