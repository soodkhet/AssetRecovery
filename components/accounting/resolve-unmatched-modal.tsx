'use client'

import { useState } from 'react'
import { Button, Field, InlineAlert, Input, Modal, useToast } from '@/components/ui'
import { callApi, jsonRequest } from '@/lib/api/types'
import type { BankTransactionDto } from '@/lib/bank-recon/types'
import { fmtDate } from '@/lib/format/datetime'
import { fmtSatangSymbol } from '@/lib/format/money'

/**
 * Modal "ปิดรายการโดยไม่จับคู่" (`35` §6.4/§8 · mockup `accounting.html` `resolve-unmatched`)
 *
 * ใช้กับรายการที่**ไม่มีทางจับคู่ได้จริง** (ค่าธรรมเนียมธนาคาร/ดอกเบี้ยรับ) — เหตุผลบังคับเสมอ
 * และเป็นสถานะสุดท้าย (terminal) กลับมาจับคู่ทีหลังไม่ได้ จึงต้อง confirm ให้ชัดก่อนกด
 */
export function ResolveUnmatchedModal({
  transaction,
  onClose,
  onResolved,
}: {
  transaction: BankTransactionDto | null
  onClose: () => void
  onResolved: () => void
}) {
  const { showToast } = useToast()
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  if (transaction === null) return null

  const ready = note.trim() !== ''

  async function submit(): Promise<void> {
    if (!ready || transaction === null) return
    setSaving(true)
    const result = await callApi<BankTransactionDto>(
      `/api/bank-reconciliation/transactions/${transaction.id}/resolve-unmatched`,
      jsonRequest('PATCH', { matchNote: note.trim() }),
    )
    setSaving(false)

    if (result.error !== undefined) {
      showToast({ tone: 'error', title: result.error.title, description: result.error.message })
      return
    }
    showToast({
      tone: 'success',
      title: 'ปิดรายการแล้ว',
      description: 'รายการนี้ถูกนับเป็น "จัดการครบ" ในการตรวจความพร้อมปิดงวด',
    })
    onResolved()
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="ปิดรายการโดยไม่จับคู่"
      description="ใช้กับรายการที่ไม่ใช่รายรับ-รายจ่ายของระบบ เช่น ค่าธรรมเนียมธนาคาร ดอกเบี้ยรับ"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button variant="danger" loading={saving} disabled={!ready} onClick={() => void submit()}>
            ยืนยันปิดรายการ
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-400">รายการ:</span>
            <span className="font-semibold">{transaction.description}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">วันที่ / บัญชี:</span>
            <span className="font-mono">
              {fmtDate(transaction.transactionDate)} · {transaction.bankAccountLabel}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">ยอด:</span>
            <span className={`font-bold ${transaction.amountSatang >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {transaction.amountSatang >= 0 ? '+' : '-'}
              {fmtSatangSymbol(Math.abs(transaction.amountSatang))}
            </span>
          </div>
        </div>

        <Field label="เหตุผลที่ปิดรายการ" required hint="บังคับกรอกเสมอ — บันทึกลง audit log">
          <Input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="เช่น ค่าธรรมเนียมธนาคารรายเดือน / ดอกเบี้ยรับ — ไม่ใช่รายรับ-จ่ายของระบบ"
          />
        </Field>

        <InlineAlert tone="warning" title="เป็นสถานะสุดท้าย">
          สถานะจะเปลี่ยนเป็น <b>ปิดรายการแล้ว</b> และกลับไปจับคู่ทีหลังไม่ได้ · นับเป็น &ldquo;จัดการครบ&rdquo; ใน
          เงื่อนไขกระทบยอด 100% ของการตรวจความพร้อมปิดงวด (ไฟล์ 30)
        </InlineAlert>
      </div>
    </Modal>
  )
}
