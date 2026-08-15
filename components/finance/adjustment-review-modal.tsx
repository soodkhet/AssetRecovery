'use client'

import { useState } from 'react'
import { Button, Field, InlineAlert, Modal, RefText, StatusBadge, Textarea, useToast } from '@/components/ui'
import {
  ADJUSTMENT_TYPE_TONE,
  adjustmentSignPrefix,
  periodStatusBadgeGroup,
  periodStatusLabel,
} from '@/lib/adjustments/adjustment-ui'
import type { AdjustmentDto } from '@/lib/adjustments/types'
import { callApi, jsonRequest } from '@/lib/api/types'
import { fmtSatangSymbol } from '@/lib/format/money'

/**
 * Modal อนุมัติ / ปฏิเสธรายการปรับปรุง (`20` §8 · mockup `approve-adjustment`/`adjustment-detail`)
 * — **modal เดียว 2 โหมด** (แนวเดียวกับ `<AdvanceReviewModal>` ของ 3.3)
 *
 * ⚠️ รอบ `locked` ต้องผู้บริหารเท่านั้น — ปุ่มยังกดได้ตามสิทธิ์ที่ UI เห็น แต่ API ปฏิเสธด้วย
 *    `INSUFFICIENT_APPROVAL_LEVEL` เสมอ (UI hide/disable เป็นแค่ UX — DEC-002)
 * ⚠️ ปฏิเสธเป็น terminal ⇒ บังคับเหตุผล (`REJECTION_REASON_REQUIRED`)
 */
export function AdjustmentReviewModal({
  adjustment,
  mode,
  onClose,
  onDone,
}: {
  adjustment: AdjustmentDto | null
  mode: 'approve' | 'reject'
  onClose: () => void
  onDone: () => void
}) {
  const { showToast } = useToast()
  const [note, setNote] = useState('')
  const [rejectionReason, setRejectionReason] = useState('')
  const [saving, setSaving] = useState(false)

  if (adjustment === null) return null

  const locked = adjustment.periodStatusAtTarget === 'locked'

  function close(): void {
    setNote('')
    setRejectionReason('')
    onClose()
  }

  async function submit(): Promise<void> {
    if (adjustment === null) return
    setSaving(true)
    const result =
      mode === 'approve'
        ? await callApi(`/api/adjustments/${adjustment.id}/approve`, jsonRequest('PATCH', { note: note.trim() }))
        : await callApi(
            `/api/adjustments/${adjustment.id}/reject`,
            jsonRequest('PATCH', { rejectionReason: rejectionReason.trim() }),
          )
    setSaving(false)
    if (result.error !== undefined) {
      showToast({ tone: 'error', title: result.error.title, description: result.error.message })
      return
    }
    const stillPending = mode === 'approve' && adjustment.missingApproverRoles.length > 1
    showToast({
      tone: 'success',
      title: mode === 'approve' ? (stillPending ? 'บันทึกการอนุมัติแล้ว' : 'อนุมัติรายการปรับปรุงแล้ว') : 'ปฏิเสธรายการแล้ว',
      description:
        mode === 'approve' && stillPending
          ? `ยังรออนุมัติจาก: ${adjustment.missingApproverRoles.filter((role) => role !== '').join(', ')}`
          : `${adjustment.targetRef} — ${fmtSatangSymbol(adjustment.amountSatang)}`,
    })
    onDone()
    close()
  }

  return (
    <Modal
      open
      onClose={close}
      title={mode === 'approve' ? 'อนุมัติรายการปรับปรุง' : 'ปฏิเสธรายการปรับปรุง'}
      description={adjustment.targetLabel}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            ยกเลิก
          </Button>
          <Button
            loading={saving}
            variant={mode === 'approve' ? 'primary' : 'danger'}
            disabled={mode === 'reject' && rejectionReason.trim().length < 5}
            onClick={() => void submit()}
          >
            {mode === 'approve' ? 'ยืนยันอนุมัติ' : 'ยืนยันปฏิเสธ'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {locked && (
          <InlineAlert tone="error" title="รอบบัญชีปิดแล้ว">
            รายการนี้อ้างอิงรอบบัญชีที่ปิดแล้ว — ผู้บริหารเท่านั้นที่อนุมัติได้
            (ผู้ไม่มีสิทธิ์จะได้ INSUFFICIENT_APPROVAL_LEVEL) และระบบจะบันทึก audit log แยกอีกใบ
          </InlineAlert>
        )}

        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <RefText>{adjustment.targetRef}</RefText>
          <p className={`font-mono text-lg font-bold ${ADJUSTMENT_TYPE_TONE[adjustment.adjustmentType]}`}>
            {adjustmentSignPrefix(adjustment.adjustmentType)}
            {fmtSatangSymbol(adjustment.amountSatang)}
          </p>
          <p className="text-xs text-slate-600">{adjustment.reason}</p>
          <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-slate-500">
            <StatusBadge
              status={adjustment.periodStatusAtTarget ?? 'collecting'}
              group={periodStatusBadgeGroup(adjustment.periodStatusAtTarget)}
              label={periodStatusLabel(adjustment.periodStatusAtTarget)}
            />
            <span>ต้องอนุมัติโดย: {adjustment.requiredApproverRoles.join(' + ')}</span>
            {adjustment.approvedRoles.length > 0 && <span>อนุมัติแล้ว: {adjustment.approvedRoles.join(', ')}</span>}
          </div>
        </div>

        {mode === 'approve' ? (
          <>
            {adjustment.missingApproverRoles.length > 1 && (
              <InlineAlert tone="info">
                ระดับนี้ต้องอนุมัติหลายบทบาท — กดครั้งนี้จะบันทึกการอนุมัติของคุณไว้ก่อน
                แล้วรอบทบาทที่เหลือ ({adjustment.missingApproverRoles.join(', ')}) อนุมัติต่อ
              </InlineAlert>
            )}
            <Field label="หมายเหตุของผู้อนุมัติ (ถ้ามี)">
              <Textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
            </Field>
          </>
        ) : (
          <Field label="เหตุผลที่ปฏิเสธ (บังคับกรอก)" required>
            <Textarea
              rows={3}
              placeholder="เช่น เอกสารประกอบไม่ครบ ให้แนบใบเสร็จฉบับจริงแล้วยื่นใหม่"
              value={rejectionReason}
              onChange={(event) => setRejectionReason(event.target.value)}
            />
          </Field>
        )}
      </div>
    </Modal>
  )
}
