'use client'

import { useCallback, useEffect, useState } from 'react'
import { callApi } from '@/lib/api/types'
import type { ReportPayload } from '@/lib/reports/payload'
import { isReportRangeReady, reportRangeQuery, type ReportRangeValue } from '@/components/reports/date-range-picker'

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

/**
 * mytester6 T-027 — URL ของคำขอรายงาน · ช่วง "กำหนดเอง" ที่ยังเลือกไม่ครบ/กลับหัว ⇒ `null` (ไม่ยิงคำขอที่รู้อยู่แล้วว่าได้ 400)
 */
export function reportDataUrl(
  reportId: string,
  range: ReportRangeValue,
  params: Readonly<Record<string, string>> = {},
  refresh = false,
): string | null {
  if (!isReportRangeReady(range)) return null
  const query = reportRangeQuery(range)
  for (const [key, value] of Object.entries(params)) query.set(key, value)
  if (refresh) query.set('refresh', 'true')
  return `/api/reports/${reportId}?${query.toString()}`
}

/**
 * mytester6 T-027 รีวิว — ข้อความเมื่อช่วง "กำหนดเอง" ยังเลือกไม่ครบ (ไม่ยิงคำขอ) · ช่วงพร้อม ⇒ `null`
 * มีข้อมูลค้างจากช่วงก่อน ⇒ บอกชัดว่าที่เห็นเป็นของช่วงไหน (ไม่ให้เข้าใจผิดว่าเป็นช่วงที่กำลังเลือก)
 */
export function reportRangePendingNotice(
  ready: boolean,
  previousRangeLabel: string | null,
): { title: string; message: string } | null {
  if (ready) return null
  return previousRangeLabel === null
    ? { title: 'ยังเลือกช่วงวันที่ไม่ครบ', message: 'เลือกวันเริ่มและวันสิ้นสุดให้ครบเพื่อแสดงรายงาน' }
    : {
        title: 'ยังเลือกช่วงวันที่ไม่ครบ',
        message: `ข้อมูลที่แสดงอยู่เป็นของช่วงก่อนหน้า (${previousRangeLabel}) — เลือกวันเริ่มและวันสิ้นสุดให้ครบเพื่อดูช่วงใหม่`,
      }
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
    (refresh: boolean) => reportDataUrl(reportId, range, JSON.parse(paramsKey) as Record<string, string>, refresh),
    [paramsKey, range, reportId],
  )

  const url = buildUrl(false)

  const reload = useCallback(
    async (refresh = false) => {
      const target = buildUrl(refresh)
      if (target === null) return
      setLoading(true)
      const result = await callApi<ReportPayload>(target)
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
    // ช่วงยังไม่ครบ ⇒ ไม่ยิง · ข้อมูลเดิมค้างไว้พร้อมคำแนะนำของตัวเลือกช่วง
    if (url === null) return
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

  // ช่วงยังไม่ครบ = ไม่ได้กำลังโหลด (ตัวเลือกช่วงต้องกรอกต่อได้ แม้เปิดหน้ามาด้วย URL ที่ช่วงไม่ครบ)
  return { payload, loading: url === null ? false : loading, error, reload }
}
