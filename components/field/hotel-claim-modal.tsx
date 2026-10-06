'use client'

import { useEffect, useRef, useState } from 'react'
import { IconFile } from '@/components/field/field-icons'
import { Button, Field, Input, Modal, Select, Textarea, useToast } from '@/components/ui'
import { apiPath } from '@/lib/api/contract'
import { callApi, jsonRequest } from '@/lib/api/types'
import { HOTEL_NIGHTS_MAX, HOTEL_NIGHTS_MIN, hotelClaimFormError, parseHotelNightsInput } from '@/lib/field/hotel-claim'
import { EXPENSE_RECEIPT_ACCEPT } from '@/lib/field/media-upload'
import type { FieldExpenseDto, FieldTeammateDto } from '@/lib/field/types'
import { FieldUploadError, uploadExpenseReceipt } from '@/lib/field/upload-client'
import { parseBahtInput, toBahtInput } from '@/lib/format/money'
import { NoReceiptLinesEditor, NoReceiptToggle } from '@/components/substitute-receipts/no-receipt-lines'
import {
  emptySubstituteLine,
  substituteDraftPayload,
  substituteDraftTotalSatang,
  type SubstituteLineDraft,
} from '@/lib/substitute-receipts/form'

/**
 * ฟอร์มเบิกค่าที่พัก (`41` §6.6 กลุ่ม "เบิกแยก" · §7.9)
 *
 * - 3 ฟิลด์บังคับ: วันที่เข้าพัก / จำนวนเงิน / ใบเสร็จ — **ผู้พักร่วมไม่บังคับ** และเลือกได้เฉพาะคนในทีม
 * - "จำนวนคืน" ไม่บังคับ (ว่าง = 1 · จำนวนเต็ม 1–31 — มติ PO O50) ใบเสร็จ 1 ใบครอบหลายคืนได้ ⇒ เพดาน = อัตรา/คืน × จำนวนคืน
 *   (ตัวเลือกมาจาก `GET /api/field/teammates` ซึ่งใช้เงื่อนไขเดียวกับยามฝั่ง BE)
 * - เบิกย้อนหลังได้เสมอ ⇒ ไม่ล็อกวันที่สูงสุด/ต่ำสุด
 * - เงินกรอกเป็น "บาท" แต่ส่งขึ้น API เป็น **satang จำนวนเต็ม** เสมอ (Rule 01)
 * - `<input type="date">` เป็นข้อยกเว้นเดียวที่ใช้ ค.ศ. บนหน้าจอ (Rule 01)
 */
