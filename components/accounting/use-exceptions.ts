'use client'

import { useCallback, useEffect, useState } from 'react'
import type { ExceptionListDto } from '@/lib/accounting/types'
import { callApi } from '@/lib/api/types'

/**
 * โหลดทะเบียนข้อยกเว้น (`34` §14 `GET /api/exceptions`) — **ห้าม fetch `/api/exceptions` เองในหน้าใหม่**
 *
 * ตัวกรองส่งไปที่ API เสมอ (ไม่กรองฝั่ง client) · summary ที่ได้กลับมา**แยก `authorized` ออกจาก
 * `resolved`** ตามมาตรการกันหายเงียบ (`34` §6.3) — หน้าจอห้ามรวมสองช่องนี้เข้าด้วยกัน
 */

export type ExceptionStatusFilter = 'all' | 'open' | 'authorized' | 'resolved'
export type ExceptionLevelFilter = 'all' | 'critical' | 'warning' | 'info'

export interface ExceptionsFilter {
  status: ExceptionStatusFilter
  level: ExceptionLevelFilter
  /** `''` = ทุกรอบบัญชี */
  periodId: string
}

const EMPTY_COUNTS = { critical: 0, warning: 0, info: 0, total: 0 }

const EMPTY: ExceptionListDto = {
  items: [],
  summary: {
    open: EMPTY_COUNTS,
    authorized: EMPTY_COUNTS,
    resolved: EMPTY_COUNTS,
    blockingCritical: 0,
  },
}

export interface ExceptionsState {
  data: ExceptionListDto
  loading: boolean
  error: { title: string; message: string } | null
  reload: () => Promise<void>
}

function urlOf(filter: ExceptionsFilter): string {
  const params = new URLSearchParams()
  if (filter.status !== 'all') params.set('status', filter.status)
  if (filter.level !== 'all') params.set('level', filter.level)
  if (filter.periodId !== '') params.set('periodId', filter.periodId)
  const query = params.toString()
  return query === '' ? '/api/exceptions' : `/api/exceptions?${query}`
}

export function useAccountingExceptions(filter: ExceptionsFilter): ExceptionsState {
  const [data, setData] = useState<ExceptionListDto>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)

  const url = urlOf(filter)

  const apply = useCallback((result: Awaited<ReturnType<typeof callApi<ExceptionListDto>>>) => {
    if (result.error !== undefined) {
      setError({ title: result.error.title, message: result.error.message })
      setLoading(false)
      return
    }
    setData(result.data ?? EMPTY)
    setError(null)
    setLoading(false)
  }, [])

  const reload = useCallback(async () => {
    apply(await callApi<ExceptionListDto>(url))
  }, [apply, url])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await callApi<ExceptionListDto>(url)
      if (cancelled) return
      apply(result)
    })()
    return () => {
      cancelled = true
    }
  }, [apply, url])

  return { data, loading, error, reload }
}
