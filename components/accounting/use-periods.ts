'use client'

import { useCallback, useEffect, useState } from 'react'
import type { AccountingPeriodDto } from '@/lib/accounting/types'
import { callApi } from '@/lib/api/types'

/**
 * โหลดตารางรอบบัญชี (`30` §14 `GET /api/accounting/periods`)
 *
 * ⚠️ endpoint นี้ **เปิดรอบของเดือนที่ยังไม่มีให้ก่อน** (พร้อม audit) ⇒ เรียกซ้ำได้ปลอดภัยแต่ห้าม
 *    เรียกถี่ ๆ ในลูป · `criticalCount`/`warningCount` เป็น derived นับสดจาก `exceptions` ทุกครั้ง
 * รายชื่อรอบชุดนี้ใช้ต่อได้ทั้งฟอร์มสร้าง Exception และ `<ExportPackModal>` (4.6)
 */

export interface PeriodsError {
  title: string
  message: string
}

export interface PeriodsState {
  items: readonly AccountingPeriodDto[]
  loading: boolean
  error: PeriodsError | null
  reload: () => Promise<void>
}

export function usePeriods(limit = 12): PeriodsState {
  const [items, setItems] = useState<readonly AccountingPeriodDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<PeriodsError | null>(null)

  const load = useCallback(async (): Promise<void> => {
    const result = await callApi<AccountingPeriodDto[]>(`/api/accounting/periods?limit=${limit}`)
    if (result.error !== undefined) {
      setError({ title: result.error.title, message: result.error.message })
      setLoading(false)
      return
    }
    setItems(result.data ?? [])
    setError(null)
    setLoading(false)
  }, [limit])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await callApi<AccountingPeriodDto[]>(`/api/accounting/periods?limit=${limit}`)
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
  }, [limit])

  return { items, loading, error, reload: load }
}
