'use client'

import { useState } from 'react'
import { Button, Field, InlineAlert, Input, Modal, Textarea, useToast } from '@/components/ui'
import type { AdvanceDto } from '@/lib/advances/types'
import { callApi, jsonRequest } from '@/lib/api/types'
import { fmtDate } from '@/lib/format/datetime'
import { fmtSatangSymbol, parseBahtInput } from '@/lib/format/money'

/**
 * Modal อนุมัติ / ปฏิเสธคำขอเงินทดรอง (`15` §9.1 · mockup `finance.html` `approve-advance`/`reject-advance`)
 *
 * - **อนุมัติ = เงินออกจริง** ⇒ ปรับลดยอดได้ (`approved_satang` แยกจาก `requested_satang`)
 *   เว้นว่าง = อนุมัติเต็มจำนวน · หน้าจอไม่คำนวณเงินเอง แค่แปลงบาท→สตางค์ (Rule 01)
 * - **ปฏิเสธต้องมีเหตุผลเสมอ** (`24` §6.4 `REJECTION_REASON_REQUIRED`) และเป็น terminal ไม่มีทางกลับ
 */
export function AdvanceReviewModal({
  advance,
  mode,
  onClose,
  onDone,
}: {
  advance: AdvanceDto | null
  mode: 'approve' | 'reject'
  onClose: () => void
  onDone: () => void
}) {
  const { showToast } = useToast()
  const [approvedAmount, setApprovedAmount] = useState('')
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  if (advance === null) return null

  const approvedSatang = approvedAmount.trim() === '' ? null : parseBahtInput(approvedAmount)
  const invalidAmount = approvedSatang !== null && (Number.isNaN(approvedSatang) || approvedSatang <= 0)
  const exceedsRequest =
    approvedSatang !== null && !Number.isNaN(approvedSatang) && approvedSatang > advance.requestedSatang

  function close(): void {
    setApprovedAmount('')
    setNote('')
    setReason('')
    onClose()
  }

  async function submit(): Promise<void> {
    if (advance === null) return
    setSaving(true)
    const result =
      mode === 'approve'
        ? await callApi(
            `/api/advances/${advance.id}/approve`,
            jsonRequest('PATCH', { approvedSatang, note: note.trim() }),
          )
        : await callApi(
            `/api/advances/${advance.id}/reject`,
            jsonRequest('PATCH', { rejectionReason: reason.trim() }),
          )
    setSaving(false)
    if (result.error !== undefined) {
      showToast({ tone: 'error', title: result.error.title, description: result.error.message })
      return
    }
    showToast({
      tone: 'success',
      title: mode === 'approve' ? 'อนุมัติเงินทดรองแล้ว' : 'ปฏิเสธคำขอแล้ว',
      description:
        mode === 'approve'
          ? `${advance.requesterName} — รอเคลียร์ยอดภายใน ${fmtDate(advance.dueClearDate)}`
          : `${advance.requesterName} — ขอเบิกรอบใหม่ได้ทันที`,
    })
    onDone()
    close()
  }

  return (
    <Modal
      open
      onClose={close}
      title={mode === 'approve' ? 'อนุมัติคำขอเงินทดรองจ่าย' : 'ปฏิเสธคำขอเงินทดรองจ่าย'}
      description={advance.purpose}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            ยกเลิก
          </Button>
          <Button
            loading={saving}
            disabled={mode === 'approve' ? invalidAmount || exceedsRequest : reason.trim().length < 5}
            onClick={() => void submit()}
          >
            {mode === 'approve' ? 'อนุมัติและปล่อยเงิน' : 'ยืนยันปฏิเสธ'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600">
          ผู้ขอ: <span className="font-semibold text-slate-800">{advance.requesterName}</span>
          {advance.teamName !== null && <span className="text-slate-500"> · {advance.teamName}</span>}
          <span className="block">
            ยอดที่ขอ: <span className="font-mono font-semibold">{fmtSatangSymbol(advance.requestedSatang)}</span> ·
            กำหนดเคลียร์: <span className="font-semibold">{fmtDate(advance.dueClearDate)}</span>
          </span>
        </div>

        {mode === 'approve' ? (
          <>
            <InlineAlert tone="warning">
              อนุมัติแล้วถือว่า<b>เงินออกจริง</b> — ผู้ขอจะขอเบิกรอบใหม่ไม่ได้จนกว่าจะเคลียร์ยอดนี้เสร็จ
            </InlineAlert>

            <Field label="ยอดที่อนุมัติ (บาท) — เว้นว่าง = อนุมัติเต็มจำนวน">
              <Input
                numeric
                inputMode="decimal"
                placeholder={`เต็มจำนวน ${fmtSatangSymbol(advance.requestedSatang)}`}
                value={approvedAmount}
                onChange={(event) => setApprovedAmount(event.target.value)}
              />
            </Field>

            {exceedsRequest && (
              <InlineAlert tone="error">
                อนุมัติเกินยอดที่ขอเบิกไม่ได้ — ปรับได้แค่ลดลงเท่านั้น
              </InlineAlert>
            )}

            <Field label="หมายเหตุ (ถ้ามี)">
              <Textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
            </Field>
          </>
        ) : (
          <Field label="เหตุผลที่ปฏิเสธ (บังคับกรอก)" required>
            <Textarea
              rows={3}
              placeholder="เช่น วัตถุประสงค์ไม่ชัดเจน ขอให้ระบุแผนการเดินทางและจำนวนวัน"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
        )}
      </div>
    </Modal>
  )
}
