'use client'

import { useCallback, useEffect, useState } from 'react'
import type { AccountingPeriodDto } from '@/lib/accounting/types'
import { callApi } from '@/lib/api/types'
import type { ExportHistoryListDto } from '@/lib/exports/types'

/**
 * ประวัติการส่งมอบ + รายชื่อรอบบัญชีที่เลือก Export ได้ (`37` §8)
 * — โหลดคู่กันเพราะหน้าเดียวใช้ทั้งสองชุด (ตารางประวัติ + ตัวเลือกรอบใน Modal)
 */

export interface ExportsError {
  title: string
  message: string
}

export interface ExportsState {
  data: ExportHistoryListDto
  periods: readonly AccountingPeriodDto[]
  loading: boolean
  error: ExportsError | null
  reload: () => Promise<void>
}

const EMPTY: ExportHistoryListDto = { items: [] }

export function useExportHistory(): ExportsState {
  const [data, setData] = useState<ExportHistoryListDto>(EMPTY)
  const [periods, setPeriods] = useState<readonly AccountingPeriodDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ExportsError | null>(null)

  const load = useCallback(async (): Promise<void> => {
    const [history, periodList] = await Promise.all([
      callApi<ExportHistoryListDto>('/api/accounting/export-history'),
      callApi<AccountingPeriodDto[]>('/api/accounting/periods?limit=12'),
    ])

    if (history.error !== undefined) {
      setError({ title: history.error.title, message: history.error.message })
      setLoading(false)
      return
    }
    setData(history.data ?? EMPTY)
    // รายชื่อรอบเป็นข้อมูลเสริม — อ่านไม่ได้ (สิทธิ์ไม่ถึง) ก็ยังดูประวัติได้
    setPeriods(periodList.error === undefined ? (periodList.data ?? []) : [])
    setError(null)
    setLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (cancelled) return
      await load()
    })()
    return () => {
      cancelled = true
    }
  }, [load])

  return { data, periods, loading, error, reload: load }
}
