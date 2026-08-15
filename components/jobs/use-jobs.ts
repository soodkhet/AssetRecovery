'use client'

import { useCallback, useEffect, useState } from 'react'
import { callApi, jsonRequest } from '@/lib/api/types'
import type { JobDetailDto, JobListDto } from '@/lib/jobs/types'
import { JOB_PAGE_SIZE_DEFAULT, type JobViewStatusFilter } from '@/lib/jobs/schemas'
import type { JobTypeCode } from '@/lib/jobs/job-types'

/**
 * โหลดรายการงานเบื้องหลัง (`91` §8/§14) — ตัวกรองส่งไปที่ API เสมอ (หน้าเดียวโหลดแค่ `limit` แถว
 * ⇒ กรองฝั่ง client จะได้ผลลัพธ์ผิดโดยเงียบ ๆ เหมือนหน้าบันทึกการใช้งาน)
 */

export interface JobFilters {
  jobType: JobTypeCode | 'all'
  status: JobViewStatusFilter | 'all'
  dateFrom: string
  dateTo: string
}

export const EMPTY_JOB_FILTERS: JobFilters = {
  jobType: 'all',
  status: 'all',
  dateFrom: '',
  dateTo: '',
}

const EMPTY: JobListDto = {
  items: [],
  total: 0,
  offset: 0,
  limit: JOB_PAGE_SIZE_DEFAULT,
  hasMore: false,
}

export interface ApiUiError {
  title: string
  message: string
}

export function jobQueryString(filters: JobFilters, offset: number): string {
  const params = new URLSearchParams()
  if (filters.jobType !== 'all') params.set('jobType', filters.jobType)
  if (filters.status !== 'all') params.set('status', filters.status)
  if (filters.dateFrom !== '') params.set('dateFrom', filters.dateFrom)
  if (filters.dateTo !== '') params.set('dateTo', filters.dateTo)
  if (offset > 0) params.set('offset', String(offset))
  const query = params.toString()
  return query === '' ? '' : `?${query}`
}

export interface JobsState {
  data: JobListDto
  loading: boolean
  error: ApiUiError | null
  reload: () => Promise<void>
}

export function useJobs(filters: JobFilters, offset: number, refreshToken: number): JobsState {
  const [data, setData] = useState<JobListDto>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ApiUiError | null>(null)

  const fetchItems = useCallback(
    async () => callApi<JobListDto>(`/api/jobs${jobQueryString(filters, offset)}`),
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
      // ตั้ง loading ในฟังก์ชันย่อย ไม่ใช่ในตัว effect — กัน cascading render (`react-hooks/set-state-in-effect`)
      setLoading(true)
      const result = await fetchItems()
      if (!cancelled) apply(result)
    })()
    return () => {
      cancelled = true
    }
    // `refreshToken` เปลี่ยนเมื่อสั่ง retry สำเร็จ — บังคับโหลดรายการใหม่ทั้งหน้า
  }, [apply, fetchItems, refreshToken])

  return { data, loading, error, reload }
}

/** รายละเอียดงานหนึ่งตัว (payload/result/ไฟล์ผลลัพธ์) — โหลดตอนเปิด modal เท่านั้น */
export function useJobDetail(
  id: string | null,
  refreshToken: number,
): { detail: JobDetailDto | null; loading: boolean; error: ApiUiError | null } {
  const [detail, setDetail] = useState<JobDetailDto | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ApiUiError | null>(null)

  useEffect(() => {
    if (id === null) return
    let cancelled = false
    void (async () => {
      setLoading(true)
      const result = await callApi<JobDetailDto>(`/api/jobs/${id}`)
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
  }, [id, refreshToken])

  return id === null ? { detail: null, loading: false, error: null } : { detail, loading, error }
}

/** สั่งทำงานใหม่ (`91` §14 — Superadmin เท่านั้น + ต้องมีเหตุผล) */
export async function requestJobRetry(id: string, reason: string): Promise<ApiUiError | null> {
  const result = await callApi<JobDetailDto>(`/api/jobs/${id}/retry`, jsonRequest('POST', { reason }))
  return result.error === undefined ? null : { title: result.error.title, message: result.error.message }
}
