'use client'

import type { ReactNode } from 'react'
import { ReportBarChart } from '@/components/reports/report-bar-chart'
import { PortalKpiTile } from '@/components/portal/portal-kpi-card'
import { useNarrowScreen } from '@/components/portal/use-narrow-screen'
import type { PortalDataState } from '@/components/portal/use-portal-data'
import { Button, Card, CardHeader, EmptyState, ErrorState, LoadingState, TBody, THead, Table, Td, Th, Tr } from '@/components/ui'
import { fmtDate } from '@/lib/format/datetime'
import { fmtCount, fmtSatangSymbol } from '@/lib/format/money'
import {
  PORTAL_REVENUE_BASIS_LABEL,
  portalAlertTextClass,
  portalRevenueChartAxis,
  portalShortMonthLabel,
} from '@/lib/portal/finance-ui'
import { revenueSummaryIsEmpty, type PortalKpiTone } from '@/lib/portal/nav'
import type { PortalArAgingBucketDto, PortalArAgingDto, PortalRevenueSummaryDto } from '@/lib/portal/serializers'

type LoadState<T> = PortalDataState<T>

function StateOr<T>({ state, children }: { state: LoadState<T>; children: (data: T) => ReactNode }) {
  if (state.loading) return <LoadingState />
  if (state.error !== null) {
    return (
      <ErrorState
        title={state.error.title}
        message={state.error.message}
        {...(state.error.code === undefined ? {} : { code: state.error.code })}
        action={
          <Button variant="secondary" onClick={state.reload}>
            ลองใหม่
          </Button>
        }
      />
    )
  }
  if (state.data === null) return <EmptyState />
  return <>{children(state.data)}</>
}

/**
 * ยอดเรียกเก็บค่าบริการ 6 เดือนย้อนหลัง (`97` §6.5 Revenue Summary · mockup `renderDashboard()` ส่วนล่าง)
 * — กราฟ Recharts ตัวเดียวกับเมนูรายงาน + ตารางรายเดือน · ตัวเลขทั้งหมดจาก API (คำนวณสดฝั่ง server)
 * · ยอด = ยอดก่อน VAT ตามใบกำกับที่ออกจริง (มติ U14) — ป้ายกราฟบอกฐานชัดเจน
 * · จอแคบ: ป้ายเดือนเอียงมากขึ้น + แสดงเว้นเดือน (BUG-146)
 */
export function PortalRevenueSummaryCard({ state }: { state: LoadState<PortalRevenueSummaryDto> }) {
  const narrow = useNarrowScreen()
  return (
    <Card>
      <CardHeader
        title="ยอดเรียกเก็บค่าบริการ — 6 เดือนย้อนหลัง"
        description={
          state.data === null
            ? undefined
            : `${PORTAL_REVENUE_BASIS_LABEL} สะสม ${fmtSatangSymbol(state.data.total.revenueSatang)}`
        }
        className="mb-4"
      />
      <StateOr state={state}>
        {(data) =>
          revenueSummaryIsEmpty(data.months) ? (
            <EmptyState title="ยังไม่มียอดเรียกเก็บ" description="ยังไม่มีรอบวางบิลที่ส่งถึงบริษัทของท่านในช่วง 6 เดือนนี้" />
          ) : (
            <div className="space-y-4">
              <ReportBarChart
                title={`${PORTAL_REVENUE_BASIS_LABEL} รายเดือน`}
                // ป้ายสั้น "พ.ค. 69" — ป้ายเต็มซ้อนกันบนจอแคบ (ตารางด้านล่างยังใช้ป้ายเต็ม)
                rows={data.months.map((month) => ({
                  label: portalShortMonthLabel(month.month, month.label),
                  revenueSatang: month.revenueSatang,
                }))}
                labelKey="label"
                valueKey="revenueSatang"
                xAxis={portalRevenueChartAxis(narrow)}
              />
              <Table>
                <THead>
                  <tr>
                    <Th>เดือน</Th>
                    <Th numeric>{PORTAL_REVENUE_BASIS_LABEL}</Th>
                    <Th numeric>เคสทั้งหมด</Th>
                    <Th numeric>สำเร็จ</Th>
                    <Th numeric>ไม่สำเร็จ</Th>
                  </tr>
                </THead>
                <TBody>
                  {data.months.map((month) => (
                    <Tr key={month.month}>
                      <Td className="font-semibold whitespace-nowrap">{month.label}</Td>
                      <Td numeric className="font-semibold text-emerald-700">
                        {fmtSatangSymbol(month.revenueSatang)}
                      </Td>
                      <Td numeric>{fmtCount(month.caseCount)}</Td>
                      <Td numeric className="text-emerald-700">
                        {fmtCount(month.successCount)}
                      </Td>
                      <Td numeric className={portalAlertTextClass(month.failCount)}>
                        {fmtCount(month.failCount)}
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </div>
          )
        }
      </StateOr>
    </Card>
  )
}

const BUCKET_TONE: Readonly<Record<PortalArAgingBucketDto['tone'], PortalKpiTone>> = {
  default: 'emerald',
  warning: 'amber',
  danger: 'red',
}

/** อายุหนี้ของบริษัทตัวเอง (`97` §6.5 AR Aging · mockup `renderDashboard()` การ์ดสุดท้าย) — ช่วงวันจากค่าตั้งองค์กร */
export function PortalArAgingCard({ state }: { state: LoadState<PortalArAgingDto> }) {
  return (
    <Card>
      <CardHeader
        title="อายุหนี้ (ยอดค้างชำระแยกตามจำนวนวัน)"
        description="ยอดที่ยังค้างชำระ นับจากวันที่วางบิลจนถึงวันนี้ ยิ่งอยู่คอลัมน์ขวายิ่งค้างนาน"
        action={state.data === null ? undefined : <span className="text-xs text-slate-500">ณ วันที่ {fmtDate(state.data.asOf)}</span>}
        className="mb-4"
      />
      <StateOr state={state}>
        {(data) =>
          data.totalOutstandingSatang === 0 ? (
            <EmptyState title="ไม่มียอดค้างชำระ" description="ทุกรอบวางบิลที่ส่งถึงบริษัทของท่านชำระครบแล้ว" />
          ) : (
            <>
              <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                {data.buckets.map((bucket) => (
                  <PortalKpiTile
                    key={bucket.label}
                    label={bucket.label}
                    value={fmtSatangSymbol(bucket.outstandingSatang)}
                    tone={BUCKET_TONE[bucket.tone]}
                  />
                ))}
              </div>
              <div className="text-xs text-slate-400">
                ยอดค้างชำระรวมทั้งหมด:{' '}
                <span className={`font-bold ${portalAlertTextClass(data.totalOutstandingSatang)}`}>
                  {fmtSatangSymbol(data.totalOutstandingSatang)}
                </span>{' '}
                ·{' '}
                {fmtCount(data.batchCount)} รอบวางบิล
              </div>
            </>
          )
        }
      </StateOr>
    </Card>
  )
}
