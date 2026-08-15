'use client'

import {
  ExceptionSummaryScreen,
  TaxInvoiceScreen,
  WhtSummaryScreen,
} from '@/components/reports/accounting/accounting-report-screens'
import { KpiSummaryScreen } from '@/components/reports/executive/executive-report-screens'
import {
  CompensationScreen,
  GrossProfitScreen,
  RevenueSummaryScreen,
} from '@/components/reports/finance/finance-report-screens'
import {
  SuccessRateScreen,
  TeamPerformanceScreen,
  WarehouseSummaryScreen,
} from '@/components/reports/operations/operations-report-screens'
import { ReportView } from '@/components/reports/report-view'
import type { ReportDefinition } from '@/lib/reports/catalog'

/**
 * ทะเบียน "หน้าจอเฉพาะรายงาน" — รายงานที่มีตัวกรอง/กราฟของตัวเองมาลงทะเบียนที่นี่
 * รายงานที่ไม่มีอะไรพิเศษใช้ `<ReportView>` ตรง ๆ (F3/F5 เป็นรายงาน ณ วันที่ ไม่มีพารามิเตอร์ ·
 * O3/O4 ก็เช่นกัน — O4 เป็นรายการเคสที่ค้างอยู่ ณ ตอนนี้ · A3 เป็นตารางประวัติล้วน ·
 * E2/E3 เป็น Scorecard ตารางล้วนตาม `96` §6-E2/E3)
 *
 * หน้ารายงานกลาง (`app/(app)/reports/[reportId]/page.tsx`) เป็นทางเข้าเดียวของทุกรายงาน
 * ⇒ ยามสิทธิ์/เมนู/สถานะ "ยังไม่เปิดใช้งาน" อยู่ที่เดียว ไม่แตกเป็นหน้าละมาตรฐาน (6.1)
 */

type ScreenProps = { report: Pick<ReportDefinition, 'id' | 'code' | 'title'> }

const SCREENS: Readonly<Record<string, (props: ScreenProps) => React.ReactElement>> = {
  'gross-profit': GrossProfitScreen,
  'revenue-summary': RevenueSummaryScreen,
  compensation: CompensationScreen,
  'success-rate': SuccessRateScreen,
  'team-performance': TeamPerformanceScreen,
  'warehouse-summary': WarehouseSummaryScreen,
  'wht-summary': WhtSummaryScreen,
  'tax-invoice': TaxInvoiceScreen,
  'exception-summary': ExceptionSummaryScreen,
  'kpi-summary': KpiSummaryScreen,
}

export function ReportScreen({ report }: ScreenProps) {
  const Screen = SCREENS[report.id]
  if (Screen !== undefined) return <Screen report={report} />
  return <ReportView report={report} />
}
