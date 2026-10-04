'use client'

import { useCallback, useEffect, useState } from 'react'
import { callApi } from '@/lib/api/types'

/**
 * ตัวโหลดข้อมูลของหน้าพอร์ทัลจาก `GET /api/portal/*` (อ่านอย่างเดียว) — แม่แบบเดียวกับ
 * `components/reports/use-report-data.ts`: setState หลัง `await` อยู่ใน IIFE ของ `useEffect` เท่านั้น
 *
 * `enabled = false` = ผู้ใช้ไม่มีสิทธิ์หมวดนั้น → ไม่ยิง request เลย (`loading` เป็น false ทันที)
 */
export interface PortalDataState<T> {
  data: T | null
  loading: boolean
  error: { title: string; message: string; code?: string } | null
  reload: () => void
}

export function usePortalData<T>(url: string, enabled = true): PortalDataState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<PortalDataState<T>['error']>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    void (async () => {
      const result = await callApi<T>(url)
      if (cancelled) return
      if (result.error !== undefined) {
        setError({
          title: result.error.title,
          message: result.error.message,
          ...(result.error.code === undefined ? {} : { code: result.error.code }),
        })
        setLoading(false)
        return
      }
      setData(result.data ?? null)
      setError(null)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [url, enabled, nonce])

  const reload = useCallback(() => {
    setLoading(true)
    setNonce((value) => value + 1)
  }, [])

  return { data, loading: enabled && loading, error, reload }
}
