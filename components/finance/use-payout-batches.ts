'use client'

import { useCallback, useEffect, useState } from 'react'
import { callApi } from '@/lib/api/types'
import type { PayoutStatusFilter, PayoutSideFilter } from '@/lib/payout/payout-ui'
import type { PayoutBatchDto } from '@/lib/payout/types'

/**
 * โหลดรอบจ่ายเงิน (`17` §14) — **ห้าม fetch `/api/payout-batches` เองในหน้าใหม่**
 *
 * ตัวกรองส่งไปที่ API เสมอ (ไม่กรองฝั่ง client) ให้ scope/สิทธิ์ของ `25` ทำงานตรงกันทุกหน้าจอ
 * · setState อยู่หลัง `await` ใน IIFE เท่านั้น (กฎ `react-hooks/set-state-in-effect`)
 */

export interface PayoutBatchesState {
  items: readonly PayoutBatchDto[]
  loading: boolean
  error: { title: string; message: string } | null
  reload: () => Promise<void>
}

export function usePayoutBatches(
  status: PayoutStatusFilter = 'all',
  side: PayoutSideFilter = 'all',
): PayoutBatchesState {
  const [items, setItems] = useState<readonly PayoutBatchDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)

  const fetchItems = useCallback(
    async () => callApi<PayoutBatchDto[]>(`/api/payout-batches?status=${status}&side=${side}`),
    [status, side],
  )

  const reload = useCallback(async () => {
    const result = await fetchItems()
    if (result.error !== undefined) {
      setError({ title: result.error.title, message: result.error.message })
      setLoading(false)
      return
    }
    setItems(result.data ?? [])
    setError(null)
    setLoading(false)
  }, [fetchItems])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await fetchItems()
      if (cancelled) return
      if (result.error !== undefined) {
        setError({ title: result.error.title, message: result.error.message })
        setLoading(false)
        return
      }
      setItems(result.data ?? [])
      setError(null)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [fetchItems])

  return { items, loading, error, reload }
}
