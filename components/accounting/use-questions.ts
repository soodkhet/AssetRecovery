'use client'

import { useCallback, useEffect, useState } from 'react'
import type { QuestionStatus } from '@/lib/accounting/question'
import type { AccountantQuestionListDto } from '@/lib/accounting/types'
import { callApi } from '@/lib/api/types'

/** โหลดข้อซักถามจากสำนักงานบัญชี (`36` §13) — ตัวกรองส่งไปที่ API เสมอ */

export type QuestionStatusFilter = QuestionStatus | 'all'

const EMPTY: AccountantQuestionListDto = {
  items: [],
  summary: { total: 0, open: 0, answered: 0 },
}

export interface QuestionsState {
  data: AccountantQuestionListDto
  loading: boolean
  error: { title: string; message: string } | null
  reload: () => Promise<void>
}

export function useAccountantQuestions(status: QuestionStatusFilter = 'all'): QuestionsState {
  const [data, setData] = useState<AccountantQuestionListDto>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)

  const fetchItems = useCallback(async () => {
    const suffix = status === 'all' ? '' : `?status=${status}`
    return callApi<AccountantQuestionListDto>(`/api/accounting/questions${suffix}`)
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
