'use client'

import { useCallback, useEffect, useState } from 'react'
import { callApi } from '@/lib/api/types'
import type { DocumentStatus } from '@/lib/expenses/expense-record'
import type { ExpenseRecordListDto } from '@/lib/expenses/types'

/**
 * โหลดบัญชีค่าใช้จ่าย (`32` §14) — **ห้าม fetch `/api/accounting/expenses` เองในหน้าใหม่**
 *
 * ตัวกรองส่งไปที่ API เสมอ (ไม่กรองฝั่ง client) · setState อยู่หลัง `await` ใน IIFE เท่านั้น
 * (กฎ `react-hooks/set-state-in-effect`)
 */

export type ExpenseDocumentFilter = DocumentStatus | 'all'

const EMPTY: ExpenseRecordListDto = {
  items: [],
  summary: { count: 0, grossSatang: 0, whtSatang: 0, netSatang: 0, incompleteCount: 0, unmappedCount: 0 },
  costCenters: [],
}

export interface ExpenseRecordsState {
  data: ExpenseRecordListDto
  loading: boolean
  error: { title: string; message: string } | null
  reload: () => Promise<void>
}

export function useExpenseRecords(documentStatus: ExpenseDocumentFilter = 'all'): ExpenseRecordsState {
  const [data, setData] = useState<ExpenseRecordListDto>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)

  const fetchItems = useCallback(async () => {
    const query = new URLSearchParams()
    if (documentStatus !== 'all') query.set('documentStatus', documentStatus)
    const suffix = query.toString() === '' ? '' : `?${query.toString()}`
    return callApi<ExpenseRecordListDto>(`/api/accounting/expenses${suffix}`)
  }, [documentStatus])

  const reload = useCallback(async () => {
    const result = await fetchItems()
    if (result.error !== undefined) {
      setError({ title: result.error.title, message: result.error.message })
      setLoading(false)
      return
    }
    setData(result.data ?? EMPTY)
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
      setData(result.data ?? EMPTY)
      setError(null)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [fetchItems])

  return { data, loading, error, reload }
}
