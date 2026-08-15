'use client'

import { useState } from 'react'
import { Button, Field, InlineAlert, Input, Modal, Textarea, useToast } from '@/components/ui'
import { advanceCreateSchema } from '@/lib/advances/schemas'
import type { AdvanceDto } from '@/lib/advances/types'
import { callApi, jsonRequest } from '@/lib/api/types'
import { toFieldErrors } from '@/lib/api/validation'
import { parseBahtInput } from '@/lib/format/money'

/**
 * ฟอร์ม "ขอเบิกเงินทดรองจ่าย" (`15` §8 · mockup `finance.html` `advance-form`)
 *
 * - **banner เตือนสีเหลืองอยู่บนฟอร์มเสมอ** ตาม `15` §8 (กติกาห้ามเบิกซ้อน)
 * - ช่องเงินกรอกเป็น **บาท** แล้วแปลงด้วย `parseBahtInput()` — ห้ามคูณ 100 เองในหน้าจอ (Rule 01)
 * - กำหนดเคลียร์ยอดเป็น `<input type="date">` (ISO ค.ศ. — ข้อยกเว้นเดียวของกฎ พ.ศ.) แล้ว
 *   **ส่งค่าดิบเป็นสตริง** ให้ API parse เอง (กับดัก `dateOnlySchema` transform → Date)
 */
export function AdvanceFormModal({ open, onClose, onCreated }: {
  open: boolean
  onClose: () => void
  onCreated: (advance: AdvanceDto) => void
}) {
  const { showToast } = useToast()
  const [amount, setAmount] = useState('')
  const [purpose, setPurpose] = useState('')
  const [dueClearDate, setDueClearDate] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  if (!open) return null

  async function submit(): Promise<void> {
    const payload = {
      requestedSatang: parseBahtInput(amount) ?? Number.NaN,
      purpose: purpose.trim(),
      dueClearDate,
      payeeId: null,
    }
    const parsed = advanceCreateSchema.safeParse(payload)
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error))
      return
    }

    setSaving(true)
    // ส่ง payload ดิบ (วันที่ยังเป็นสตริง) — `parsed.data.dueClearDate` ถูก transform เป็น Date แล้ว
    const result = await callApi<AdvanceDto>('/api/advances', jsonRequest('POST', payload))
    setSaving(false)
    if (result.error !== undefined) {
      showToast({ tone: 'error', title: result.error.title, description: result.error.message })
      return
    }
    showToast({ tone: 'success', title: 'ส่งคำขอแล้ว', description: 'รอการเงินอนุมัติก่อนรับเงิน' })
    setAmount('')
    setPurpose('')
    setDueClearDate('')
    setErrors({})
    if (result.data !== undefined) onCreated(result.data)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="ขอเบิกเงินทดรองจ่าย (Advance Request)"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button loading={saving} onClick={() => void submit()}>
            ส่งคำขออนุมัติ
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <InlineAlert tone="warning">
          ⚠️ กฎ: ต้องเคลียร์ยอดเดิมให้เสร็จก่อนขอเบิกรอบใหม่ได้เสมอ — ยอดที่อนุมัติแล้วหรือเลยกำหนดเคลียร์ถือว่ายังค้างทั้งคู่
        </InlineAlert>

        <Field label="ยอดเงินที่ขอเบิก (บาท)" required error={errors.requestedSatang}>
          <Input
            numeric
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </Field>

        <Field label="วัตถุประสงค์ (บังคับกรอก)" required error={errors.purpose}>
          <Textarea
            rows={2}
            placeholder="ระบุวัตถุประสงค์ให้ชัดเจน เช่น เดินทางไปติดตามทรัพย์ จ.เชียงราย 3 วัน"
            value={purpose}
            onChange={(event) => setPurpose(event.target.value)}
          />
        </Field>

        <Field label="กำหนดเคลียร์ยอด" required error={errors.dueClearDate}>
          <Input type="date" value={dueClearDate} onChange={(event) => setDueClearDate(event.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
