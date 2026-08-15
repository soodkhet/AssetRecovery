'use client'

import {
  CompensationScreen,
  GrossProfitScreen,
  RevenueSummaryScreen,
} from '@/components/reports/finance/finance-report-screens'
import { ReportView } from '@/components/reports/report-view'
import type { ReportDefinition } from '@/lib/reports/catalog'

/**
 * ทะเบียน "หน้าจอเฉพาะรายงาน" — รายงานที่มีตัวกรอง/กราฟของตัวเองมาลงทะเบียนที่นี่
 * รายงานที่ไม่มีอะไรพิเศษใช้ `<ReportView>` ตรง ๆ (F3/F5 เป็นรายงาน ณ วันที่ ไม่มีพารามิเตอร์)
 *
 * หน้ารายงานกลาง (`app/(app)/reports/[reportId]/page.tsx`) เป็นทางเข้าเดียวของทุกรายงาน
 * ⇒ ยามสิทธิ์/เมนู/สถานะ "ยังไม่เปิดใช้งาน" อยู่ที่เดียว ไม่แตกเป็นหน้าละมาตรฐาน (6.1)
 */

type ScreenProps = { report: Pick<ReportDefinition, 'id' | 'code' | 'title'> }

const SCREENS: Readonly<Record<string, (props: ScreenProps) => React.ReactElement>> = {
  'gross-profit': GrossProfitScreen,
  'revenue-summary': RevenueSummaryScreen,
  compensation: CompensationScreen,
}

export function ReportScreen({ report }: ScreenProps) {
  const Screen = SCREENS[report.id]
  if (Screen !== undefined) return <Screen report={report} />
  return <ReportView report={report} />
}
