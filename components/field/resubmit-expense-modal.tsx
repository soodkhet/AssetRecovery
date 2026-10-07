'use client'

import { useRef, useState } from 'react'
import { IconFile } from '@/components/field/field-icons'
import { ReceiptInCompanyNameCheckbox } from '@/components/field/hotel-claim-modal'
import { Button, Field, InlineAlert, Input, Modal, Textarea, useToast } from '@/components/ui'
import { apiPath } from '@/lib/api/contract'
import { callApi, jsonRequest } from '@/lib/api/types'
import { EXPENSE_TYPE_ICON, expenseTypeLabel, isSeparateExpense } from '@/lib/field/expense-ui'
import {
  HOTEL_NIGHTS_MAX,
  HOTEL_NIGHTS_MIN,
  HOTEL_NIGHTS_RANGE_MESSAGE,
  hotelNightsCapText,
  parseHotelNightsInput,
} from '@/lib/field/hotel-claim'
import { EXPENSE_RECEIPT_ACCEPT } from '@/lib/field/media-upload'
import type { FieldExpenseDto } from '@/lib/field/types'
import { FieldUploadError, uploadExpenseReceipt } from '@/lib/field/upload-client'
import { fmtDate } from '@/lib/format/datetime'
import { bahtInputError, fmtSatangSymbol, parseBahtInput, toBahtInput } from '@/lib/format/money'

/**
 * แก้ไขรายการเบิกที่ถูกตีกลับแล้วส่งใหม่ (`41` §6.6 · §8 `resubmit_expense`)
 *
 * - **เจ้าของรายการเท่านั้น** ที่ทำได้ (BE ตรวจซ้ำจาก payee ของผู้เรียก — หัวหน้าทีมแก้แทนไม่ได้)
 * - รายการกลุ่ม "ผูกกับเคส" ระบบคำนวณยอดให้ ⇒ แก้ได้แค่หมายเหตุ (ช่องยอด/ใบเสร็จซ่อนไว้)
 * - ค่าที่พักแก้ "จำนวนคืน" ได้ด้วย (มติ PO O50) — BE ตรวจเพดานด้วยจำนวนคืนหลังแก้
 * - ส่งใหม่แล้วกลับเข้า `pending_approval` — **ไม่ผ่านขั้นรอคลังซ้ำ** (`41` §6.6)
 */