export function HotelClaimModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (expense: FieldExpenseDto) => void
}) {
  const { showToast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [teammates, setTeammates] = useState<FieldTeammateDto[]>([])
  const [expenseDate, setExpenseDate] = useState('')
  const [amountBaht, setAmountBaht] = useState('')
  const [nightsText, setNightsText] = useState('1')
  const [sharedWithUserId, setSharedWithUserId] = useState('')
  const [note, setNote] = useState('')
  const [receipt, setReceipt] = useState<File | null>(null)
  // มติ PO U96 #14 — ค่าเริ่มต้นไม่ติ๊ก ให้ผู้เบิกเลือกเองตามใบเสร็จจริง
  const [receiptInCompanyName, setReceiptInCompanyName] = useState(false)
  // มติ PO U103 — ไม่มีใบเสร็จ ⇒ กรอกรายการ แล้วระบบออกใบรับรองแทนใบเสร็จ (ยอดเบิก = ยอดรวมรายการ)
  const [noReceipt, setNoReceipt] = useState(false)
  const [substituteLines, setSubstituteLines] = useState<SubstituteLineDraft[]>([emptySubstituteLine('line-0')])
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

  const substituteTotal = substituteDraftTotalSatang(substituteLines)

  async function submit(): Promise<void> {
    const effectiveAmountBaht = noReceipt ? toBahtInput(substituteTotal) : amountBaht
    const formError = hotelClaimFormError({
      expenseDate,
      amountBaht: effectiveAmountBaht,
      hasReceipt: noReceipt || receipt !== null,
      nightsText,
    })
    const amountSatang = parseBahtInput(effectiveAmountBaht)
    const hotelNights = parseHotelNightsInput(nightsText)
    const substitute = noReceipt ? substituteDraftPayload(substituteLines) : null
    if (formError !== null || amountSatang === null || Number.isNaN(amountSatang) || hotelNights === null) {
      setError(formError ?? 'กรุณากรอกข้อมูลให้ครบ')
      return
    }
    if (substitute !== null && substitute.error !== null) {
      setError(substitute.error)
      return
    }
    if (!noReceipt && receipt === null) {
      setError('ต้องแนบใบเสร็จก่อนส่งคำขอเบิก')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const receiptFileUrl = noReceipt || receipt === null ? null : await uploadExpenseReceipt(receipt)
      const response = await callApi<FieldExpenseDto>(
        apiPath('field.hotelClaim'),
        jsonRequest('POST', {
          expenseDate,
          amountSatang,
          hotelNights,
          receiptInCompanyName,
          sharedWithUserId: sharedWithUserId === '' ? null : sharedWithUserId,
          receiptFileUrl,
          substituteReceipt: substitute === null ? null : substitute.payload,
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
      showToast({
        tone: 'success',
        title: 'ส่งคำขอเบิกค่าที่พักแล้ว — รอผู้อนุมัติตรวจสอบ',
        description:
          response.data.substituteReceipt === null
            ? undefined
            : `ออกใบรับรองแทนใบเสร็จ ${response.data.substituteReceipt.receiptNumber} แล้ว — ดาวน์โหลดไปเซ็นแล้วอัปโหลดฉบับเซ็นจากรายการเบิก`,
      })
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

        <Field label="จำนวนคืน" hint="ใบเสร็จใบเดียวครอบหลายคืนได้ — ไม่กรอก = 1 คืน">
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

        <Field label="จำนวนเงิน (บาท)" required hint={noReceipt ? 'ไม่มีใบเสร็จ — ใช้ยอดรวมของรายการด้านล่าง' : undefined}>
          <Input
            numeric
            inputMode="decimal"
            placeholder="0.00"
            disabled={noReceipt}
            value={noReceipt ? toBahtInput(substituteTotal) : amountBaht}
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

        <NoReceiptToggle
          checked={noReceipt}
          onChange={(checked) => {
            setNoReceipt(checked)
            setError(null)
          }}
          hint="เรียกใบเสร็จจากผู้รับเงินไม่ได้ — กรอกรายการแล้วระบบออกใบรับรองแทนใบเสร็จรับเงินให้เซ็น"
        />

        {noReceipt ? (
          <NoReceiptLinesEditor lines={substituteLines} onChange={setSubstituteLines} defaultDate={expenseDate} />
        ) : (
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
        )}

        <ReceiptInCompanyNameCheckbox checked={receiptInCompanyName} onChange={setReceiptInCompanyName} />

        <Field label="หมายเหตุ (ถ้ามี)">
          <Textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>

        <p className="text-[13px] text-slate-500">
          ระบบจะจับคู่กับเคสที่มีกำหนดวันอยู่ในช่วงวันที่พักนี้โดยอัตโนมัติ เพื่อใช้ตรวจสอบเท่านั้น
        </p>

        {error !== null && <p className="text-xs font-semibold text-red-600">{error}</p>}
      </div>
    </Modal>
  )
}

/**
 * ช่องติ๊ก "ใบเสร็จออกในนามบริษัท" (มติ PO U96 #14) — ใช้ทั้งฟอร์มเบิกและฟอร์มส่งใหม่ (Mobile/Desktop ชุดเดียว)
 * ค่านี้ใช้ส่งรายการให้สำนักงานบัญชีพิจารณาภาษีเท่านั้น ไม่เปลี่ยนยอดเบิก/ยอดหัก ณ ที่จ่ายในระบบ
 */
export function ReceiptInCompanyNameCheckbox({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-700">
      <input
        type="checkbox"
        className="focus-ring mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        <span className="font-semibold">ใบเสร็จออกในนามบริษัท</span>
        <span className="mt-0.5 block text-xs text-slate-500">
          ติ๊กเมื่อใบเสร็จระบุชื่อบริษัทเป็นผู้ซื้อ — ถ้าออกในชื่อตัวเองหรือไม่ระบุชื่อ ไม่ต้องติ๊ก
        </span>
      </span>
    </label>
  )
}
