'use client'

import { useState } from 'react'
import { Button, Field, InlineAlert, Input, Modal, Select, Textarea, useToast } from '@/components/ui'
import { ADVANCE_RETURN_METHOD_LABEL } from '@/lib/advances/advance'
import type { AdvanceDto } from '@/lib/advances/types'
import { callApi, jsonRequest } from '@/lib/api/types'
import { toInputDate } from '@/lib/format/datetime'
import { bahtInputError, fmtSatangSymbol, parseBahtInput } from '@/lib/format/money'
import type { AdvanceReturnMethod } from '@/lib/generated/prisma/enums'
import { StorageUploadError, uploadToStorage } from '@/lib/uploads/client'

/**
 * Modal ปิดยอดคืนเงินทดรอง (มติ PO 05/10/2569 UAT U30 · BUG-109) — การเงินเท่านั้น
 *
 * - **เปลี่ยนวิธีคืน**: หักกลบในรอบจ่าย ⇄ รับคืนแยก (ต้องมีเหตุผล) — ยอดที่ถูกหักในรอบจ่ายที่สร้างแล้วไม่ใช่ยอดค้าง
 * - **บันทึกรับคืนแยก**: ช่องทาง + วันที่ + ยอด + หลักฐาน (อัปโหลดผ่าน server) → ยอดครบ = ปิดยอดคืน
 * ยอดค้างทุกตัวมาจาก server (`returnOutstandingSatang`) — หน้าจอไม่คำนวณเงินเอง (Rule 01)
 */

