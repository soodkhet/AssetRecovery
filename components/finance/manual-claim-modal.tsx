'use client'

import { useEffect, useRef, useState } from 'react'
import { usePermission } from '@/components/auth/permission-provider'
import { OnBehalfPayeeSelect } from '@/components/payees/on-behalf-payee-select'
import { NoReceiptLinesEditor, NoReceiptToggle } from '@/components/substitute-receipts/no-receipt-lines'
import { StagedFileInput } from '@/components/uploads/staged-file-input'
import { Button, Field, FieldErrorText, InlineAlert, Input, Modal, Select, Textarea, useRevealFieldError, useToast } from '@/components/ui'
import { callApi, jsonRequest } from '@/lib/api/types'
import { toFieldErrors } from '@/lib/api/validation'
import { MANUAL_CLAIM_TYPES } from '@/lib/claims/claim'
import { claimCreateSchema } from '@/lib/claims/schemas'
import { EXPENSE_RECEIPT_ACCEPT } from '@/lib/field/media-upload'
import { EXPENSE_TYPE_LABEL } from '@/lib/field/expense-ui'
import { FieldUploadError, uploadExpenseReceipt } from '@/lib/field/upload-client'
import { parseBahtInput, toBahtInput } from '@/lib/format/money'
import {
  emptySubstituteLine,
  substituteDraftPayload,
  substituteDraftTotalSatang,
  substituteLineRowError,
  type SubstituteLineDraft,
  type SubstituteLineIssueAt,
} from '@/lib/substitute-receipts/form'

/** ข้อความแทนตัวเลือก "ไม่มีใบเสร็จ" เมื่อแผนทีมของผู้รับเงินบังคับใบเสร็จค่าที่พัก (ตรงกับฟอร์มมือถือ) */
export const HOTEL_RECEIPT_REQUIRED_NOTE = 'แผนค่าตอบแทนของทีมผู้รับเงินบังคับแนบใบเสร็จค่าที่พัก — ใช้ใบรับรองแทนใบเสร็จไม่ได้'

