'use client'

import { useState } from 'react'
import { Button, Field, InlineAlert, Modal, Textarea, useToast } from '@/components/ui'
import { callApi, jsonRequest } from '@/lib/api/types'
import { fmtDate } from '@/lib/format/datetime'
import { fmtSatangSymbol } from '@/lib/format/money'
import type { WhtFilingSummaryDto } from '@/lib/wht/types'

/**
 * Modal "Mark ว่ายื่นแบบแล้ว" (`33` §9 · mockup `accounting.html` `mark-wht-filed`)
 *
 * การยื่นจริงเกิด**นอกระบบ** (สำนักงานบัญชี/e-Filing) — ที่นี่บันทึกแค่ว่ายื่นแล้วพร้อมอ้างอิง
 * ที่ตามต่อได้ · ทำได้ครั้งเดียว (`WHT_FILING_ALREADY_FILED`)
 */
export function MarkWhtFiledModal({
  summary,
  onClose,
  onFiled,
}: {
  summary: WhtFilingSummaryDto | null
  onClose: () => void
  onFiled: () => void
}) {
  const { showToast } = useToast()
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  if (summary === null) return null

  const ready = reason.trim() !== ''

  async function submit(): Promise<void> {
    if (!ready || summary === null) return
    setSaving(true)
    const result = await callApi<WhtFilingSummaryDto>(
      `/api/accounting/wht-filing-summary/${summary.id}/mark-filed`,
      jsonRequest('PATCH', { reason: reason.trim() }),
    )
    setSaving(false)

    if (result.error !== undefined) {
      showToast({ tone: 'error', title: result.error.title, description: result.error.message })
      return
    }
    showToast({
      tone: 'success',
      title: `บันทึกว่ายื่นแบบรอบ ${summary.periodLabel} แล้ว`,
      description: 'ระบบเก็บอ้างอิงการยื่นไว้ใน audit log',
    })
    onFiled()
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Mark ว่ายื่นแบบแล้ว — รอบ ${summary.periodLabel}`}
      description="ยืนยันว่ายื่น ภ.ง.ด.3/53 ของรอบนี้ต่อกรมสรรพากรเรียบร้อยแล้ว (ยื่นจริงนอกระบบ)"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            ปิด
          </Button>
          <Button loading={saving} disabled={!ready} onClick={() => void submit()}>
            ยืนยันว่ายื่นแล้ว
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-red-100 bg-red-50 p-4 text-center">
            <div className="text-xs font-bold text-red-500">ภ.ง.ด.3</div>
            <div className="mt-1 text-xl font-extrabold text-red-700">{fmtSatangSymbol(summary.pnd3Satang)}</div>
            <div className="mt-1 text-[10px] text-slate-400">บุคคลธรรมดา</div>
          </div>
          <div className="rounded-lg border border-orange-100 bg-orange-50 p-4 text-center">
            <div className="text-xs font-bold text-orange-500">ภ.ง.ด.53</div>
            <div className="mt-1 text-xl font-extrabold text-orange-700">{fmtSatangSymbol(summary.pnd53Satang)}</div>
            <div className="mt-1 text-[10px] text-slate-400">นิติบุคคล</div>
          </div>
        </div>

        <div className="space-y-2 rounded-lg border border-slate-200 p-3 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-400">กำหนดนำส่ง:</span>
            <span className={summary.isOverdue ? 'font-bold text-red-600' : 'font-bold'}>
              {fmtDate(summary.filingDueDate)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">คงเหลือ:</span>
            <span className="font-semibold">
              {summary.isOverdue ? `เลยกำหนดมา ${Math.abs(summary.daysRemaining)} วัน` : `${summary.daysRemaining} วัน`}
            </span>
          </div>
        </div>

        <Field label="อ้างอิงการยื่น" required hint="บังคับกรอก — เช่น เลขที่ใบเสร็จ/วันที่ยื่น/ผู้ยื่น">
          <Textarea
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="เช่น ยื่นผ่าน e-Filing เลขที่รับ 2569-0001 เมื่อ 10/07/2569 โดยสำนักงานบัญชี"
          />
        </Field>

        <InlineAlert tone="info" title="ยอดที่ยื่นมาจากใบที่ยังใช้งานอยู่เท่านั้น">
          ใบ 50 ทวิ ที่ถูกยกเลิกไม่ถูกนับในยอดนี้ (`33` §9) — ถ้ายังต้องแก้ใบไหน ให้ยกเลิก/ออกใบแทนก่อน mark
        </InlineAlert>
      </div>
    </Modal>
  )
}
