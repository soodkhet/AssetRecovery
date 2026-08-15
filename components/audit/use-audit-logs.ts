'use client'

import { useCallback, useEffect, useState } from 'react'
import { callApi } from '@/lib/api/types'
import type { AuditLogAction } from '@/lib/audit/log-schemas'
import { AUDIT_LOG_PAGE_SIZE_DEFAULT } from '@/lib/audit/log-schemas'
import type { AuditLogDetailDto, AuditLogListDto } from '@/lib/audit/log-types'

/**
 * โหลดบันทึกการใช้งาน (`90` §14) — ตัวกรองส่งไปที่ API เสมอ (ห้ามกรองฝั่ง client
 * เพราะหน้าเดียวโหลดได้แค่ `limit` แถว ⇒ กรองที่จอจะได้ผลลัพธ์ผิดโดยเงียบ ๆ)
 */

export interface AuditLogFilters {
  targetType: string
  action: AuditLogAction | 'all'
  dateFrom: string
  dateTo: string
}

export const EMPTY_AUDIT_FILTERS: AuditLogFilters = {
  targetType: '',
  action: 'all',
  dateFrom: '',
  dateTo: '',
}

const EMPTY: AuditLogListDto = {
  items: [],
  total: 0,
  offset: 0,
  limit: AUDIT_LOG_PAGE_SIZE_DEFAULT,
  hasMore: false,
  targetTypes: [],
}

export interface AuditLogsState {
  data: AuditLogListDto
  loading: boolean
  error: { title: string; message: string } | null
  reload: () => Promise<void>
}

export function auditLogQueryString(filters: AuditLogFilters, offset: number): string {
  const params = new URLSearchParams()
  if (filters.targetType !== '') params.set('targetType', filters.targetType)
  if (filters.action !== 'all') params.set('action', filters.action)
  if (filters.dateFrom !== '') params.set('dateFrom', filters.dateFrom)
  if (filters.dateTo !== '') params.set('dateTo', filters.dateTo)
  if (offset > 0) params.set('offset', String(offset))
  const query = params.toString()
  return query === '' ? '' : `?${query}`
}

export function useAuditLogs(filters: AuditLogFilters, offset: number): AuditLogsState {
  const [data, setData] = useState<AuditLogListDto>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)

  const fetchItems = useCallback(
    async () => callApi<AuditLogListDto>(`/api/audit-logs${auditLogQueryString(filters, offset)}`),
    [filters, offset],
  )

  const apply = useCallback((result: Awaited<ReturnType<typeof fetchItems>>) => {
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
    apply(await fetchItems())
  }, [apply, fetchItems])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      // ตั้ง loading ในฟังก์ชันย่อย ไม่ใช่ในตัว effect — กัน cascading render (กฎ `react-hooks/set-state-in-effect`)
      setLoading(true)
      const result = await fetchItems()
      if (!cancelled) apply(result)
    })()
    return () => {
      cancelled = true
    }
  }, [apply, fetchItems])

  return { data, loading, error, reload }
}

/** รายละเอียดรายการเดียว (before/after เต็ม) — โหลดตอนเปิด drawer เท่านั้น */
export function useAuditLogDetail(id: string | null): {
  detail: AuditLogDetailDto | null
  loading: boolean
  error: { title: string; message: string } | null
} {
  const [detail, setDetail] = useState<AuditLogDetailDto | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)

  useEffect(() => {
    if (id === null) return
    let cancelled = false
    void (async () => {
      setLoading(true)
      const result = await callApi<AuditLogDetailDto>(`/api/audit-logs/${id}`)
      if (cancelled) return
      if (result.error !== undefined) {
        setError({ title: result.error.title, message: result.error.message })
        setDetail(null)
      } else {
        setDetail(result.data ?? null)
        setError(null)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  // ปิด drawer แล้วไม่ต้องล้าง state ใน effect — คิดจาก `id` ตรง ๆ (ค่าค้างจากรายการก่อนหน้าจะไม่โผล่)
  return id === null ? { detail: null, loading: false, error: null } : { detail, loading, error }
}
