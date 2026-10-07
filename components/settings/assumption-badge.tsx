'use client'

import { useEffect, useState } from 'react'
import { usePermission } from '@/components/auth/permission-provider'
import { ReasonConfirmModal } from '@/components/settings/reason-confirm-modal'
import { StatusBadge, useToast } from '@/components/ui'
import { callApi, jsonRequest } from '@/lib/api/types'
import {
  CONFIRM_SETTING_ASSUMPTION,
  SETTING_ASSUMPTIONS,
  type SettingAssumptionKey,
  type SettingAssumptionStatusDto,
} from '@/lib/settings/assumptions'

/**
 * ป้าย "รอนักบัญชียืนยัน" ข้างค่าตั้งที่เป็นสมมติฐาน (มติ PO 07/10/2569 U140)
 *
 * สถานะโหลดครั้งเดียวต่อหน้า (cache ระดับโมดูล — หน้าตั้งค่ามีป้ายหลายจุด) · ยืนยันแล้ว = ป้ายหาย
 * ปุ่ม "ยืนยันแล้ว" ขึ้นเฉพาะผู้มีสิทธิ์ (API ตรวจซ้ำ) · เหตุผลบังคับ · โหลดไม่ได้ = ไม่แสดงป้าย (ไม่ขวางหน้าตั้งค่า)
 */

const CHANGED_EVENT = 'setting-assumptions-changed'
let cache: Promise<SettingAssumptionStatusDto[] | null> | null = null

function loadAssumptions(): Promise<SettingAssumptionStatusDto[] | null> {
  const pending =
    cache ??
    callApi<SettingAssumptionStatusDto[]>('/api/settings/assumptions').then((result) =>
      result.error === undefined ? (result.data ?? null) : null,
    )
  cache = pending
  return pending
}

function useAssumptionStatus(key: SettingAssumptionKey): SettingAssumptionStatusDto | null {
  const [status, setStatus] = useState<SettingAssumptionStatusDto | null>(null)
  useEffect(() => {
    let alive = true
    const refresh = (): void => {
      void loadAssumptions().then((rows) => {
        if (alive) setStatus(rows?.find((row) => row.key === key) ?? null)
      })
    }
    refresh()
    window.addEventListener(CHANGED_EVENT, refresh)
    return () => {
      alive = false
      window.removeEventListener(CHANGED_EVENT, refresh)
    }
  }, [key])
  return status
}

export function AssumptionBadge({ assumptionKey }: { assumptionKey: SettingAssumptionKey }) {
  // ชั้นนอกอ่านสถานะอย่างเดียว — ยังไม่โหลด/ยืนยันแล้ว = ไม่ render ส่วนที่ต้องใช้ provider (toast/สิทธิ์)
  const status = useAssumptionStatus(assumptionKey)
  if (status === null || status.confirmed) return null
  return <PendingAssumption assumptionKey={assumptionKey} />
}

function PendingAssumption({ assumptionKey }: { assumptionKey: SettingAssumptionKey }) {
  const { can } = usePermission()
  const { showToast } = useToast()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const meta = SETTING_ASSUMPTIONS[assumptionKey]
  const canConfirm = can('manage', CONFIRM_SETTING_ASSUMPTION)

  async function confirm(): Promise<void> {
    setSaving(true)
    const result = await callApi<SettingAssumptionStatusDto>(
      `/api/settings/assumptions/${assumptionKey}/confirm`,
      jsonRequest('POST', { reason: reason.trim() }),
    )
    setSaving(false)
    if (result.error !== undefined) {
      showToast({ tone: 'error', title: result.error.title, description: result.error.message })
      return
    }
    showToast({ tone: 'success', title: `ยืนยัน "${meta.label}" แล้ว`, description: 'ป้ายรอนักบัญชียืนยันถูกนำออก' })
    setOpen(false)
    cache = null
    window.dispatchEvent(new Event(CHANGED_EVENT))
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
      <StatusBadge group="warning" label="รอนักบัญชียืนยัน" />
      <span>{meta.question}</span>
      {canConfirm && (
        <button
          type="button"
          className="focus-ring rounded px-1 text-[11px] font-semibold text-slate-600 underline hover:text-slate-900"
          onClick={() => setOpen(true)}
        >
          ยืนยันแล้ว
        </button>
      )}
      <ReasonConfirmModal
        maxLength={1000}
        open={open}
        title={`ยืนยันค่าตั้ง "${meta.label}"`}
        description={`นักบัญชียืนยันแล้วว่า: ${meta.question}`}
        confirmLabel="ยืนยันแล้ว"
        confirmVariant="primary"
        loading={saving}
        reason={reason}
        onReasonChange={setReason}
        onClose={() => setOpen(false)}
        onConfirm={() => void confirm()}
        placeholder="เช่น สำนักงานบัญชียืนยันทางอีเมล 10/10/2569"
      />
    </div>
  )
}