export function ChangeReturnMethodModal({
  advance,
  onClose,
  onDone,
}: {
  advance: AdvanceDto | null
  onClose: () => void
  onDone: () => void
}) {
  const { showToast } = useToast()
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  if (advance === null || advance.returnMethod === null) return null

  const target: AdvanceReturnMethod = advance.returnMethod === 'payout_offset' ? 'separate' : 'payout_offset'
  const reasonOk = reason.trim().length >= 5

  async function submit(): Promise<void> {
    if (advance === null || !reasonOk) return
    setSaving(true)
    const result = await callApi<AdvanceDto>(
      `/api/advances/${advance.id}/return-method`,
      jsonRequest('PATCH', { returnMethod: target, reason: reason.trim() }),
    )
    setSaving(false)
    if (result.error !== undefined) {
      showToast({ tone: 'error', title: result.error.title, description: result.error.message })
      return
    }
    showToast({ tone: 'success', title: 'เปลี่ยนวิธีคืนยอดแล้ว', description: ADVANCE_RETURN_METHOD_LABEL[target] })
    setReason('')
    onDone()
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`เปลี่ยนวิธีคืนยอด ${advance.ref}`}
      description={`${advance.payeeName} · ยอดคืนค้าง ${fmtSatangSymbol(advance.returnOutstandingSatang)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button loading={saving} disabled={!reasonOk} onClick={() => void submit()}>
            เปลี่ยนเป็น{ADVANCE_RETURN_METHOD_LABEL[target]}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <InlineAlert tone="info">
          ปัจจุบัน: {ADVANCE_RETURN_METHOD_LABEL[advance.returnMethod]} — เปลี่ยนได้เฉพาะยอดที่ยังไม่ถูกหักในรอบจ่ายที่สร้างแล้ว
        </InlineAlert>
        <Field label="เหตุผล" required hint="อย่างน้อย 5 ตัวอักษร">
          <Textarea rows={2} value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

export function RecordSeparateReturnModal({
  advance,
  onClose,
  onDone,
}: {
  advance: AdvanceDto | null
  onClose: () => void
  onDone: () => void
}) {
  const { showToast } = useToast()
  const [channel, setChannel] = useState<'cash' | 'bank_transfer'>('bank_transfer')
  const [amount, setAmount] = useState('')
  const [receivedDate, setReceivedDate] = useState(() => toInputDate(new Date()))
  const [file, setFile] = useState<File | null>(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  if (advance === null) return null

  // ช่องว่าง = รับคืนเต็มยอดค้าง
  const parsed = amount.trim() === '' ? advance.returnOutstandingSatang : parseBahtInput(amount)
  const amountError = amount.trim() === '' ? null : bahtInputError(amount, 'ยอดที่รับคืน')
  const amountSatang = amountError === null && parsed !== null && Number.isInteger(parsed) ? parsed : null
  const overOutstanding = amountSatang !== null && amountSatang > advance.returnOutstandingSatang
  const canSubmit = amountSatang !== null && amountSatang > 0 && !overOutstanding && file !== null && receivedDate !== ''

  async function submit(): Promise<void> {
    if (advance === null || !canSubmit || file === null || amountSatang === null) return
    setSaving(true)
    let evidenceFilePath: string
    try {
      evidenceFilePath = await uploadToStorage({ kind: 'advance_return', advanceId: advance.id }, file)
    } catch (error) {
      setSaving(false)
      const message = error instanceof StorageUploadError ? error.message : 'อัปโหลดไฟล์ไม่สำเร็จ'
      showToast({ tone: 'error', title: 'แนบหลักฐานไม่สำเร็จ', description: message })
      return
    }
    const result = await callApi<AdvanceDto>(
      `/api/advances/${advance.id}/returns`,
      jsonRequest('POST', { channel, amountSatang, receivedDate, evidenceFilePath, note: note.trim() }),
    )
    setSaving(false)
    if (result.error !== undefined) {
      showToast({ tone: 'error', title: result.error.title, description: result.error.message })
      return
    }
    const remaining = result.data?.returnOutstandingSatang ?? 0
    showToast({
      tone: 'success',
      title: 'บันทึกรับคืนเงินทดรองแล้ว',
      description: remaining === 0 ? 'ยอดคืนครบ — ปิดยอดแล้ว' : `ยังค้างอีก ${fmtSatangSymbol(remaining)}`,
    })
    setAmount('')
    setFile(null)
    setNote('')
    onDone()
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`บันทึกรับคืนเงินทดรอง ${advance.ref}`}
      description={`${advance.payeeName} · ยอดคืนค้าง ${fmtSatangSymbol(advance.returnOutstandingSatang)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button loading={saving} disabled={!canSubmit} onClick={() => void submit()}>
            บันทึกรับคืน
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field id="adv-return-channel" label="ช่องทาง" required>
          <Select
            id="adv-return-channel"
            value={channel}
            onChange={(event) => setChannel(event.target.value === 'cash' ? 'cash' : 'bank_transfer')}
          >
            <option value="bank_transfer">โอนเข้าบัญชีบริษัท</option>
            <option value="cash">เงินสด</option>
          </Select>
        </Field>
        <Field
          id="adv-return-amount"
          label="ยอดที่รับคืน (บาท)"
          required
          hint={`เว้นว่าง = รับคืนเต็มยอดค้าง ${fmtSatangSymbol(advance.returnOutstandingSatang)}`}
          error={amountError ?? (overOutstanding ? 'ยอดเกินยอดคืนค้าง' : null)}
        >
          <Input
            id="adv-return-amount"
            numeric
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            invalid={amountError !== null || overOutstanding}
            onChange={(event) => setAmount(event.target.value)}
          />
        </Field>
        <Field id="adv-return-date" label="วันที่รับคืน" required>
          <Input
            id="adv-return-date"
            type="date"
            value={receivedDate}
            onChange={(event) => setReceivedDate(event.target.value)}
          />
        </Field>
        <Field id="adv-return-file" label="หลักฐาน (สลิปโอน/ใบรับเงิน — PDF/รูป)" required>
          <Input
            id="adv-return-file"
            type="file"
            accept="application/pdf,image/*"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </Field>
        <Field id="adv-return-note" label="หมายเหตุ (ถ้ามี)">
          <Textarea id="adv-return-note" rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
