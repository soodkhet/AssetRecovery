'use client'

import { useCallback, useEffect, useState } from 'react'
import type { AdvanceStatusFilter } from '@/lib/advances/advance-ui'
import type { AdvanceDto } from '@/lib/advances/types'
import { callApi } from '@/lib/api/types'

/**
 * โหลดรายการเงินทดรองจ่าย (`15` §14) — ใช้ร่วมกันระหว่างแท็บ "รออนุมัติ" (ตารางที่ 2) และ
 * แท็บ "เงินทดรองจ่าย" เต็มรูป · **ห้าม fetch `/api/advances` เองในหน้าใหม่**
 *
 * ตัวกรองส่งไปที่ API เสมอ (ไม่กรองฝั่ง client) เพื่อให้ scope ระดับแถวของ `25` §7.2 ทำงานตรงกัน
 * ทุกหน้าจอ · setState อยู่หลัง `await` ใน IIFE เท่านั้น (กฎ `react-hooks/set-state-in-effect`)
 */

export interface AdvancesState {
  items: readonly AdvanceDto[]
  loading: boolean
  error: { title: string; message: string } | null
  reload: () => Promise<void>
}

/**
 * `enabled = false` = ผู้ใช้ไม่มีสิทธิ์อ่านเงินทดรอง (BUG-182 — ส่วนนั้นถูกซ่อน) ⇒ ไม่ยิง API เลย (ไม่มี 403 ใน console)
 */
export function useAdvances(status: AdvanceStatusFilter = 'all', enabled = true): AdvancesState {
  const [items, setItems] = useState<readonly AdvanceDto[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)

  const fetchItems = useCallback(
    async () => callApi<AdvanceDto[]>(`/api/advances?status=${status}`),
    [status],
  )

  const reload = useCallback(async () => {
    if (!enabled) return
    const result = await fetchItems()
    if (result.error !== undefined) {
      setError({ title: result.error.title, message: result.error.message })
      setLoading(false)
      return
    }
    setItems(result.data ?? [])
    setError(null)
    setLoading(false)
  }, [fetchItems, enabled])

  useEffect(() => {
    if (!enabled) return
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
  }, [fetchItems, enabled])

  return { items, loading, error, reload }
}
