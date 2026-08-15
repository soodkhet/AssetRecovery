'use client'

import { useCallback, useEffect, useState } from 'react'
import { callApi } from '@/lib/api/types'
import type { CashReceiptListDto, SalesListDto } from '@/lib/sales/types'

/**
 * โหลดรายการขาย (`31` §14 `GET /api/accounting/sales`) และเงินรับ (`GET /api/accounting/cash-receipts`)
 * — **ห้าม fetch สอง endpoint นี้เองในหน้าใหม่**
 *
 * ทั้งคู่เป็น **read-only ฝั่ง API** (รายการขายเกิดตอนส่งบิล · เงินรับเกิดตอนกระทบยอด — `31` §6.1/§6.3)
 * ⇒ hook นี้มีแต่ `reload()` ไม่มี mutation · ตัวกรองส่งไปที่ API เสมอ ไม่กรองฝั่ง client
 */

export type SalesInvoiceFilter = 'all' | 'issued' | 'awaiting'

const EMPTY_SALES: SalesListDto = {
  items: [],
  totalBeforeVatSatang: 0,
  vatSatang: 0,
  totalSatang: 0,
  awaitingInvoiceCount: 0,
}

const EMPTY_RECEIPTS: CashReceiptListDto = {
  items: [],
  totalSatang: 0,
  totalWhtWithheldByCustomerSatang: 0,
}

export interface ListError {
  title: string
  message: string
}

export interface SalesState {
  data: SalesListDto
  loading: boolean
  error: ListError | null
  reload: () => Promise<void>
}

export function useSalesRecords(invoiceState: SalesInvoiceFilter, periodId = ''): SalesState {
  const [data, setData] = useState<SalesListDto>(EMPTY_SALES)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ListError | null>(null)

  const params = new URLSearchParams()
  if (invoiceState !== 'all') params.set('invoiceState', invoiceState)
  if (periodId !== '') params.set('periodId', periodId)
  const query = params.toString()
  const url = query === '' ? '/api/accounting/sales' : `/api/accounting/sales?${query}`

  const apply = useCallback((result: Awaited<ReturnType<typeof callApi<SalesListDto>>>) => {
    if (result.error !== undefined) {
      setError({ title: result.error.title, message: result.error.message })
      setLoading(false)
      return
    }
    setData(result.data ?? EMPTY_SALES)
    setError(null)
    setLoading(false)
  }, [])

  const reload = useCallback(async () => {
    apply(await callApi<SalesListDto>(url))
  }, [apply, url])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await callApi<SalesListDto>(url)
      if (cancelled) return
      apply(result)
    })()
    return () => {
      cancelled = true
    }
  }, [apply, url])

  return { data, loading, error, reload }
}

export interface CashReceiptsState {
  data: CashReceiptListDto
  loading: boolean
  error: ListError | null
  reload: () => Promise<void>
}

export function useCashReceipts(periodId = ''): CashReceiptsState {
  const [data, setData] = useState<CashReceiptListDto>(EMPTY_RECEIPTS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ListError | null>(null)

  const url =
    periodId === '' ? '/api/accounting/cash-receipts' : `/api/accounting/cash-receipts?periodId=${periodId}`

  const apply = useCallback((result: Awaited<ReturnType<typeof callApi<CashReceiptListDto>>>) => {
    if (result.error !== undefined) {
      setError({ title: result.error.title, message: result.error.message })
      setLoading(false)
      return
    }
    setData(result.data ?? EMPTY_RECEIPTS)
    setError(null)
    setLoading(false)
  }, [])

  const reload = useCallback(async () => {
    apply(await callApi<CashReceiptListDto>(url))
  }, [apply, url])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await callApi<CashReceiptListDto>(url)
      if (cancelled) return
      apply(result)
    })()
    return () => {
      cancelled = true
    }
  }, [apply, url])

  return { data, loading, error, reload }
}
