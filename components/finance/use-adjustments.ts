'use client'

import { useCallback, useEffect, useState } from 'react'
import type { AdjustmentStatusFilter, AdjustmentTargetFilter } from '@/lib/adjustments/adjustment-ui'
import type { AdjustmentDto } from '@/lib/adjustments/types'
import { callApi } from '@/lib/api/types'

/**
 * โหลดรายการปรับปรุง (`20` §14) — **ห้าม fetch `/api/adjustments` เองในหน้าใหม่**
 *
 * ตัวกรองส่งไปที่ API เสมอ (ไม่กรองฝั่ง client) · setState อยู่หลัง `await` ใน IIFE เท่านั้น
 * (กฎ `react-hooks/set-state-in-effect`)
 */

export interface AdjustmentsState {
  items: readonly AdjustmentDto[]
  loading: boolean
  error: { title: string; message: string } | null
  reload: () => Promise<void>
}

export function useAdjustments(
  status: AdjustmentStatusFilter = 'all',
  targetType: AdjustmentTargetFilter = 'all',
): AdjustmentsState {
  const [items, setItems] = useState<readonly AdjustmentDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)

  const fetchItems = useCallback(async () => {
    const query = new URLSearchParams({ status })
    if (targetType !== 'all') query.set('targetType', targetType)
    return callApi<AdjustmentDto[]>(`/api/adjustments?${query.toString()}`)
  }, [status, targetType])

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
