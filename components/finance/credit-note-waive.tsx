'use client'

import { useState } from 'react'
import { usePermission } from '@/components/auth/permission-provider'
import { ReasonConfirmModal } from '@/components/settings/reason-confirm-modal'
import { Button, useToast } from '@/components/ui'
import { REASON_MAX } from '@/lib/api/validation'
import { callApi, jsonRequest } from '@/lib/api/types'
import { MANAGE_CREDIT_NOTE } from '@/lib/credit-notes/permissions'
import type { AwaitingCreditNoteDto } from '@/lib/credit-notes/types'
import { fmtDateTime } from '@/lib/format/datetime'

/**
 * staging E-016 (มติ PO 10/10/2569) — ลดยอดของบิลที่ชำระครบแล้ว: บอกว่าออกใบลดหนี้ในระบบไม่ได้ + ปุ่ม "จัดการนอกระบบ"
 * (ปิดป้ายรอใบลดหนี้พร้อมเหตุผล) · ปุ่มเห็นเฉพาะผู้บันทึกใบลดหนี้ได้ — API ตรวจสิทธิ์/เงื่อนไขซ้ำเสมอ (DEC-002)
 */
export function CreditNoteWaiveNotice({
  awaiting,
  targetBillFullyPaid,
  waivedAt,
  waiveReason,
  onWaived,
}: {
  awaiting: AwaitingCreditNoteDto | undefined
  targetBillFullyPaid: boolean
  waivedAt: string | null
  waiveReason: string | null
  onWaived: () => void
}) {
  const { can } = usePermission()
  const { showToast } = useToast()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  if (waivedAt !== null) {
    return (
      <p className="mt-1 text-[10px] text-slate-500">
        ใบลดหนี้: จัดการนอกระบบ · {fmtDateTime(waivedAt)}
        {waiveReason !== null && ` — ${waiveReason}`}
      </p>
    )
  }
  if (!targetBillFullyPaid) return null

  async function submit(): Promise<void> {
    if (awaiting === undefined) return
    setSaving(true)
    const result = await callApi<AwaitingCreditNoteDto>(
      `/api/accounting/credit-notes/awaiting/${awaiting.adjustmentId}/waive`,
      jsonRequest('POST', { reason: reason.trim() }),
    )
    setSaving(false)
    if (result.error !== undefined) {
      showToast({ tone: 'error', title: result.error.title, description: result.error.message })
      return
    }
    showToast({ tone: 'success', title: 'ปิดป้ายรอใบลดหนี้แล้ว', description: 'บันทึกว่าจัดการคืนเงินนอกระบบพร้อมเหตุผล' })
    setOpen(false)
    setReason('')
    onWaived()
  }

  return (
    <div className="mt-1 space-y-1">
      <p className="text-[10px] text-amber-700">
        บิลนี้ชำระครบแล้ว — ออกใบลดหนี้ในระบบไม่ได้ ให้สำนักงานบัญชีจัดการคืนเงิน/เอกสารนอกระบบ
      </p>
      {awaiting?.canWaive === true && can('manage', MANAGE_CREDIT_NOTE) && (
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
          จัดการนอกระบบ
        </Button>
      )}
      <ReasonConfirmModal
        open={open}
        title="ปิดป้ายรอใบลดหนี้ — จัดการนอกระบบ"
        description="ใช้เมื่อบิลชำระครบแล้วและสำนักงานบัญชีจัดการคืนเงิน/เอกสารนอกระบบ — ยอดรายการปรับปรุงไม่เปลี่ยน"
        confirmLabel="ปิดป้าย"
        confirmVariant="primary"
        loading={saving}
        reason={reason}
        onReasonChange={setReason}
        onClose={() => setOpen(false)}
        onConfirm={() => void submit()}
        placeholder="เช่น สำนักงานบัญชีออกใบลดหนี้และคืนเงินลูกค้าแล้ว"
        maxLength={REASON_MAX}
      />
    </div>
  )
}
