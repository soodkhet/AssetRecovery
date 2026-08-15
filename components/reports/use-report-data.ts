'use client'

import { useCallback, useEffect, useState } from 'react'
import { callApi } from '@/lib/api/types'
import type { ReportPayload } from '@/lib/reports/payload'
import { reportRangeQuery, type ReportRangeValue } from '@/components/reports/date-range-picker'

/**
 * ตัวโหลดข้อมูลของ **ทุกรายงาน** ในเมนูรายงาน (ไฟล์ 96) — endpoint กลางตัวเดียว
 * (`GET /api/reports/:id`) ⇒ หน้าใหม่ใน 6.2–6.5 ไม่ต้องเขียน fetch เอง
 *
 * แม่แบบเดียวกับ `components/finance/use-reports.ts` (3.8): setState หลัง `await` อยู่ใน IIFE
 * ของ `useEffect` เท่านั้น · `reload(true)` = ปุ่ม "รีเฟรชตอนนี้"
 */

export interface ReportDataState {
  payload: ReportPayload | null
  loading: boolean
  error: { title: string; message: string } | null
  reload: (refresh?: boolean) => Promise<void>
}

export function useReportData(
  reportId: string,
  range: ReportRangeValue,
  params: Readonly<Record<string, string>> = {},
): ReportDataState {
  const [payload, setPayload] = useState<ReportPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)

  const paramsKey = JSON.stringify(params)

  const buildUrl = useCallback(
    (refresh: boolean) => {
      const query = reportRangeQuery(range)
      for (const [key, value] of Object.entries(JSON.parse(paramsKey) as Record<string, string>)) {
        query.set(key, value)
      }
      if (refresh) query.set('refresh', 'true')
      return `/api/reports/${reportId}?${query.toString()}`
    },
    [paramsKey, range, reportId],
  )

  const url = buildUrl(false)

  const reload = useCallback(
    async (refresh = false) => {
      setLoading(true)
      const result = await callApi<ReportPayload>(buildUrl(refresh))
      if (result.error !== undefined) {
        setError({ title: result.error.title, message: result.error.message })
        setLoading(false)
        return
      }
      setPayload(result.data ?? null)
      setError(null)
      setLoading(false)
    },
    [buildUrl],
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await callApi<ReportPayload>(url)
      if (cancelled) return
      if (result.error !== undefined) {
        setError({ title: result.error.title, message: result.error.message })
        setLoading(false)
        return
      }
      setPayload(result.data ?? null)
      setError(null)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [url])

  return { payload, loading, error, reload }
}
