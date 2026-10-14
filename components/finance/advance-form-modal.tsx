'use client'

import { useEffect, useState } from 'react'
import { usePermission } from '@/components/auth/permission-provider'
import { OnBehalfPayeeSelect } from '@/components/payees/on-behalf-payee-select'
import { Button, Field, InlineAlert, Input, Modal, Select, Textarea, useClearOnClose, useToast } from '@/components/ui'
import { advanceCreateAccess, minDueClearInputDate } from '@/lib/advances/advance'
import { advanceCaseOptionLabel, advanceRequestErrorText } from '@/lib/advances/advance-ui'
import { advanceCreateSchema } from '@/lib/advances/schemas'
import type { AdvanceCaseOptionDto, AdvanceDto } from '@/lib/advances/types'
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
 * - มติ PO U153/U160 — ผู้ที่ขอแทนผู้อื่นได้ (`manage:approve_advance` หรือ Superadmin) เลือกผู้รับเงินได้
 *   · ถ้าขอให้ตัวเองไม่ได้ (ไม่ถือ `manage:request_advance` เช่น การเงิน) ช่องผู้รับ = บังคับเลือก
 *   · server ตรวจซ้ำ (ไม่มีสิทธิ์ตามกรณี = 403)
 * - mytester DO-07 — ช่อง "อ้างอิงเคส (ไม่บังคับ)" เฉพาะการขอให้ตัวเอง: ตัวเลือก = เคสที่ตัวเองรับผิดชอบอยู่
 *   (`GET /api/advances/case-options`) · ขอแทนผู้อื่นไม่แสดงช่องนี้ · server ตรวจ scope ของเคสซ้ำเสมอ
 */
export function AdvanceFormModal({ open, onClose, onCreated }: {
  open: boolean
  onClose: () => void
  onCreated: (advance: AdvanceDto) => void
}) {
  const { showToast } = useToast()
  const { can } = usePermission()
  const access = advanceCreateAccess((capability) => can('manage', capability))
  const [payeeId, setPayeeId] = useState('')
  const [amount, setAmount] = useState('')
  const [purpose, setPurpose] = useState('')
  const [dueClearDate, setDueClearDate] = useState('')
  const [caseId, setCaseId] = useState('')
  // `null` = กำลังโหลด/โหลดไม่ได้ (ช่องยังใช้ได้ — เว้นว่าง = ไม่อ้างอิงเคส)
  const [caseOptions, setCaseOptions] = useState<AdvanceCaseOptionDto[] | null>(null)
  const [caseOptionsFailed, setCaseOptionsFailed] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  // error จาก API ค้างบนฟอร์ม (UAT BUG-046) — toast หายเร็วเกินกว่าพนักงานบนมือถือจะอ่านทัน
  const [submitError, setSubmitError] = useState<{ title: string; message: string } | null>(null)

  const forSelf = access.self && payeeId === ''

  useEffect(() => {
    if (!open || !access.self) return
    let cancelled = false
    void callApi<AdvanceCaseOptionDto[]>('/api/advances/case-options').then((result) => {
      if (cancelled) return
      setCaseOptions(result.data ?? null)
      setCaseOptionsFailed(result.data === undefined)
    })
    return () => {
      cancelled = true
    }
  }, [open, access.self])
  // ปิดฟอร์ม ⇒ ล้างข้อผิดจากการกดส่งครั้งก่อน — ร่างที่กรอกไว้ยังอยู่ (ตรวจซ้ำ staging SV5-R6-01)
  useClearOnClose(open, () => {
    setErrors({})
    setSubmitError(null)
  })

  if (!open) return null

  async function submit(): Promise<void> {
    const payload = {
      requestedSatang: parseBahtInput(amount) ?? Number.NaN,
      purpose: purpose.trim(),
      dueClearDate,
      payeeId: payeeId === '' ? null : payeeId,
      // ขอแทนผู้อื่นไม่มีช่องเคส ⇒ ไม่ส่งค่าค้างจากตอนเลือกเป็นของตัวเอง
      caseId: forSelf && caseId !== '' ? caseId : null,
    }
    const parsed = advanceCreateSchema.safeParse(payload)
    const needsPayee = !access.self && payload.payeeId === null
    if (!parsed.success || needsPayee) {
      setErrors({
        ...(parsed.success ? {} : toFieldErrors(parsed.error)),
        ...(needsPayee ? { payeeId: 'เลือกผู้รับเงินที่ขอแทน' } : {}),
      })
      return
    }

    setSaving(true)
    setSubmitError(null)
    // ส่ง payload ดิบ (วันที่ยังเป็นสตริง) — `parsed.data.dueClearDate` ถูก transform เป็น Date แล้ว
    const result = await callApi<AdvanceDto>('/api/advances', jsonRequest('POST', payload))
    setSaving(false)
    if (result.error !== undefined) {
      const text = advanceRequestErrorText(result.error)
      setSubmitError(text)
      showToast({ tone: 'error', title: text.title, description: text.message })
      return
    }
    showToast({ tone: 'success', title: 'ส่งคำขอแล้ว', description: 'รอการเงินอนุมัติก่อนรับเงิน' })
    setAmount('')
    setPurpose('')
    setDueClearDate('')
    setPayeeId('')
    setCaseId('')
    setErrors({})
    setSubmitError(null)
    if (result.data !== undefined) onCreated(result.data)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="ขอเบิกเงินทดรองจ่าย"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
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

        {submitError !== null && (
          <InlineAlert tone="error" title={submitError.title}>
            {submitError.message}
          </InlineAlert>
        )}

        {access.onBehalf && (
          <OnBehalfPayeeSelect
            value={payeeId}
            onChange={setPayeeId}
            error={errors.payeeId}
            allowSelf={access.self}
          />
        )}

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
            maxLength={500}
            rows={2}
            placeholder="ระบุวัตถุประสงค์ให้ชัดเจน เช่น เดินทางไปติดตามทรัพย์ จ.เชียงราย 3 วัน"
            value={purpose}
            onChange={(event) => setPurpose(event.target.value)}
          />
        </Field>

        {forSelf && (
          <Field
            label="อ้างอิงเคส (ไม่บังคับ)"
            error={errors.caseId}
            hint={
              caseOptionsFailed
                ? 'โหลดรายการเคสไม่สำเร็จ — ส่งคำขอโดยไม่อ้างอิงเคสได้'
                : caseOptions !== null && caseOptions.length === 0
                  ? 'ยังไม่มีเคสที่คุณรับผิดชอบอยู่'
                  : 'เลือกได้เฉพาะเคสที่คุณรับผิดชอบอยู่'
            }
          >
            <Select value={caseId} onChange={(event) => setCaseId(event.target.value)} disabled={caseOptions === null && !caseOptionsFailed}>
              <option value="">{caseOptions === null && !caseOptionsFailed ? 'กำลังโหลดเคส...' : '— ไม่อ้างอิงเคส —'}</option>
              {(caseOptions ?? []).map((option) => (
                <option key={option.caseId} value={option.caseId}>
                  {advanceCaseOptionLabel(option)}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="กำหนดเคลียร์ยอด" required error={errors.dueClearDate}>
          <Input
            type="date"
            // UAT Q8 — ปฏิทินเลือกวันที่ผ่านมาแล้วไม่ได้ (UX) · ด่านจริงคือ `advanceCreateSchema` ฝั่ง API
            min={minDueClearInputDate(new Date())}
            value={dueClearDate}
            onChange={(event) => setDueClearDate(event.target.value)}
          />
        </Field>
      </div>
    </Modal>
  )
}
