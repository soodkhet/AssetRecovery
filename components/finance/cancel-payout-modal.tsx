'use client'

import { useState } from 'react'
import { Button, Field, InlineAlert, Modal, Textarea, useToast } from '@/components/ui'
import { callApi, jsonRequest } from '@/lib/api/types'
import { fmtDateTime } from '@/lib/format/datetime'
import { fmtCount, fmtSatangSymbol } from '@/lib/format/money'
import { PAYOUT_CANCEL_REASON_MIN_LENGTH } from '@/lib/payout/payout'
import type { PayoutBatchDto } from '@/lib/payout/types'

/**
 * Modal "ยกเลิกรอบจ่าย" (มติ PO U67) — destructive · เหตุผลบังคับ (`CANCEL_REQUIRES_REASON`)
 *
 * รอบที่สร้างไฟล์โอนแล้วต้องติ๊กยืนยันว่ายังไม่ได้อัปโหลดไฟล์เข้าธนาคาร (`PAYOUT_CANCEL_FILE_CONFIRM_REQUIRED`)
 * เพราะรอบใหม่จะได้คีย์กันโอนซ้ำใหม่ — ถ้าไฟล์เดิมถูกโอนไปแล้ว ธนาคารจะจับซ้ำไม่ได้
 * ⚠️ API ตรวจซ้ำทุกเงื่อนไขเสมอ ปุ่มที่ disable เป็นแค่ UX
 */
export function CancelPayoutModal({
  batch,
  onClose,
  onCancelled,
}: {
  batch: PayoutBatchDto | null
  onClose: () => void
  onCancelled: () => void
}) {
  const { showToast } = useToast()
  const [reason, setReason] = useState('')
  const [confirmFileNotSent, setConfirmFileNotSent] = useState(false)
  const [saving, setSaving] = useState(false)

  if (batch === null) return null

  const fileGenerated = batch.paymentFileGeneratedAt !== null
  const ready = reason.trim().length >= PAYOUT_CANCEL_REASON_MIN_LENGTH && (!fileGenerated || confirmFileNotSent)

  async function submit(): Promise<void> {
    if (!ready || batch === null) return
    setSaving(true)
    const result = await callApi<{ releasedExpenseCount: number; releasedAdvanceCount: number }>(
      `/api/payout-batches/${batch.id}/cancel`,
      jsonRequest('POST', { reason: reason.trim(), confirmFileNotSent }),
    )
    setSaving(false)

    if (result.error !== undefined) {
      showToast({ tone: 'error', title: result.error.title, description: result.error.message })
      return
    }
    const released = (result.data?.releasedExpenseCount ?? 0) + (result.data?.releasedAdvanceCount ?? 0)
    showToast({
      tone: 'success',
      title: `ยกเลิก ${batch.name} แล้ว`,
      description: `${fmtCount(released)} รายการกลับไปรอจ่าย — สร้างรอบจ่ายใหม่เพื่อดึงรายการเข้าอีกครั้ง`,
    })
    onCancelled()
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`ยกเลิกรอบจ่าย — ${batch.name}`}
      description="ยกเลิกได้เฉพาะรอบที่ยังไม่ได้โอนเงินจริง รายการทั้งหมดจะกลับไปรอจ่าย"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            ปิด
          </Button>
          <Button variant="danger" loading={saving} disabled={!ready} onClick={() => void submit()}>
            ยืนยันยกเลิกรอบจ่าย
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-400">จำนวนรายการ:</span>
            <span className="font-semibold">{fmtCount(batch.itemCount)} รายการ</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">ยอดสุทธิ / ยอดโอน:</span>
            <span className="font-semibold">
              {fmtSatangSymbol(batch.netSatang)} / {fmtSatangSymbol(batch.transferSatang)}
            </span>
          </div>
          {batch.advanceOffsetSatang > 0 && (
            <div className="flex justify-between">
              <span className="text-slate-400">หักคืนเงินทดรอง:</span>
              <span className="font-semibold text-amber-700">{fmtSatangSymbol(batch.advanceOffsetSatang)}</span>
            </div>
          )}
        </div>

        <Field label="เหตุผลการยกเลิก" required hint="อย่างน้อย 5 ตัวอักษร — บันทึกลงรอบจ่ายและประวัติการแก้ไข">
          <Textarea
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="เช่น ดึงรายการผิดวันตัดรอบ / ต้องแก้บัญชีผู้รับเงินก่อนโอน"
          />
        </Field>

        {fileGenerated && (
          <label className="flex items-start gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              className="focus-ring mt-0.5 h-4 w-4 rounded border-slate-300"
              checked={confirmFileNotSent}
              onChange={(event) => setConfirmFileNotSent(event.target.checked)}
            />
            <span>
              ตรวจสอบแล้วว่า<strong>ยังไม่ได้อัปโหลดไฟล์โอน</strong>
              {batch.paymentFileGeneratedAt !== null && ` (สร้างเมื่อ ${fmtDateTime(batch.paymentFileGeneratedAt)})`}
              {' '}เข้าระบบธนาคาร และยังไม่มีการโอนเงินของรอบนี้
            </span>
          </label>
        )}

        <InlineAlert tone="error" title="การยกเลิกเป็นสถานะสุดท้าย">
          ย้อนกลับไม่ได้ — รายการเบิก/เงินทดรองกลับไปรอจ่าย · ยอดหักคืนเงินทดรองกลับเป็นยอดค้าง ·
          ไฟล์โอนของรอบนี้จะดาวน์โหลดไม่ได้อีก
        </InlineAlert>
      </div>
    </Modal>
  )
}
