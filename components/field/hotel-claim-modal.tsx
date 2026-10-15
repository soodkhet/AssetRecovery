'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { IconFile } from '@/components/field/field-icons'
import { Button, Field, FieldErrorText, FormSubmitError, Input, Modal, MoneyInput, Select, Textarea, cn, fieldControlAria, fieldErrorClass, revealFirstFieldError, useToast } from '@/components/ui'
import { apiPath } from '@/lib/api/contract'
import { callApi, jsonRequest } from '@/lib/api/types'
import {
  HOTEL_CLAIM_NOTE_MAX_LENGTH,
  HOTEL_NIGHTS_MAX,
  HOTEL_NIGHTS_MIN,
  hotelClaimFormIssue,
  parseHotelNightsInput,
  type HotelClaimFormField,
} from '@/lib/field/hotel-claim'
import { checkExpenseReceiptCandidate, EXPENSE_RECEIPT_ACCEPT } from '@/lib/field/media-upload'
import type { FieldExpenseDto, FieldTeammateDto } from '@/lib/field/types'
import { toInputDate } from '@/lib/format/datetime'
import { parseBahtInput, toBahtInput } from '@/lib/format/money'
import { NoReceiptLinesEditor, NoReceiptToggle } from '@/components/substitute-receipts/no-receipt-lines'
import { StorageUploadError, uploadToStorage } from '@/lib/uploads/client'
import {
  emptySubstituteLine,
  followSubstituteLineDates,
  substituteDraftPayload,
  substituteDraftTotalSatang,
  substituteLineRowError,
  type SubstituteLineDraft,
  type SubstituteLineIssueAt,
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
  // id ผูก label ↔ ช่อง + aria-invalid/aria-describedby ผ่าน `<Field id>` (ตรวจซ้ำ staging SV5-R9-01)
  const fieldId = useId()
  const { showToast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [teammates, setTeammates] = useState<FieldTeammateDto[]>([])
  // ค่าเริ่มต้น = วันนี้ตามเวลาไทย (ส่วนใหญ่เบิกวันที่พักจริง) — เดิมว่างแล้วรายการ "ไม่มีใบเสร็จ" แถวแรกไม่มีวันที่ (preship R3-032)
  const [expenseDate, setExpenseDate] = useState(() => toInputDate(new Date()))
  const [amountBaht, setAmountBaht] = useState('')
  const [nightsText, setNightsText] = useState('1')
  const [sharedWithUserId, setSharedWithUserId] = useState('')
  const [note, setNote] = useState('')
  const [receipt, setReceipt] = useState<File | null>(null)
  // มติ PO U96 #14 — ค่าเริ่มต้นไม่ติ๊ก ให้ผู้เบิกเลือกเองตามใบเสร็จจริง
  const [receiptInCompanyName, setReceiptInCompanyName] = useState(false)
  // มติ PO U103 — ไม่มีใบเสร็จ ⇒ กรอกรายการ แล้วระบบออกใบรับรองแทนใบเสร็จ (ยอดเบิก = ยอดรวมรายการ)
  const [noReceipt, setNoReceipt] = useState(false)
  // known Q7/M2 (DO-02) — แผนของทีมบังคับใบเสร็จค่าที่พัก ⇒ ซ่อนตัวเลือก "ไม่มีใบเสร็จ" (server ตรวจซ้ำ)
  const [receiptRequired, setReceiptRequired] = useState(false)
  const [substituteLines, setSubstituteLines] = useState<SubstituteLineDraft[]>(() => [
    emptySubstituteLine('line-0', expenseDate),
  ])
  // ข้อผิดพลาด + ช่องที่ชี้ไป (`field: null` = ของทั้งฟอร์ม เช่นอัปโหลดล้ม) — แสดงที่ช่องนั้น + ใน footer ติดจอ
  // `lineAt` = แถว/ช่องที่ผิดในตารางรายการ "ไม่มีใบเสร็จ" ⇒ แสดงใต้แถวนั้น + โฟกัสช่องนั้น (ตรวจซ้ำ staging SV5-R4-01)
  const [error, setErrorState] = useState<
    { message: string; field: HotelClaimFormField | 'lines' | null; lineAt: SubstituteLineIssueAt | null } | null
  >(null)
  function setError(
    message: string | null,
    field: HotelClaimFormField | 'lines' | null = null,
    lineAt: SubstituteLineIssueAt | null = null,
  ): void {
    setErrorState(message === null ? null : { message, field, lineAt })
  }
  const bodyRef = useRef<HTMLDivElement>(null)
  // ตรวจซ้ำ staging SV5-R3-01: ข้อความเคยอยู่ท้ายฟอร์มนอกจอ ⇒ หลังกดส่งแล้วไม่ผ่าน เลื่อน+โฟกัสไปช่องที่ผิด
  const [revealTick, setRevealTick] = useState(0)
  useEffect(() => {
    if (revealTick > 0) revealFirstFieldError(bodyRef.current)
  }, [revealTick])
  // error รายช่องจาก server (เช่นหมายเหตุยาวเกิน) — เดิมเห็นแค่ "ข้อมูลไม่ครบ" ไม่รู้ว่าช่องไหน (preship R2-025)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  // อัปโหลดใบเสร็จ (อาจนานบนเน็ตภาคสนาม) — ยกเลิกได้ ไม่ล็อก modal ทั้งก้อนจนหมดเวลา (preship R3-026)
  const [uploading, setUploading] = useState(false)
  const uploadAbortRef = useRef<AbortController | null>(null)
  // ใบเสร็จที่อัปโหลดสำเร็จแล้ว — ส่งไม่ผ่านแล้วกดส่งใหม่ด้วยไฟล์เดิมไม่ต้องอัปโหลดซ้ำ (preship R3-033)
  const uploadedReceiptRef = useRef<{ file: File; path: string } | null>(null)

  useEffect(() => () => uploadAbortRef.current?.abort(), [])

  /** วันที่เข้าพักเปลี่ยน ⇒ แถว "ไม่มีใบเสร็จ" ที่ยังว่าง/ยังเป็นวันเดิมตามไปด้วย (ผู้ใช้แก้วันแถวเองแล้วไม่ทับ) */
  function changeExpenseDate(next: string): void {
    setSubstituteLines((lines) => followSubstituteLineDates(lines, expenseDate, next))
    setExpenseDate(next)
  }

  /** path ของใบเสร็จ — ไฟล์เดิมที่อัปโหลดสำเร็จแล้วใช้ path เดิม (R3-033) · ยกเลิก/หมดเวลา = throw ข้อความพร้อมแสดง */
  async function receiptPath(file: File): Promise<string> {
    const cached = uploadedReceiptRef.current
    if (cached !== null && cached.file === file) return cached.path
    const problem = checkExpenseReceiptCandidate({ name: file.name, type: file.type, size: file.size })
    if (problem !== null) throw new StorageUploadError(problem)
    const controller = new AbortController()
    uploadAbortRef.current = controller
    setUploading(true)
    try {
      const path = await uploadToStorage({ kind: 'expense_receipt' }, file, { signal: controller.signal })
      uploadedReceiptRef.current = { file, path }
      return path
    } finally {
      uploadAbortRef.current = null
      setUploading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const response = await callApi<{ items: FieldTeammateDto[]; hotelReceiptRequired?: boolean }>(
        apiPath('field.teammates'),
      )
      if (cancelled) return
      setTeammates(response.data?.items ?? [])
      if (response.data?.hotelReceiptRequired === true) {
        setReceiptRequired(true)
        setNoReceipt(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const substituteTotal = substituteDraftTotalSatang(substituteLines)

  async function submit(): Promise<void> {
    const effectiveAmountBaht = noReceipt ? toBahtInput(substituteTotal) : amountBaht
    const formIssue = hotelClaimFormIssue({
      expenseDate,
      amountBaht: effectiveAmountBaht,
      hasReceipt: noReceipt || receipt !== null,
      nightsText,
    })
    const amountSatang = parseBahtInput(effectiveAmountBaht)
    const hotelNights = parseHotelNightsInput(nightsText)
    const substitute = noReceipt ? substituteDraftPayload(substituteLines) : null
    const linesIssue =
      substitute !== null && substitute.error !== null
        ? { field: 'lines' as const, message: substitute.error, lineAt: substitute.at }
        : null
    // ไม่มีใบเสร็จ: ยอดเงิน = ยอดรวมรายการ (ช่องยอดถูกล็อก) ⇒ ยอดผิดชี้ไปที่รายการแทน
    const amountFromLines = noReceipt && formIssue !== null && formIssue.field === 'amount'
    const issue =
      linesIssue !== null && (formIssue === null || amountFromLines)
        ? linesIssue
        : amountFromLines
          ? { field: 'lines' as const, message: formIssue.message }
          : formIssue
    if (issue !== null) {
      setError(issue.message, issue.field, 'lineAt' in issue ? issue.lineAt : null)
      setRevealTick((tick) => tick + 1)
      return
    }
    if (amountSatang === null || Number.isNaN(amountSatang) || hotelNights === null) {
      setError('กรุณากรอกข้อมูลให้ครบ')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const receiptFileUrl = noReceipt || receipt === null ? null : await receiptPath(receipt)
      const response = await callApi<FieldExpenseDto>(
        apiPath('field.hotelClaim'),
        jsonRequest('POST', {
          expenseDate,
          amountSatang,
          hotelNights,
          receiptInCompanyName: noReceipt ? false : receiptInCompanyName,
          sharedWithUserId: sharedWithUserId === '' ? null : sharedWithUserId,
          receiptFileUrl,
          substituteReceipt: substitute === null ? null : substitute.payload,
          note: note.trim() === '' ? null : note.trim(),
        }),
      )
      if (response.error !== undefined || response.data === undefined) {
        const fields = response.error?.fields ?? {}
        setFieldErrors(fields)
        const fieldMessages = Object.values(fields)
        showToast({
          tone: 'error',
          title: response.error?.title ?? 'ส่งคำขอเบิกไม่สำเร็จ',
          description: fieldMessages.length > 0 ? fieldMessages.join(' · ') : response.error?.message,
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
      setError(uploadError instanceof StorageUploadError ? uploadError.message : 'อัปโหลดใบเสร็จไม่สำเร็จ')
    } finally {
      setSubmitting(false)
    }
  }

  /** ข้อความผิดพลาดของช่อง `field` — ใส่ `data-field-error` ให้ `revealFirstFieldError()` หาเจอ */
  function fieldError(field: HotelClaimFormField | 'lines'): string | undefined {
    return error !== null && error.field === field ? error.message : undefined
  }
  // ข้อผิดของแถวในตารางรายการ — แสดงใต้แถวนั้นแทนใต้ทั้งตาราง
  // ลบแถวที่ผิดไปแล้ว ⇒ กลับไปแสดงใต้ทั้งตาราง (ข้อความไม่หาย)
  const linesRowError =
    error !== null && error.field === 'lines' ? substituteLineRowError(error.message, error.lineAt, substituteLines) : null

  return (
    <Modal
      open
      onClose={onClose}
      title="เบิกค่าที่พัก"
      // ระหว่างอัปโหลดไม่ใช้ `loading` (ซึ่งล็อกทั้ง footer) — ให้ปุ่ม "ยกเลิกการอัปโหลด" กดได้ (R3-026)
      lockClose={uploading}
      footer={
        <div className="flex w-full flex-col gap-2">
        <FormSubmitError key={revealTick} message={error === null ? null : error.message} />
        {uploading ? (
          <div className="flex w-full gap-2">
            <Button variant="secondary" onClick={() => uploadAbortRef.current?.abort()} className="justify-center py-3">
              ยกเลิกการอัปโหลด
            </Button>
            <Button disabled className="flex-1 justify-center py-3">
              กำลังอัปโหลดใบเสร็จ...
            </Button>
          </div>
        ) : (
          <Button onClick={() => void submit()} loading={submitting} className="w-full justify-center py-3">
            {submitting ? 'กำลังส่งคำขอ...' : 'ส่งคำขอเบิก'}
          </Button>
        )}
        </div>
      }
    >
      {/* ล็อกช่องกรอกระหว่างอัปโหลด — ค่าที่ส่งคือค่าตอนกดส่ง แก้ระหว่างนี้จะไม่ถูกส่ง */}
      <fieldset disabled={uploading} className="m-0 min-w-0 border-0 p-0">
      <div ref={bodyRef} className="space-y-3">
        <Field id={`${fieldId}-expense-date`} label="วันที่เข้าพัก" required error={fieldError('expenseDate')}>
          <Input id={`${fieldId}-expense-date`} type="date" value={expenseDate} onChange={(event) => changeExpenseDate(event.target.value)} />
        </Field>

        <Field id={`${fieldId}-nights-text`} label="จำนวนคืน" error={fieldError('nights')} hint="ใบเสร็จใบเดียวครอบหลายคืนได้ — ไม่กรอก = 1 คืน">
          <Input
            id={`${fieldId}-nights-text`}
            type="number"
            inputMode="numeric"
            min={HOTEL_NIGHTS_MIN}
            max={HOTEL_NIGHTS_MAX}
            step={1}
            value={nightsText}
            onChange={(event) => setNightsText(event.target.value)}
          />
        </Field>

        <Field id={`${fieldId}-amount-baht`} label="จำนวนเงิน (บาท)" required error={fieldError('amount')} hint={noReceipt ? 'ไม่มีใบเสร็จ — ใช้ยอดรวมของรายการด้านล่าง' : undefined}>
          <MoneyInput
            id={`${fieldId}-amount-baht`}
            placeholder="0.00"
            disabled={noReceipt}
            value={noReceipt ? toBahtInput(substituteTotal) : amountBaht}
            onChange={(event) => setAmountBaht(event.target.value)}
          />
        </Field>

        <Field id={`${fieldId}-shared-with-user-id`} label="พักร่วมกับ (ถ้ามี — เลือกได้จากคนในทีมเท่านั้น)">
          <Select id={`${fieldId}-shared-with-user-id`} value={sharedWithUserId} onChange={(event) => setSharedWithUserId(event.target.value)}>
            <option value="">— พักคนเดียว —</option>
            {teammates.map((teammate) => (
              <option key={teammate.id} value={teammate.id}>
                {teammate.fullName}
              </option>
            ))}
          </Select>
        </Field>

        {receiptRequired ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
            แผนค่าตอบแทนของทีมบังคับแนบใบเสร็จค่าที่พัก — ใช้ใบรับรองแทนใบเสร็จไม่ได้
          </p>
        ) : (
          <NoReceiptToggle
            checked={noReceipt}
            onChange={(checked) => {
              setNoReceipt(checked)
              setError(null)
            }}
            hint="เรียกใบเสร็จจากผู้รับเงินไม่ได้ — กรอกรายการแล้วระบบออกใบรับรองแทนใบเสร็จรับเงินให้เซ็น"
          />
        )}

        {noReceipt ? (
          <div>
            <NoReceiptLinesEditor
              lines={substituteLines}
              onChange={setSubstituteLines}
              defaultDate={expenseDate}
              variant="hotel"
              error={linesRowError}
            />
            {fieldError('lines') !== undefined && linesRowError === null && (
              <FieldErrorText>{fieldError('lines')}</FieldErrorText>
            )}
          </div>
        ) : (
        <Field id={`${fieldId}-receipt`} label="แนบใบเสร็จ" required error={fieldError('receipt')}>
          <button
            id={`${fieldId}-receipt`}
            type="button"
            onClick={() => fileRef.current?.click()}
            {...fieldControlAria(`${fieldId}-receipt`, { error: fieldError('receipt'), describedBy: `${fieldId}-receipt-file-name` })}
            className={cn(
              'focus-ring flex w-full flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-slate-300 py-6 text-slate-400',
              fieldErrorClass(fieldError('receipt')),
            )}
          >
            <IconFile className="h-6 w-6" />
            <span id={`${fieldId}-receipt-file-name`} className="text-xs font-semibold">
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

        {/* mytester5 D-OUT5-01 — ใช้ใบรับรองแทนใบเสร็จ = ไม่มีใบเสร็จจริง ⇒ ไม่มีช่อง "ใบเสร็จออกในนามบริษัท" */}
        {!noReceipt && <ReceiptInCompanyNameCheckbox checked={receiptInCompanyName} onChange={setReceiptInCompanyName} />}

        <Field id={`${fieldId}-note`} label="หมายเหตุ (ถ้ามี)" error={fieldErrors.note}>
          <Textarea
            id={`${fieldId}-note`}
            rows={2}
            value={note}
            maxLength={HOTEL_CLAIM_NOTE_MAX_LENGTH}
            onChange={(event) => {
              setNote(event.target.value)
              setFieldErrors(({ note: _cleared, ...rest }) => rest)
            }}
          />
        </Field>

        <p className="text-[13px] text-slate-500">
          ระบบจะจับคู่กับเคสที่มีกำหนดวันอยู่ในช่วงวันที่พักนี้โดยอัตโนมัติ เพื่อใช้ตรวจสอบเท่านั้น
        </p>
      </div>
      </fieldset>
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
    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-700 pointer-coarse:min-h-11">
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
