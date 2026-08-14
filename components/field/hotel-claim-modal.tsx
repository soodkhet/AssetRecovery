'use client'

import { useEffect, useRef, useState } from 'react'
import { IconFile } from '@/components/field/field-icons'
import { Button, Field, Input, Modal, Select, Textarea, useToast } from '@/components/ui'
import { apiPath } from '@/lib/api/contract'
import { callApi, jsonRequest } from '@/lib/api/types'
import { EXPENSE_RECEIPT_ACCEPT } from '@/lib/field/media-upload'
import type { FieldExpenseDto, FieldTeammateDto } from '@/lib/field/types'
import { FieldUploadError, uploadExpenseReceipt } from '@/lib/field/upload-client'
import { parseBahtInput } from '@/lib/format/money'

/**
 * ฟอร์มเบิกค่าที่พัก (`41` §6.6 กลุ่ม "เบิกแยก" · §7.9)
 *
 * - 3 ฟิลด์บังคับ: วันที่เข้าพัก / จำนวนเงิน / ใบเสร็จ — **ผู้พักร่วมไม่บังคับ** และเลือกได้เฉพาะคนในทีม
 *   (ตัวเลือกมาจาก `GET /api/field/teammates` ซึ่งใช้เงื่อนไขเดียวกับยามฝั่ง BE)
 * - เบิกย้อนหลังได้เสมอ ⇒ ไม่ล็อกวันที่สูงสุด/ต่ำสุด
 * - เงินกรอกเป็น "บาท" แต่ส่งขึ้น API เป็น **satang จำนวนเต็ม** เสมอ (Rule 01)
 * - `<input type="date">` เป็นข้อยกเว้นเดียวที่ใช้ ค.ศ. บนหน้าจอ (Rule 01)
 */
export function HotelClaimModal({
  userId,
  onClose,
  onCreated,
}: {
  userId: string
  onClose: () => void
  onCreated: (expense: FieldExpenseDto) => void
}) {
  const { showToast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [teammates, setTeammates] = useState<FieldTeammateDto[]>([])
  const [expenseDate, setExpenseDate] = useState('')
  const [amountBaht, setAmountBaht] = useState('')
  const [sharedWithUserId, setSharedWithUserId] = useState('')
  const [note, setNote] = useState('')
  const [receipt, setReceipt] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const response = await callApi<{ items: FieldTeammateDto[] }>(apiPath('field.teammates'))
      if (cancelled) return
      setTeammates(response.data?.items ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function submit(): Promise<void> {
    const amountSatang = parseBahtInput(amountBaht)
    if (expenseDate === '' || amountSatang === null || Number.isNaN(amountSatang) || amountSatang <= 0) {
      setError('กรุณากรอกวันที่และจำนวนเงิน')
      return
    }
    if (receipt === null) {
      setError('ต้องแนบใบเสร็จก่อนส่งคำขอเบิก')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const receiptFileUrl = await uploadExpenseReceipt(userId, receipt)
      const response = await callApi<FieldExpenseDto>(
        apiPath('field.hotelClaim'),
        jsonRequest('POST', {
          expenseDate,
          amountSatang,
          sharedWithUserId: sharedWithUserId === '' ? null : sharedWithUserId,
          receiptFileUrl,
          note: note.trim() === '' ? null : note.trim(),
        }),
      )
      if (response.error !== undefined || response.data === undefined) {
        showToast({
          tone: 'error',
          title: response.error?.title ?? 'ส่งคำขอเบิกไม่สำเร็จ',
          description: response.error?.message,
        })
        return
      }
      showToast({ tone: 'success', title: 'ส่งคำขอเบิกค่าที่พักแล้ว — รอผู้อนุมัติตรวจสอบ' })
      onCreated(response.data)
      onClose()
    } catch (uploadError) {
      setError(uploadError instanceof FieldUploadError ? uploadError.message : 'อัปโหลดใบเสร็จไม่สำเร็จ')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="เบิกค่าที่พัก"
      footer={
        <Button onClick={() => void submit()} disabled={submitting} className="w-full justify-center py-3">
          {submitting ? 'กำลังส่งคำขอ...' : 'ส่งคำขอเบิก'}
        </Button>
      }
    >
      <div className="space-y-3">
        <Field label="วันที่เข้าพัก" required>
          <Input type="date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} />
        </Field>

        <Field label="จำนวนเงิน (บาท)" required>
          <Input
            numeric
            inputMode="decimal"
            placeholder="0.00"
            value={amountBaht}
            onChange={(event) => setAmountBaht(event.target.value)}
          />
        </Field>

        <Field label="พักร่วมกับ (ถ้ามี — เลือกได้จากคนในทีมเท่านั้น)">
          <Select value={sharedWithUserId} onChange={(event) => setSharedWithUserId(event.target.value)}>
            <option value="">— พักคนเดียว —</option>
            {teammates.map((teammate) => (
              <option key={teammate.id} value={teammate.id}>
                {teammate.fullName}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="แนบใบเสร็จ" required>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="focus-ring flex w-full flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-slate-300 py-6 text-slate-400"
          >
            <IconFile className="h-6 w-6" />
            <span className="text-xs font-semibold">
              {receipt === null ? 'แตะเพื่อแนบใบเสร็จ' : receipt.name}
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={EXPENSE_RECEIPT_ACCEPT}
            className="hidden"
            onChange={(event) => {
              setReceipt(event.target.files?.[0] ?? null)
              setError(null)
            }}
          />
        </Field>

        <Field label="หมายเหตุ (ถ้ามี)">
          <Textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>

        <p className="text-[13px] text-slate-500">
          ระบบจะจับคู่กับเคสที่มีกำหนดวันตรงกับวันที่พักนี้โดยอัตโนมัติ เพื่อใช้ตรวจสอบเท่านั้น
        </p>

        {error !== null && <p className="text-xs font-semibold text-red-600">{error}</p>}
      </div>
    </Modal>
  )
}
