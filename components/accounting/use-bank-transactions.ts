'use client'

import { useCallback, useEffect, useState } from 'react'
import { callApi } from '@/lib/api/types'
import type { BankTransactionListDto } from '@/lib/bank-recon/types'
import type { BankMatchStatus } from '@/lib/generated/prisma/enums'

/**
 * โหลดรายการเดินบัญชี (`35` §14) — **ห้าม fetch `/api/bank-reconciliation/*` เองในหน้าใหม่**
 *
 * ตัวกรองส่งไปที่ API เสมอ (ไม่กรองฝั่ง client) · setState อยู่หลัง `await` ใน IIFE เท่านั้น
 * (กฎ `react-hooks/set-state-in-effect`)
 */

export type BankStatusFilter = BankMatchStatus | 'all'

const EMPTY: BankTransactionListDto = {
  items: [],
  summary: {
    total: 0,
    unmatched: 0,
    autoMatched: 0,
    manualMatched: 0,
    unmatchedResolved: 0,
    totalInSatang: 0,
    totalOutSatang: 0,
  },
}

export interface BankTransactionsState {
  data: BankTransactionListDto
  loading: boolean
  error: { title: string; message: string } | null
  reload: () => Promise<void>
}

export function useBankTransactions(status: BankStatusFilter = 'all'): BankTransactionsState {
  const [data, setData] = useState<BankTransactionListDto>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)

  const fetchItems = useCallback(async () => {
    const query = new URLSearchParams()
    if (status !== 'all') query.set('status', status)
    const suffix = query.toString() === '' ? '' : `?${query.toString()}`
    return callApi<BankTransactionListDto>(`/api/bank-reconciliation/transactions${suffix}`)
  }, [status])

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