export function ResubmitExpenseModal({
  expense,
  onClose,
  onDone,
}: {
  expense: FieldExpenseDto
  onClose: () => void
  onDone: () => void
}) {
  const { showToast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const editable = isSeparateExpense(expense)
  const isHotel = expense.expenseType === 'hotel'
  const [nightsText, setNightsText] = useState(() => String(expense.hotelNights))
  const [receiptInCompanyName, setReceiptInCompanyName] = useState(() => expense.receiptInCompanyName)
  const [amountBaht, setAmountBaht] = useState(() => toBahtInput(expense.grossSatang))
  const [note, setNote] = useState('')
  const [receipt, setReceipt] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(): Promise<void> {
    if (note.trim() === '') {
      setError('ต้องระบุสิ่งที่แก้ไขให้ผู้อนุมัติทราบ')
      return
    }

    let amountSatang: number | undefined
    if (editable) {
      const parsed = parseBahtInput(amountBaht)
      if (parsed === null || Number.isNaN(parsed) || parsed <= 0) {
        setError(bahtInputError(amountBaht, 'จำนวนเงิน') ?? 'จำนวนเงินต้องมากกว่า 0')
        return
      }
      amountSatang = parsed
    }

    let hotelNights: number | undefined
    if (isHotel) {
      const parsedNights = parseHotelNightsInput(nightsText)
      if (parsedNights === null) {
        setError(HOTEL_NIGHTS_RANGE_MESSAGE)
        return
      }
      hotelNights = parsedNights
    }

    setSubmitting(true)
    setError(null)
    try {
      const receiptFileUrl = receipt === null ? undefined : await uploadExpenseReceipt(receipt)
      const response = await callApi<FieldExpenseDto>(
        apiPath('field.resubmitExpense', { id: expense.id }),
        jsonRequest('POST', {
          ...(amountSatang === undefined ? {} : { amountSatang }),
          ...(hotelNights === undefined ? {} : { hotelNights }),
          ...(isHotel ? { receiptInCompanyName } : {}),
          ...(receiptFileUrl === undefined ? {} : { receiptFileUrl }),
          note: note.trim(),
        }),
      )
      if (response.error !== undefined) {
        showToast({ tone: 'error', title: response.error.title, description: response.error.message })
        return
      }
      showToast({ tone: 'success', title: 'ส่งรายการเบิกกลับเข้าคิวอนุมัติแล้ว' })
      onDone()
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
      title="แก้ไขรายการเบิกที่ถูกตีกลับ"
      description={`${EXPENSE_TYPE_ICON[expense.expenseType]} ${expenseTypeLabel(expense.expenseType)} · ${fmtDate(expense.expenseDate)} · ${fmtSatangSymbol(expense.grossSatang)}`}
      footer={
        <Button onClick={() => void submit()} loading={submitting} className="w-full justify-center py-3">
          {submitting ? 'กำลังส่ง...' : 'ส่งกลับเข้าคิวอนุมัติ'}
        </Button>
      }
    >
      <div className="space-y-3">
        {expense.rejectReason !== null && (
          <InlineAlert tone="warning" title="เหตุผลที่ถูกตีกลับ">
            {expense.rejectReason}
          </InlineAlert>
        )}
        {/* หมายเหตุตอนเบิกคงเดิม — ข้อความชี้แจงด้านล่างเก็บแยก ไม่เขียนทับ (UAT BUG-098) */}
        {expense.note !== null && <div className="text-xs text-slate-500">หมายเหตุตอนเบิก: {expense.note}</div>}

        {editable ? (
          <>
            <Field label="จำนวนเงิน (บาท)" required>
              <Input
                numeric
                inputMode="decimal"
                value={amountBaht}
                onChange={(event) => setAmountBaht(event.target.value)}
              />
            </Field>

            {isHotel && (
              <Field
                label="จำนวนคืน"
                hint={`เดิม ${hotelNightsCapText(expense.hotelNights, expense.hotelMaxPerNightSatang)} — ไม่กรอก = 1 คืน`}
              >
                <Input
                  type="number"
                  inputMode="numeric"
                  min={HOTEL_NIGHTS_MIN}
                  max={HOTEL_NIGHTS_MAX}
                  step={1}
                  value={nightsText}
                  onChange={(event) => setNightsText(event.target.value)}
                />
              </Field>
            )}

            <Field label="แนบใบเสร็จใหม่ (ถ้าต้องเปลี่ยน)">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="focus-ring flex w-full flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-slate-300 py-5 text-slate-400"
              >
                <IconFile className="h-6 w-6" />
                <span className="text-xs font-semibold">
                  {receipt === null ? 'ใช้ใบเสร็จเดิม — แตะเพื่อเปลี่ยน' : receipt.name}
                </span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept={EXPENSE_RECEIPT_ACCEPT}
                className="hidden"
                onChange={(event) => setReceipt(event.target.files?.[0] ?? null)}
              />
            </Field>

            {isHotel && (
              <ReceiptInCompanyNameCheckbox checked={receiptInCompanyName} onChange={setReceiptInCompanyName} />
            )}
          </>
        ) : (
          <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
            รายการนี้ระบบคำนวณยอดให้จากแผนค่าตอบแทน — แก้ยอดเองไม่ได้ ระบุสิ่งที่ชี้แจงในหมายเหตุแทน
          </p>
        )}

        <Field label="สิ่งที่แก้ไข / ชี้แจง" required>
          <Textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>

        {error !== null && <p className="text-xs font-semibold text-red-600">{error}</p>}
      </div>
    </Modal>
  )
}
