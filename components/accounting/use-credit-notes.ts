'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { callApi } from '@/lib/api/types'
import type { AwaitingCreditNoteDto, CreditNoteDto, CreditNoteListDto } from '@/lib/credit-notes/types'

/**
 * โหลดทะเบียนใบลดหนี้ (`GET /api/accounting/credit-notes`) — ใช้ในแท็บรายการขาย/ใบกำกับ (มติ PO U14)
 * จัดกลุ่มตามใบกำกับให้ผู้เรียกจับคู่กับแถว (ไม่ต้องแก้ DTO ของรายการขาย)
 */

type ListResult = Awaited<ReturnType<typeof callApi<CreditNoteListDto>>>
type AwaitingResult = Awaited<ReturnType<typeof callApi<AwaitingCreditNoteDto[]>>>

const LIST_URL = '/api/accounting/credit-notes'
const AWAITING_URL = '/api/accounting/credit-notes/awaiting'

export function useCreditNotes(): {
  byInvoice: ReadonlyMap<string, CreditNoteDto[]>
  error: string | null
  reload: () => Promise<void>
} {
  const [items, setItems] = useState<CreditNoteDto[]>([])
  const [error, setError] = useState<string | null>(null)

  const apply = useCallback((result: ListResult) => {
    if (result.error !== undefined) {
      setError(result.error.message)
      return
    }
    setItems(result.data?.items ?? [])
    setError(null)
  }, [])

  const reload = useCallback(async () => {
    apply(await callApi<CreditNoteListDto>(LIST_URL))
  }, [apply])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await callApi<CreditNoteListDto>(LIST_URL)
      if (!cancelled) apply(result)
    })()
    return () => {
      cancelled = true
    }
  }, [apply])

  const byInvoice = useMemo(() => {
    const map = new Map<string, CreditNoteDto[]>()
    for (const item of items) map.set(item.taxInvoiceId, [...(map.get(item.taxInvoiceId) ?? []), item])
    return map
  }, [items])

  return { byInvoice, error, reload }
}

/**
 * Adjustment ลดยอดที่อนุมัติแล้วแต่ยังไม่มีใบลดหนี้ (`GET /api/accounting/credit-notes/awaiting`) — ป้าย "รอใบลดหนี้"
 * โหลดไม่ได้ (ไม่มีสิทธิ์/ล่ม) = ไม่แสดงป้าย (ไม่ขวางหน้าหลัก)
 */
export function useAwaitingCreditNotes(): {
  items: readonly AwaitingCreditNoteDto[]
  reload: () => Promise<void>
} {
  const [items, setItems] = useState<AwaitingCreditNoteDto[]>([])

  const apply = useCallback((result: AwaitingResult) => {
    setItems(result.error === undefined ? (result.data ?? []) : [])
  }, [])

  const reload = useCallback(async () => {
    apply(await callApi<AwaitingCreditNoteDto[]>(AWAITING_URL))
  }, [apply])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await callApi<AwaitingCreditNoteDto[]>(AWAITING_URL)
      if (!cancelled) apply(result)
    })()
    return () => {
      cancelled = true
    }
  }, [apply])

  return { items, reload }
}
