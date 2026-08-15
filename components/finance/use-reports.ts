'use client'

import { useCallback, useEffect, useState } from 'react'
import { callApi } from '@/lib/api/types'
import type { ReportPeriodType } from '@/lib/reports/period'
import type { ProfitDimension } from '@/lib/reports/profitability'
import type { DashboardKpiReportDto, ExceptionListDto, ProfitabilityReportDto } from '@/lib/reports/types'

/**
 * ตัวโหลดข้อมูลของแท็บ "ภาพรวม" (ไฟล์ 14) และ "กำไรและต้นทุน" (ไฟล์ 21)
 * — **ห้าม fetch endpoint เหล่านี้เองในหน้าใหม่**
 *
 * ทั้งหมดเป็น GET อ่านอย่างเดียว · แม่แบบเดียวกับ `use-billing.ts` (fallback เป็นค่าคงที่ระดับ
 * โมดูลเสมอ ไม่งั้น effect วิ่งทุก render) · `reload(refresh)` = ปุ่ม "รีเฟรชตอนนี้" (`21` §17)
 */

export interface ReportState<T> {
  data: T
  loading: boolean
  error: { title: string; message: string } | null
  /** โหลดซ้ำ — `refresh = true` สั่ง backend ข้ามแคชรายวัน */
  reload: (refresh?: boolean) => Promise<void>
}

function useReport<T>(buildUrl: (refresh: boolean) => string, fallback: T): ReportState<T> {
  const [data, setData] = useState<T>(fallback)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)

  const url = buildUrl(false)

  const reload = useCallback(
    async (refresh = false) => {
      const result = await callApi<T>(refresh ? buildUrl(true) : url)
      if (result.error !== undefined) {
        setError({ title: result.error.title, message: result.error.message })
        setLoading(false)
        return
      }
      setData(result.data ?? fallback)
      setError(null)
      setLoading(false)
    },
    [buildUrl, fallback, url],
  )

  // setState อยู่หลัง `await` ใน IIFE เท่านั้น (กฎ `react-hooks/set-state-in-effect` — เหมือน `use-billing.ts`)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await callApi<T>(url)
      if (cancelled) return
      if (result.error !== undefined) {
        setError({ title: result.error.title, message: result.error.message })
        setLoading(false)
        return
      }
      setData(result.data ?? fallback)
      setError(null)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [fallback, url])

  return { data, loading, error, reload }
}

const EMPTY_PROFIT: ProfitabilityReportDto = {
  dimension: 'company',
  periodType: 'month',
  periodLabel: '',
  startDate: '',
  endDate: '',
  rows: [],
  total: { revenueSatang: 0, directCostSatang: 0, grossProfitSatang: 0, marginPct: null },
  computedAt: '',
  fromCache: false,
}

/** `GET /api/reports/profitability` — ตารางกำไรตามมิติ (`21` §8) */
export function useProfitability(dimension: ProfitDimension, period: ReportPeriodType): ReportState<ProfitabilityReportDto> {
  const buildUrl = useCallback(
    (refresh: boolean) => {
      const query = new URLSearchParams({ dimension, period })
      if (refresh) query.set('refresh', 'true')
      return `/api/reports/profitability?${query.toString()}`
    },
    [dimension, period],
  )
  return useReport<ProfitabilityReportDto>(buildUrl, EMPTY_PROFIT)
}

const EMPTY_DASHBOARD: DashboardKpiReportDto = {
  periodLabel: '',
  kpis: [],
  exceptions: { critical: 0, warning: 0, info: 0, total: 0 },
  computedAt: '',
}

/** `GET /api/finance/dashboard-kpi` — KPI 4 ตัวของ `14` §6.1 */
export function useDashboardKpi(): ReportState<DashboardKpiReportDto> {
  const buildUrl = useCallback((refresh: boolean) => {
    const query = new URLSearchParams()
    if (refresh) query.set('refresh', 'true')
    const suffix = query.toString() === '' ? '' : `?${query.toString()}`
    return `/api/finance/dashboard-kpi${suffix}`
  }, [])
  return useReport<DashboardKpiReportDto>(buildUrl, EMPTY_DASHBOARD)
}

const EMPTY_EXCEPTIONS: ExceptionListDto = {
  rows: [],
  counts: { critical: 0, warning: 0, info: 0, total: 0 },
}

/** `GET /api/finance/exceptions` — ตาราง Alert ของ `14` §8 (read-only) */
export function useExceptions(status: 'all' | 'open' = 'open'): ReportState<ExceptionListDto> {
  const buildUrl = useCallback(() => `/api/finance/exceptions?level=all&status=${status}`, [status])
  return useReport<ExceptionListDto>(buildUrl, EMPTY_EXCEPTIONS)
}
