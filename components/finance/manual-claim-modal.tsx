'use client'

import { useState } from 'react'
import { Button, Field, InlineAlert, Input, Modal, Select, Textarea, useToast } from '@/components/ui'
import { callApi, jsonRequest } from '@/lib/api/types'
import { toFieldErrors } from '@/lib/api/validation'
import { MANUAL_CLAIM_TYPES } from '@/lib/claims/claim'
import { claimCreateSchema } from '@/lib/claims/schemas'
import { EXPENSE_TYPE_LABEL } from '@/lib/field/expense-ui'
import { parseBahtInput } from '@/lib/format/money'

/**
 * Modal "สร้าง Claim Manual" (`15` §6.1 ข้อ 2 · mockup `finance.html` `create-manual-claim`)
 *
 * ประเภทเลือกได้เฉพาะ `MANUAL_CLAIM_TYPES` — กลุ่มที่ผูกกับเคส (fuel/allowance/commission/
 * no_success_fee) ระบบสร้างเองจากไฟล์ 41 เท่านั้น **ห้ามเปิดให้กรอกมือ**
 *
 * ยอดกรอกเป็น **บาท** แล้วแปลงด้วย `parseBahtInput()` (Rule 01) · รายการที่สร้างไม่ผูกเคส
 * และเข้าคิวอนุมัติขั้น 1 ทันที ไม่ผ่านขั้นคลัง (`41` §6.6)
 */
export function ManualClaimModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const { showToast } = useToast()
  const [claimType, setClaimType] = useState<string>(MANUAL_CLAIM_TYPES[0] ?? 'manual')
  const [amount, setAmount] = useState('')
  const [expenseDate, setExpenseDate] = useState('')
  const [receiptFileUrl, setReceiptFileUrl] = useState('')
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  if (!open) return null

  async function submit(): Promise<void> {
    const payload = {
      claimType,
      grossSatang: parseBahtInput(amount) ?? Number.NaN,
      expenseDate,
      payeeId: null,
      receiptFileUrl: receiptFileUrl.trim(),
      note: note.trim(),
    }
    const parsed = claimCreateSchema.safeParse(payload)
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error))
      return
    }

    setSaving(true)
    // ส่ง payload ดิบ — `parsed.data.expenseDate` ถูก transform เป็น Date แล้ว (`dateOnlySchema`)
    const result = await callApi('/api/claims', jsonRequest('POST', payload))
    setSaving(false)
    if (result.error !== undefined) {
      showToast({ tone: 'error', title: result.error.title, description: result.error.message })
      return
    }
    showToast({ tone: 'success', title: 'สร้างรายการเบิกแล้ว', description: 'เข้าคิวอนุมัติขั้น 1 ทันที' })
    setAmount('')
    setExpenseDate('')
    setReceiptFileUrl('')
    setNote('')
    setErrors({})
    onCreated()
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="สร้างรายการเบิกด้วยตนเอง (Manual Claim)"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button loading={saving} onClick={() => void submit()}>
            ส่งเข้าคิวอนุมัติ
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <InlineAlert tone="warning">
          รายการที่สร้างที่นี่ <b>ไม่ผูกกับเคส</b> — ค่าน้ำมัน/เบี้ยเลี้ยง/ค่าคอมมิชชันของเคสระบบคิดให้เองจากงานภาคสนาม
          ห้ามกรอกซ้ำที่นี่
        </InlineAlert>

        <Field label="ประเภทรายการ" required error={errors.claimType}>
          <Select value={claimType} onChange={(event) => setClaimType(event.target.value)}>
            {MANUAL_CLAIM_TYPES.map((type) => (
              <option key={type} value={type}>
                {EXPENSE_TYPE_LABEL[type]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="ยอดเงิน (บาท)" required error={errors.grossSatang}>
          <Input
            numeric
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </Field>

        <Field label="วันที่เกิดรายการ" required error={errors.expenseDate}>
          <Input type="date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} />
        </Field>

        <Field label="ลิงก์ใบเสร็จ / หลักฐาน (ถ้ามี)" error={errors.receiptFileUrl}>
          <Input
            placeholder="path ของไฟล์ใน Storage เช่น expenses/<userId>/receipts/…"
            value={receiptFileUrl}
            onChange={(event) => setReceiptFileUrl(event.target.value)}
          />
        </Field>

        <Field label="รายละเอียด / หมายเหตุ" error={errors.note}>
          <Textarea
            rows={2}
            placeholder="เช่น ค่าที่พักระหว่างติดตามทรัพย์ จ.เชียงราย คืนวันที่ 12"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
      </div>
    </Modal>
  )
}
