'use client'

import { useCallback, useEffect, useState } from 'react'
import { callApi } from '@/lib/api/types'
import type { BillingStatusFilter, RevenueStatusFilter } from '@/lib/revenue/revenue-ui'
import type { ArAgingReportDto, BillingBatchDto, RevenueDto } from '@/lib/revenue/types'

/**
 * ตัวโหลดข้อมูลของแท็บ "รายได้และวางบิล" (`19` §14) — **ห้าม fetch endpoint เหล่านี้เองในหน้าใหม่**
 *
 * ตัวกรองส่งไปที่ API เสมอ (ไม่กรองฝั่ง client) ให้ scope บริษัทของ `25` §7 ทำงานตรงกันทุกหน้าจอ
 * · setState อยู่หลัง `await` ใน IIFE เท่านั้น (กฎ `react-hooks/set-state-in-effect`)
 */

export interface RemoteState<T> {
  data: T
  loading: boolean
  error: { title: string; message: string } | null
  reload: () => Promise<void>
}

function useRemote<T>(url: string, fallback: T): RemoteState<T> {
  const [data, setData] = useState<T>(fallback)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)

  const fetchOnce = useCallback(async () => callApi<T>(url), [url])

  const reload = useCallback(async () => {
    const result = await fetchOnce()
    if (result.error !== undefined) {
      setError({ title: result.error.title, message: result.error.message })
      setLoading(false)
      return
    }
    setData(result.data ?? fallback)
    setError(null)
    setLoading(false)
  }, [fetchOnce, fallback])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await fetchOnce()
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
  }, [fetchOnce, fallback])

  return { data, loading, error, reload }
}

const NO_BATCHES: readonly BillingBatchDto[] = []
const NO_REVENUES: readonly RevenueDto[] = []

/** `GET /api/billing-batches` — ตารางบนของ `19` §8 */
export function useBillingBatches(
  status: BillingStatusFilter = 'all',
  companyId = '',
): RemoteState<readonly BillingBatchDto[]> {
  const query = new URLSearchParams({ status })
  if (companyId !== '') query.set('companyId', companyId)
  return useRemote<readonly BillingBatchDto[]>(`/api/billing-batches?${query.toString()}`, NO_BATCHES)
}

/** `GET /api/revenues` — ตารางล่างของ `19` §8 (รายการรายได้ดิบ) */
export function useRevenues(
  status: RevenueStatusFilter = 'all',
  companyId = '',
  unbilledOnly = false,
): RemoteState<readonly RevenueDto[]> {
  const query = new URLSearchParams({ status, unbilledOnly: unbilledOnly ? 'true' : 'false' })
  if (companyId !== '') query.set('companyId', companyId)
  return useRemote<readonly RevenueDto[]>(`/api/revenues?${query.toString()}`, NO_REVENUES)
}

const EMPTY_AGING: ArAgingReportDto = { asOf: '', buckets: [], companies: [], totalOutstandingSatang: 0 }

/** `GET /api/ar-aging` — มุมมองอายุหนี้ (`19` §6.4 · `22` §6.11) */
export function useArAging(companyId = ''): RemoteState<ArAgingReportDto> {
  const query = new URLSearchParams()
  if (companyId !== '') query.set('companyId', companyId)
  const suffix = query.toString() === '' ? '' : `?${query.toString()}`
  return useRemote<ArAgingReportDto>(`/api/ar-aging${suffix}`, EMPTY_AGING)
}
