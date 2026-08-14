'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { apiPath } from '@/lib/api/contract'
import { callApi, type ApiCallError } from '@/lib/api/types'
import { EMPTY_FIELD_BADGE_COUNTS, type FieldBadgeCounts } from '@/lib/field/field-nav'
import type { FieldCaseListItemDto, FieldCaseListResultDto } from '@/lib/field/types'

/**
 * คลังเคส + badge store ของ Field Tracker shell (`41` §5.1)
 *
 * โหลด **ครั้งเดียวที่ระดับ shell** ด้วย `GET /api/field/cases` (ไม่ระบุ `status` = ทุกสถานะที่ยังทำงานอยู่)
 * แล้วให้ทุกแท็บกรองเอาเองจากชุดเดียวกัน ⇒ ตัวเลข badge กับรายการในแท็บตรงกันเสมอ
 * และสลับแท็บไม่ยิง API ซ้ำ (`41` §11 mobile/desktop ตรรกะเดียวกัน)
 *
 * ทุก mutation (รับงาน/จัดวัน/ลากสลับลำดับ) ต้องเรียก `reload()` ต่อท้าย
 */

interface FieldCasesValue {
  items: readonly FieldCaseListItemDto[]
  loading: boolean
  error: ApiCallError | null
  badges: FieldBadgeCounts
  reload: () => Promise<void>
}

const FieldCasesContext = createContext<FieldCasesValue | null>(null)

function countBadges(items: readonly FieldCaseListItemDto[]): FieldBadgeCounts {
  return {
    pendingAccept: items.filter((item) => item.status === 'pending_accept').length,
    accepted: items.filter((item) => item.status === 'accepted_unscheduled').length,
    // ม่วง = คำขอเปลี่ยนผู้รับผิดชอบที่ยังไม่ตอบ (`41` §5.1 · §6.7) ไม่ใช่จำนวนเคสที่กำลังติดตาม
    reassignment: items.filter((item) => item.hasPendingReassignment).length,
  }
}

export function FieldCasesProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<readonly FieldCaseListItemDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ApiCallError | null>(null)

  /** โหลดซ้ำหลัง mutation (รับงาน/จัดวัน/สลับลำดับ) — โชว์สถานะกำลังโหลดระหว่างรอด้วย */
  const reload = useCallback(async () => {
    setLoading(true)
    const response = await callApi<FieldCaseListResultDto>(apiPath('field.caseList', undefined, { view: 'own' }))
    setItems(response.data?.items ?? [])
    setError(response.error ?? null)
    setLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const response = await callApi<FieldCaseListResultDto>(apiPath('field.caseList', undefined, { view: 'own' }))
      if (cancelled) return
      setItems(response.data?.items ?? [])
      setError(response.error ?? null)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const value = useMemo<FieldCasesValue>(
    () => ({ items, loading, error, badges: countBadges(items), reload }),
    [items, loading, error, reload],
  )

  return <FieldCasesContext.Provider value={value}>{children}</FieldCasesContext.Provider>
}

export function useFieldCases(): FieldCasesValue {
  const value = useContext(FieldCasesContext)
  if (value === null) {
    return { items: [], loading: false, error: null, badges: EMPTY_FIELD_BADGE_COUNTS, reload: async () => {} }
  }
  return value
}
