'use client'

import { useCallback, useEffect, useState } from 'react'
import { callApi } from '@/lib/api/types'
import type { WhtCertificateListDto, WhtFilingSummaryListDto } from '@/lib/wht/types'
import type { FilingWarning } from '@/lib/wht/wht'

/**
 * โหลดทะเบียนใบ 50 ทวิ + สรุปรอบนำส่ง (`33` §14) — **ห้าม fetch `/api/accounting/wht-*` เองในหน้าใหม่**
 *
 * ตัวกรองส่งไปที่ API เสมอ (ไม่กรองฝั่ง client) · setState อยู่หลัง `await` ใน IIFE เท่านั้น
 * (กฎ `react-hooks/set-state-in-effect`) · `FILING_OVERDUE_WARNING` มากับ envelope ⇒ อ่านจาก
 * `warning` ไม่ใช่ `error` (เตือน ไม่ block — `33` §11)
 */

export type WhtStatusFilter = 'all' | 'active' | 'cancelled'

const EMPTY_CERTS: WhtCertificateListDto = {
  items: [],
  summary: { pnd3Satang: 0, pnd53Satang: 0, activeCount: 0, cancelledCount: 0, grossSatang: 0 },
}

const EMPTY_FILINGS: WhtFilingSummaryListDto = { items: [], pending: null, warning: null }

export interface WhtState {
  certificates: WhtCertificateListDto
  filings: WhtFilingSummaryListDto
  /** คำเตือนกำหนดนำส่งที่ banner ใช้ (`33` §8) */
  warning: FilingWarning | null
  loading: boolean
  error: { title: string; message: string } | null
  reload: () => Promise<void>
}

export function useWht(status: WhtStatusFilter = 'all'): WhtState {
  const [certificates, setCertificates] = useState<WhtCertificateListDto>(EMPTY_CERTS)
  const [filings, setFilings] = useState<WhtFilingSummaryListDto>(EMPTY_FILINGS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)

  const fetchAll = useCallback(async () => {
    const query = status === 'all' ? '' : `?status=${status}`
    return Promise.all([
      callApi<WhtCertificateListDto>(`/api/accounting/wht-certificates${query}`),
      callApi<WhtFilingSummaryListDto>('/api/accounting/wht-filing-summary'),
    ])
  }, [status])

  const apply = useCallback(
    (
      certResult: Awaited<ReturnType<typeof callApi<WhtCertificateListDto>>>,
      filingResult: Awaited<ReturnType<typeof callApi<WhtFilingSummaryListDto>>>,
    ) => {
      const failure = certResult.error ?? filingResult.error
      if (failure !== undefined) {
        setError({ title: failure.title, message: failure.message })
        setLoading(false)
        return
      }
      setCertificates(certResult.data ?? EMPTY_CERTS)
      setFilings(filingResult.data ?? EMPTY_FILINGS)
      setError(null)
      setLoading(false)
    },
    [],
  )

  const reload = useCallback(async () => {
    const [certResult, filingResult] = await fetchAll()
    apply(certResult, filingResult)
  }, [apply, fetchAll])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [certResult, filingResult] = await fetchAll()
      if (cancelled) return
      apply(certResult, filingResult)
    })()
    return () => {
      cancelled = true
    }
  }, [apply, fetchAll])

  return { certificates, filings, warning: filings.warning, loading, error, reload }
}