/**
 * Modal "สร้าง Claim Manual" (`15` §6.1 ข้อ 2 · mockup `finance.html` `create-manual-claim`)
 *
 * ประเภทเลือกได้เฉพาะ `MANUAL_CLAIM_TYPES` — กลุ่มที่ผูกกับเคส (fuel/allowance/commission/
 * no_success_fee) ระบบสร้างเองจากไฟล์ 41 เท่านั้น **ห้ามเปิดให้กรอกมือ**
 *
 * ยอดกรอกเป็น **บาท** แล้วแปลงด้วย `parseBahtInput()` (Rule 01) · รายการที่สร้างไม่ผูกเคส
 * และเข้าคิวอนุมัติขั้น 1 ทันที ไม่ผ่านขั้นคลัง (`41` §6.6)
 *
 * มติ PO U143 — ใบเสร็จ **อัปโหลดไฟล์จริง** (เลือกไฟล์ → อัปโหลดตอนกดบันทึก → server ตรวจไฟล์ + SHA-256)
 * ไม่มีใบเสร็จ ⇒ ติ๊ก "ไม่มีใบเสร็จ" กรอกรายการ แล้วระบบออกใบรับรองแทนใบเสร็จ (ยอดเบิก = ยอดรวมรายการ)
 * มติ PO U153 — ผู้ที่บันทึกแทนผู้อื่นได้ (`manage:approve_expense_finance`) เลือกผู้รับเงินได้
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
  const { can } = usePermission()
  const canRecordForOthers = can('manage', 'approve_expense_finance')
  const [claimType, setClaimType] = useState<string>(MANUAL_CLAIM_TYPES[0] ?? 'manual')
  const [amount, setAmount] = useState('')
  const [expenseDate, setExpenseDate] = useState('')
  const [payeeId, setPayeeId] = useState('')
  const [receipt, setReceipt] = useState<File | null>(null)
  const [noReceipt, setNoReceipt] = useState(false)
  const [substituteLines, setSubstituteLines] = useState<SubstituteLineDraft[]>([emptySubstituteLine('line-0')])
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  // แถว/ช่องที่ผิดในตารางรายการ "ไม่มีใบเสร็จ" + เลื่อน/โฟกัสช่องที่ผิดหลังกดส่ง (ตรวจซ้ำ staging SV5-R4-01)
  const [substituteAt, setSubstituteAt] = useState<SubstituteLineIssueAt | null>(null)
  const { ref: bodyRef, reveal: revealError } = useRevealFieldError()
  const [saving, setSaving] = useState(false)
  // อัปโหลดใบเสร็จยกเลิกได้จริง — ปิด modal/ออกจากหน้า = abort request ที่ค้าง (preship R3-026)
  const [uploading, setUploading] = useState(false)
  const uploadAbortRef = useRef<AbortController | null>(null)
  useEffect(() => {
    if (!open) uploadAbortRef.current?.abort()
  }, [open])
  useEffect(() => () => uploadAbortRef.current?.abort(), [])

  // mytester5 F5-01 — ค่าที่พัก: ถาม server ว่าแผนทีมของผู้รับเงิน ณ วันที่เกิดรายการบังคับใบเสร็จไหม (มติ Q7/Q7-R)
  // บังคับ ⇒ ซ่อน "ไม่มีใบเสร็จ" ตั้งแต่ก่อนกรอก · การบังคับจริงอยู่ที่ server ตอนบันทึก
  // ผลผูกกับคำถาม (ผู้รับ + วันที่) — เปลี่ยนผู้รับ/วันที่แล้วผลเก่าไม่ถูกใช้ระหว่างรอคำตอบใหม่
  const policyKey = `${payeeId}|${expenseDate}`
  const [hotelPolicy, setHotelPolicy] = useState<{ key: string; required: boolean } | null>(null)
  const hotelReceiptRequired = claimType === 'hotel' && hotelPolicy?.key === policyKey && hotelPolicy.required
  useEffect(() => {
    if (!open || claimType !== 'hotel') return
    let cancelled = false
    void (async () => {
      const query = new URLSearchParams()
      if (payeeId !== '') query.set('payeeId', payeeId)
      if (expenseDate !== '') query.set('expenseDate', expenseDate)
      const response = await callApi<{ hotelReceiptRequired: boolean }>(
        `/api/claims/hotel-receipt-policy${query.size === 0 ? '' : `?${query.toString()}`}`,
      )
      if (cancelled) return
      const required = response.data?.hotelReceiptRequired === true
      setHotelPolicy({ key: `${payeeId}|${expenseDate}`, required })
      if (required) setNoReceipt(false)
    })()
    return () => {
      cancelled = true
    }
  }, [open, claimType, payeeId, expenseDate])

  if (!open) return null

  function reset(): void {
    setAmount('')
    setExpenseDate('')
    setPayeeId('')
    setReceipt(null)
    setNoReceipt(false)
    setSubstituteLines([emptySubstituteLine('line-0')])
    setNote('')
    setErrors({})
  }

  async function submit(): Promise<void> {
    const substitute = noReceipt ? substituteDraftPayload(substituteLines) : null
    if (substitute !== null && substitute.error !== null) {
      setErrors({ substituteReceipt: substitute.error })
      setSubstituteAt(substitute.at)
      revealError()
      return
    }
    // ไม่มีใบเสร็จ ⇒ ยอดเบิก = ยอดรวมของรายการในใบรับรอง (เหมือนฟอร์มเบิกค่าที่พัก)
    const grossSatang = noReceipt
      ? substituteDraftTotalSatang(substituteLines)
      : (parseBahtInput(amount) ?? Number.NaN)
    // ตรวจรูปร่างก่อนอัปโหลด — path ใบเสร็จยังไม่มี จึงใช้ค่าแทนชั่วคราวให้ schema รู้ว่า "มีใบเสร็จ"
    const draft = {
      claimType,
      grossSatang,
      expenseDate,
      payeeId: payeeId === '' ? null : payeeId,
      receiptFileUrl: !noReceipt && receipt !== null ? 'pending-upload' : null,
      substituteReceipt: substitute === null ? null : substitute.payload,
      note: note.trim(),
    }
    const parsed = claimCreateSchema.safeParse(draft)
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error))
      setSubstituteAt(null)
      revealError()
      return
    }

    setErrors({})
    let receiptFileUrl: string | null = null
    if (!noReceipt && receipt !== null) {
      const controller = new AbortController()
      uploadAbortRef.current = controller
      setUploading(true)
      try {
        receiptFileUrl = await uploadExpenseReceipt(receipt, { signal: controller.signal })
      } catch (uploadError) {
        setErrors({
          receiptFileUrl: uploadError instanceof FieldUploadError ? uploadError.message : 'อัปโหลดใบเสร็จไม่สำเร็จ',
        })
        return
      } finally {
        uploadAbortRef.current = null
        setUploading(false)
      }
    }

    setSaving(true)
    try {
      // ส่ง payload ดิบ — `parsed.data.expenseDate` ถูก transform เป็น Date แล้ว (`dateOnlySchema`)
      const result = await callApi<{ substituteReceiptNumber: string | null }>(
        '/api/claims',
        jsonRequest('POST', { ...draft, receiptFileUrl }),
      )
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      const crt = result.data?.substituteReceiptNumber ?? null
      showToast({
        tone: 'success',
        title: 'สร้างรายการเบิกแล้ว',
        description:
          crt === null
            ? 'เข้าคิวอนุมัติขั้น 1 ทันที'
            : `ออกใบรับรองแทนใบเสร็จ ${crt} แล้ว — ดาวน์โหลดไปเซ็นแล้วอัปโหลดฉบับเซ็นก่อนอนุมัติ`,
      })
      reset()
      onCreated()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const substituteRowError = substituteLineRowError(errors.substituteReceipt, substituteAt, substituteLines)

  return (
    <Modal
      open
      onClose={onClose}
      title="สร้างรายการเบิกด้วยตนเอง (Manual Claim)"
      // ระหว่างอัปโหลดไม่ใช้ `loading` (ซึ่งล็อกทั้ง footer) — ให้ปุ่ม "ยกเลิกการอัปโหลด" กดได้ (R3-026)
      lockClose={uploading}
      footer={
        uploading ? (
          <>
            <Button variant="secondary" onClick={() => uploadAbortRef.current?.abort()}>
              ยกเลิกการอัปโหลด
            </Button>
            <Button disabled>กำลังอัปโหลดใบเสร็จ...</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              ยกเลิก
            </Button>
            <Button loading={saving} onClick={() => void submit()}>
              ส่งเข้าคิวอนุมัติ
            </Button>
          </>
        )
      }
    >
      {/* ล็อกช่องกรอกระหว่างอัปโหลด — ค่าที่ส่งคือค่าตอนกดส่ง */}
      <fieldset disabled={uploading} className="m-0 min-w-0 border-0 p-0">
      <div ref={bodyRef} className="space-y-4">
        <InlineAlert tone="warning">
          รายการที่สร้างที่นี่ <b>ไม่ผูกกับเคส</b> — ค่าน้ำมัน/เบี้ยเลี้ยง/ค่าคอมมิชชันของเคสระบบคิดให้เองจากงานภาคสนาม
          ห้ามกรอกซ้ำที่นี่
        </InlineAlert>

        {canRecordForOthers && <OnBehalfPayeeSelect value={payeeId} onChange={setPayeeId} error={errors.payeeId} />}

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
            disabled={noReceipt}
            value={noReceipt ? toBahtInput(substituteDraftTotalSatang(substituteLines)) : amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </Field>

        <Field label="วันที่เกิดรายการ" required error={errors.expenseDate}>
          <Input type="date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} />
        </Field>

        {hotelReceiptRequired ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
            {HOTEL_RECEIPT_REQUIRED_NOTE}
          </p>
        ) : (
          <NoReceiptToggle
            checked={noReceipt}
            onChange={(checked) => {
              setNoReceipt(checked)
              setErrors({})
            }}
            hint="เรียกใบเสร็จจากผู้รับเงินไม่ได้ — กรอกรายการแล้วระบบออกใบรับรองแทนใบเสร็จรับเงินให้เซ็น"
          />
        )}

        {noReceipt ? (
          // ห่อ div ⇒ ข้อความระดับทั้งตารางโฟกัสช่องในตาราง ไม่ใช่ช่องบนสุดของฟอร์ม
          <div>
            <NoReceiptLinesEditor
              lines={substituteLines}
              onChange={setSubstituteLines}
              defaultDate={expenseDate}
              variant={claimType === 'hotel' ? 'hotel' : 'general'}
              error={substituteRowError}
            />
            {errors.substituteReceipt !== undefined && substituteRowError === null && (
              <FieldErrorText>{errors.substituteReceipt}</FieldErrorText>
            )}
          </div>
        ) : (
          <Field
            label="แนบใบเสร็จ"
            required
            error={errors.receiptFileUrl}
            hint="รูปภาพหรือ PDF ไม่เกิน 10 MB — ระบบตรวจไฟล์ก่อนบันทึก"
          >
            <StagedFileInput
              fileName={receipt?.name ?? null}
              accept={EXPENSE_RECEIPT_ACCEPT}
              placeholder="แตะเพื่อเลือกไฟล์ใบเสร็จ"
              disabled={saving}
              onPick={(file) => {
                setReceipt(file)
                setErrors({})
              }}
              onClear={() => setReceipt(null)}
            />
          </Field>
        )}

        <Field label="รายละเอียด / หมายเหตุ" error={errors.note}>
          <Textarea
            rows={2}
            maxLength={500}
            placeholder="เช่น ค่าที่พักระหว่างติดตามทรัพย์ จ.เชียงราย คืนวันที่ 12"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
      </div>
      </fieldset>
    </Modal>
  )
}
