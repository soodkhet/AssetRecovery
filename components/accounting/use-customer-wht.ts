'use client'

import { useCallback, useEffect, useState } from 'react'
import { callApi } from '@/lib/api/types'
import type { CustomerWhtAgeBucket } from '@/lib/customer-wht/customer-wht'
import type { CustomerWhtListDto } from '@/lib/customer-wht/types'
import type { CustomerWhtStatus } from '@/lib/generated/prisma/enums'

/**
 * โหลดรายการ 50 ทวิ ที่ลูกค้าหักเรา (มติ PO U40) — **ห้าม fetch `/api/accounting/customer-wht-certificates` เองในหน้าใหม่**
 * ตัวกรองส่งไปที่ API เสมอ · setState อยู่หลัง `await` ใน IIFE เท่านั้น (กฎ `react-hooks/set-state-in-effect`)
 */

export interface CustomerWhtFilter {
  companyId?: string
  status?: CustomerWhtStatus
  age?: CustomerWhtAgeBucket
}

const EMPTY: CustomerWhtListDto = {
  items: [],
  summary: { pendingCount: 0, pendingSatang: 0, receivedCount: 0, receivedSatang: 0 },
  byCompany: [],
}

export interface CustomerWhtState {
  data: CustomerWhtListDto
  loading: boolean
  error: { title: string; message: string } | null
  reload: () => Promise<void>
}

export function useCustomerWht(filter: CustomerWhtFilter = {}): CustomerWhtState {
  const [data, setData] = useState<CustomerWhtListDto>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)
  const { companyId, status, age } = filter

  const fetchItems = useCallback(async () => {
    const query = new URLSearchParams()
    if (companyId !== undefined) query.set('companyId', companyId)
    if (status !== undefined) query.set('status', status)
    if (age !== undefined) query.set('age', age)
    const suffix = query.toString() === '' ? '' : `?${query.toString()}`
    return callApi<CustomerWhtListDto>(`/api/accounting/customer-wht-certificates${suffix}`)
  }, [companyId, status, age])

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
      const result = await fetchItems()
      if (!cancelled) apply(result)
    })()
    return () => {
      cancelled = true
    }
  }, [apply, fetchItems])

  return { data, loading, error, reload }
}
