'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePermission } from '@/components/auth/permission-provider'
import { useToast } from '@/components/ui'
import { callApi, jsonRequest } from '@/lib/api/types'
import { APPROVAL_STEP_CAPABILITIES } from '@/lib/compensation/approval'
import type { CompensationApprovalDto } from '@/lib/compensation/approval-types'
import { EXPENSE_TYPE_LABEL } from '@/lib/field/expense-ui'

/**
 * ตรรกะที่ใช้ร่วมกันของ **แท็บ "รออนุมัติ" (`15` §8)** และ **แท็บ "ค่าตอบแทน" (`16` §8)**
 * — รายการเบิกทุกแหล่งเป็น entity เดียวกัน (`15` §9 header) จึงโหลด/อนุมัติ/ตีกลับด้วยชุดเดียว
 *
 * ⚠️ `canApprove` เป็นแค่ UX (ซ่อนปุ่ม) — API ตรวจขั้นที่รออยู่ + capability ซ้ำเสมอ (DEC-002)
 * ⚠️ ตีกลับ = `reject_expense` แตะแค่รายการเบิก **ไม่ใช่** `reject_evidence` ของเจ้าหน้าที่อนุมัติเคส (`16` §6.2)
 */

export interface ApprovalActions {
  items: readonly CompensationApprovalDto[]
  loading: boolean
  error: { title: string; message: string } | null
  busyId: string | null
  canApprove: boolean
  reload: () => Promise<void>
  approve: (item: CompensationApprovalDto) => Promise<void>
  reject: (item: CompensationApprovalDto, reason: string) => Promise<boolean>
}

/** @param endpoint `/api/compensation` (ไฟล์ 16) หรือ `/api/claims` (ไฟล์ 15) — ชั้นข้อมูลเดียวกัน */
export function useApprovalActions(endpoint: '/api/compensation' | '/api/claims'): ApprovalActions {
  const { showToast } = useToast()
  const { can } = usePermission()
  const canApprove = APPROVAL_STEP_CAPABILITIES.some((capability) => can('manage', capability))

  const [items, setItems] = useState<readonly CompensationApprovalDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  // ตัวดึงข้อมูล **ไม่มี setState ในตัวเอง** — เรียกจาก effect ได้โดยไม่ชนกฎ `react-hooks/set-state-in-effect`
  const fetchItems = useCallback(
    async () => callApi<CompensationApprovalDto[]>(`${endpoint}?status=all`),
    [endpoint],
  )

  const reload = useCallback(async () => {
    const result = await fetchItems()
    if (result.error !== undefined) {
      setError({ title: result.error.title, message: result.error.message })
      setLoading(false)
      return
    }
    setItems(result.data ?? [])
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
      setItems(result.data ?? [])
      setError(null)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [fetchItems])

  const approve = useCallback(
    async (item: CompensationApprovalDto) => {
      setBusyId(item.id)
      const result = await callApi(
        `${endpoint}/${item.id}/approve`,
        jsonRequest('PATCH', { step: item.approvalStepCurrent }),
      )
      setBusyId(null)
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      showToast({
        tone: 'success',
        title: 'อนุมัติแล้ว',
        description: `${item.payeeName} — ${EXPENSE_TYPE_LABEL[item.expenseType]}`,
      })
      await reload()
    },
    [endpoint, reload, showToast],
  )

  const reject = useCallback(
    async (item: CompensationApprovalDto, reason: string) => {
      setBusyId(item.id)
      const result = await callApi(`${endpoint}/${item.id}/reject`, jsonRequest('PATCH', { reason: reason.trim() }))
      setBusyId(null)
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return false
      }
      showToast({
        tone: 'success',
        title: 'ตีกลับให้แก้ไขแล้ว',
        description: 'รายการกลับไปเริ่มที่ขั้น 1 ใหม่ทั้งหมด',
      })
      await reload()
      return true
    },
    [endpoint, reload, showToast],
  )

  return { items, loading, error, busyId, canApprove, reload, approve, reject }
}
