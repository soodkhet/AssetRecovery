'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { IconFile } from '@/components/field/field-icons'
import { ReceiptInCompanyNameCheckbox } from '@/components/field/hotel-claim-modal'
import { NoReceiptLinesEditor } from '@/components/substitute-receipts/no-receipt-lines'
import { Button, Field, FieldErrorText, FormSubmitError, InlineAlert, Input, Modal, Textarea, cn, fieldControlAria, fieldErrorClass, revealFirstFieldError, useToast } from '@/components/ui'
import { REASON_MAX } from '@/lib/api/validation'
import { apiPath } from '@/lib/api/contract'
import { callApi, jsonRequest } from '@/lib/api/types'
import { EXPENSE_TYPE_ICON, expenseTypeLabel, isSeparateExpense } from '@/lib/field/expense-ui'
import { HOTEL_NIGHTS_MAX, HOTEL_NIGHTS_MIN, hotelNightsCapText, parseHotelNightsInput } from '@/lib/field/hotel-claim'
import { EXPENSE_RECEIPT_ACCEPT } from '@/lib/field/media-upload'
import {
  defaultResubmitEvidenceMode,
  hasRealReceiptFile,
  resubmitEvidenceModes,
  resubmitFormIssue,
  resubmitReceiptFileRequired,
  resubmitReceiptPickerText,
  type ResubmitEvidenceMode,
  type ResubmitFormField,
} from '@/lib/field/resubmit-evidence'
import type { FieldExpenseDto } from '@/lib/field/types'
import { FieldUploadError, uploadExpenseReceipt } from '@/lib/field/upload-client'
import {
  substituteDraftPayload,
  substituteDraftTotalSatang,
  substituteLineRowError,
  substituteLinesToDrafts,
  type SubstituteLineDraft,
  type SubstituteLineIssueAt,
} from '@/lib/substitute-receipts/form'
import { isSubstituteReceiptRefActive } from '@/lib/substitute-receipts/substitute-receipt'
import type { SubstituteReceiptDetailDto } from '@/lib/substitute-receipts/types'
import { fmtDate, toInputDate } from '@/lib/format/datetime'
import { fmtSatangSymbol, parseBahtInput, toBahtInput } from '@/lib/format/money'

/**
 * แก้ไขรายการเบิกที่ถูกตีกลับแล้วส่งใหม่ (`41` §6.6 · §8 `resubmit_expense`)
 *
 * - **เจ้าของรายการเท่านั้น** ที่ทำได้ (BE ตรวจซ้ำจาก payee ของผู้เรียก — หัวหน้าทีมแก้แทนไม่ได้)
 * - รายการกลุ่ม "ผูกกับเคส" ระบบคำนวณยอดให้ ⇒ แก้ได้แค่หมายเหตุ (ช่องยอด/ใบเสร็จซ่อนไว้)
 * - ค่าที่พักแก้ "จำนวนคืน" ได้ด้วย (มติ PO O50) — BE ตรวจเพดานด้วยจำนวนคืนหลังแก้
 * - ส่งใหม่แล้วกลับเข้า `pending_approval` — **ไม่ผ่านขั้นรอคลังซ้ำ** (`41` §6.6)
 * - มติ PO 14/10/2569 SV5-R2-01 (แนวทาง ก): รายการที่เคยใช้ใบรับรองแทนใบเสร็จเลือกหลักฐานในฟอร์มนี้ได้เลย — ใช้ใบเดิม /
 *   ออกใบใหม่ตามยอด (ค่าเริ่มต้นเมื่อใบเดิมถูกยกเลิก) / แนบใบเสร็จจริง · ใบที่ใช้งานอยู่ถูกยกเลิกพร้อมการส่ง (เหตุผลบังคับ)
 *   server ทำทั้งหมดในทรานแซกชันเดียว ⇒ ไม่มีช่วงที่ใบเบิกอยู่ในคิวโดยไม่มีหลักฐาน
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
  // id ผูก label ↔ ช่อง + aria-invalid/aria-describedby ผ่าน `<Field id>` (ตรวจซ้ำ staging SV5-R9-01)
  const fieldId = useId()
  const { showToast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const editable = isSeparateExpense(expense)
  const isHotel = expense.expenseType === 'hotel'
  // ใบรับรองแทนใบเสร็จที่แสดงบนรายการ (ใบที่ใช้งานอยู่ หรือใบที่ยกเลิกล่าสุด)
  const substitute = expense.substituteReceipt
  const activeSubstitute = isSubstituteReceiptRefActive(substitute) ? substitute : null
  // มติ PO 14/10/2569 SV5-R2-01 (แนวทาง ก) — เลือกหลักฐานในฟอร์มนี้: ใช้ใบรับรองเดิม · ออกใบรับรองใหม่ตามยอด · แนบใบเสร็จจริง
  const evidenceState = {
    hasActiveSubstitute: activeSubstitute !== null,
    hasSubstituteHistory: substitute !== null,
    hasRealReceipt: hasRealReceiptFile({ receiptFileUrl: expense.receiptFileUrl, hasActiveSubstitute: activeSubstitute !== null }),
  }
  const evidenceModes = editable ? resubmitEvidenceModes(evidenceState) : []
  const [mode, setMode] = useState<ResubmitEvidenceMode>(() => defaultResubmitEvidenceMode(evidenceState))
  const [lines, setLines] = useState<SubstituteLineDraft[]>([])
  // เปิดฟอร์มมาที่ "ออกใบใหม่" (ใบเดิมถูกยกเลิกแล้ว) ⇒ เริ่มโหลดรายการทันที
  const initialLoad = editable && substitute !== null && defaultResubmitEvidenceMode(evidenceState) === 'new_substitute'
  const [loadingLines, setLoadingLines] = useState(initialLoad)
  const linesRequestedRef = useRef(false)
  const [cancelReason, setCancelReason] = useState('')
  const lineDate = toInputDate(expense.expenseDate)
  const newSubstitute = editable && mode === 'new_substitute'
  const keepSubstitute = mode === 'keep_substitute' && activeSubstitute !== null
  // ยกเลิกใบที่ใช้งานอยู่ในขั้นตอนเดียวกัน (เหตุผลบังคับ) เมื่อเลือกหลักฐานใหม่แทน
  const cancelsActive = activeSubstitute !== null && editable && mode !== 'keep_substitute'
  // mytester5 รีวิว D-OUT5-01 — ใช้ใบรับรองแทนใบเสร็จ = ไม่มีใบเสร็จจริง ⇒ ไม่มีช่อง "ใบเสร็จออกในนามบริษัท"
  const showReceiptName = isHotel && mode === 'receipt'
  // ค่าที่พัก + ใบรับรอง: ยอดเบิก = ยอดรวมใบ ⇒ ใช้ใบเดิมล็อกช่องยอด · ออกใบใหม่ใช้ยอดรวมรายการ (BE ตรวจซ้ำ)
  const amountLocked = isHotel && (keepSubstitute || newSubstitute)
  const linesTotal = substituteDraftTotalSatang(lines)
  const receiptRequired = resubmitReceiptFileRequired({ ...evidenceState, mode, isHotel })
  const [nightsText, setNightsText] = useState(() => String(expense.hotelNights))
  const [receiptInCompanyName, setReceiptInCompanyName] = useState(() => expense.receiptInCompanyName)
  const [amountBaht, setAmountBaht] = useState(() => toBahtInput(expense.grossSatang))
  const [note, setNote] = useState('')
  const [receipt, setReceipt] = useState<File | null>(null)
  // ข้อผิดพลาด + ช่องที่ชี้ไป (`field: null` = ของทั้งฟอร์ม เช่นอัปโหลดล้ม) — แสดงที่ช่องนั้น + ใน footer ติดจอ
  // `lineAt` = แถว/ช่องที่ผิดในตารางรายการของใบรับรองใหม่ ⇒ แสดงใต้แถวนั้น + โฟกัสช่องนั้น (ตรวจซ้ำ staging SV5-R4-01)
  const [error, setErrorState] = useState<
    { message: string; field: ResubmitFormField | null; lineAt: SubstituteLineIssueAt | null } | null
  >(null)
  function setError(
    message: string | null,
    field: ResubmitFormField | null = null,
    lineAt: SubstituteLineIssueAt | null = null,
  ): void {
    setErrorState(message === null ? null : { message, field, lineAt })
  }
  const bodyRef = useRef<HTMLDivElement>(null)
  // ตรวจซ้ำ staging SV5-R3-01: ข้อความเคยอยู่ท้ายฟอร์มนอกจอ กดส่งแล้วเหมือนไม่มีอะไรเกิดขึ้น ⇒ หลังกดส่งแล้วไม่ผ่าน
  // เลื่อน+โฟกัสไปช่องที่ผิด (นับครั้งที่กด ไม่ผูกกับข้อความตรง ๆ — แบบเดียวกับ team-form-modal)
  const [revealTick, setRevealTick] = useState(0)
  useEffect(() => {
    if (revealTick > 0) revealFirstFieldError(bodyRef.current)
  }, [revealTick])
  const [submitting, setSubmitting] = useState(false)
  // อัปโหลดใบเสร็จใหม่ยกเลิกได้จริง — ปิด modal ระหว่างอัปโหลด = abort request ที่ค้าง (preship R3-026)
  const [uploading, setUploading] = useState(false)
  const uploadAbortRef = useRef<AbortController | null>(null)
  const unmountedRef = useRef(false)

  useEffect(() => () => uploadAbortRef.current?.abort(), [])

  // ตั้งต้นรายการของใบใหม่จากใบเดิม ปรับยอดรวมให้เท่ายอดเบิกปัจจุบัน — โหลดครั้งแรกที่เลือกออกใบใหม่
  // (setState เฉพาะใน callback ของ promise — สถานะ "กำลังโหลด" ตั้งโดยผู้เรียก)
  const substituteId = substitute?.id ?? null
  // ค่าที่พัก: ยอดใบ = ยอดเบิก ⇒ ตั้งต้นยอดรวม = ยอดเบิกปัจจุบัน · ชนิดอื่นใบครอบเฉพาะส่วนที่ไม่มีใบเสร็จ ⇒ ตั้งต้นตามใบเดิม
  const targetTotalSatang = isHotel ? expense.grossSatang : undefined
  const fetchLines = useCallback((): void => {
    if (substituteId === null || linesRequestedRef.current) return
    linesRequestedRef.current = true
    void callApi<SubstituteReceiptDetailDto>(`/api/substitute-receipts/${substituteId}`)
      .then((result) => {
        if (unmountedRef.current) return
        setLines(substituteLinesToDrafts(result.data?.lines ?? [], lineDate, targetTotalSatang))
        if (result.error !== undefined) setErrorState({ message: 'ดึงรายการจากใบเดิมไม่ได้ — กรอกรายการใหม่', field: null, lineAt: null })
      })
      .catch(() => {
        if (unmountedRef.current) return
        setLines(substituteLinesToDrafts([], lineDate, targetTotalSatang))
        setErrorState({ message: 'ดึงรายการจากใบเดิมไม่ได้ — กรอกรายการใหม่', field: null, lineAt: null })
      })
      .finally(() => {
        if (!unmountedRef.current) setLoadingLines(false)
      })
  }, [substituteId, lineDate, targetTotalSatang])

  useEffect(() => {
    unmountedRef.current = false
    if (initialLoad) fetchLines()
    return () => {
      unmountedRef.current = true
    }
  }, [initialLoad, fetchLines])

  function chooseMode(next: ResubmitEvidenceMode): void {
    setMode(next)
    setError(null)
    if (next === 'new_substitute' && !linesRequestedRef.current && substituteId !== null) {
      setLoadingLines(true)
      fetchLines()
    }
  }

  async function uploadReceipt(file: File): Promise<string> {
    const controller = new AbortController()
    uploadAbortRef.current = controller
    setUploading(true)
    try {
      return await uploadExpenseReceipt(file, { signal: controller.signal })
    } finally {
      uploadAbortRef.current = null
      setUploading(false)
    }
  }

  async function submit(): Promise<void> {
    const draft = newSubstitute ? substituteDraftPayload(lines) : null
    const issue = resubmitFormIssue({
      amountEditable: editable && !amountLocked,
      amountBaht,
      isHotel,
      nightsText,
      newSubstitute,
      linesError: draft === null || draft.error === null ? null : { message: draft.error, at: draft.at },
      linesTotalSatang: linesTotal,
      cancelsActive,
      cancelReason,
      receiptMissing: receiptRequired && receipt === null,
      note,
    })
    if (issue !== null) {
      setError(issue.message, issue.field, issue.lineAt ?? null)
      setRevealTick((tick) => tick + 1)
      return
    }
    // ผ่าน `resubmitFormIssue()` แล้ว ⇒ ค่าด้านล่าง parse ได้แน่นอน
    const substituteLines = draft === null ? null : draft.payload
    let amountSatang: number | undefined
    if (editable && newSubstitute && isHotel) {
      // ค่าที่พัก: ยอดเบิก = ยอดรวมรายการของใบรับรองใหม่
      amountSatang = linesTotal
    } else if (editable && !amountLocked) {
      amountSatang = parseBahtInput(amountBaht) ?? undefined
    }
    const hotelNights = isHotel ? (parseHotelNightsInput(nightsText) ?? undefined) : undefined

    setSubmitting(true)
    setError(null)
    try {
      const receiptFileUrl = mode !== 'receipt' || receipt === null ? undefined : await uploadReceipt(receipt)
      const response = await callApi<FieldExpenseDto>(
        apiPath('field.resubmitExpense', { id: expense.id }),
        jsonRequest('POST', {
          ...(amountSatang === undefined ? {} : { amountSatang }),
          ...(hotelNights === undefined ? {} : { hotelNights }),
          ...(showReceiptName ? { receiptInCompanyName } : {}),
          ...(receiptFileUrl === undefined ? {} : { receiptFileUrl }),
          ...(substituteLines === null ? {} : { substituteReceipt: substituteLines }),
          ...(cancelsActive ? { cancelSubstituteReason: cancelReason.trim() } : {}),
          note: note.trim(),
        }),
      )
      if (response.error !== undefined) {
        showToast({ tone: 'error', title: response.error.title, description: response.error.message })
        return
      }
      const issued = substituteLines !== null && response.data !== undefined ? response.data.substituteReceipt : null
      showToast({
        tone: 'success',
        title: 'ส่งรายการเบิกกลับเข้าคิวอนุมัติแล้ว',
        ...(issued !== null
          ? { description: `ออกใบรับรอง ${issued.receiptNumber} แล้ว — ดาวน์โหลดไปเซ็นแล้วอัปโหลดฉบับเซ็นจากรายการเบิก` }
          : {}),
      })
      onDone()
    } catch (uploadError) {
      setError(uploadError instanceof FieldUploadError ? uploadError.message : 'อัปโหลดใบเสร็จไม่สำเร็จ')
    } finally {
      setSubmitting(false)
    }
  }

  /** ข้อความผิดพลาดของช่อง `field` (ข้อความเดียวกับใน footer) — ใส่ `data-field-error` ให้ `revealFirstFieldError()` หาเจอ */
  function fieldError(field: ResubmitFormField): string | undefined {
    return error !== null && error.field === field ? error.message : undefined
  }
  // ข้อผิดของแถวในตารางรายการ — แสดงใต้แถวนั้นแทนใต้ทั้งตาราง
  // ลบแถวที่ผิดไปแล้ว ⇒ กลับไปแสดงใต้ทั้งตาราง (ข้อความไม่หาย)
  const linesRowError =
    error !== null && error.field === 'lines' ? substituteLineRowError(error.message, error.lineAt, lines) : null

  return (
    <Modal
      open
      onClose={onClose}
      title="แก้ไขรายการเบิกที่ถูกตีกลับ"
      description={`${EXPENSE_TYPE_ICON[expense.expenseType]} ${expenseTypeLabel(expense.expenseType)} · ${fmtDate(expense.expenseDate)} · ${fmtSatangSymbol(expense.grossSatang)}`}
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
          <Button
            onClick={() => void submit()}
            loading={submitting}
            disabled={loadingLines}
            className="w-full justify-center py-3"
          >
            {submitting ? 'กำลังส่ง...' : 'ส่งกลับเข้าคิวอนุมัติ'}
          </Button>
        )}
        </div>
      }
    >
      {/* ล็อกช่องกรอกระหว่างอัปโหลด — ค่าที่ส่งคือค่าตอนกดส่ง */}
      <fieldset disabled={uploading} className="m-0 min-w-0 border-0 p-0">
      <div ref={bodyRef} className="space-y-3">
        {expense.rejectReason !== null && (
          <InlineAlert tone="warning" title="เหตุผลที่ถูกตีกลับ">
            {expense.rejectReason}
          </InlineAlert>
        )}
        {/* หมายเหตุตอนเบิกคงเดิม — ข้อความชี้แจงด้านล่างเก็บแยก ไม่เขียนทับ (UAT BUG-098) */}
        {expense.note !== null && <div className="text-xs text-slate-500">หมายเหตุตอนเบิก: {expense.note}</div>}

        {editable ? (
          <>
            {amountLocked ? (
              <Field label="จำนวนเงิน (บาท)">
                <p className="rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-700">
                  {fmtSatangSymbol(newSubstitute ? linesTotal : expense.grossSatang)}
                </p>
                {newSubstitute ? (
                  <p className="mt-1 text-xs text-slate-500">ยอดเบิกค่าที่พัก = ยอดรวมรายการของใบรับรองใบใหม่ด้านล่าง</p>
                ) : (
                  activeSubstitute !== null &&
                  activeSubstitute.totalSatang !== expense.grossSatang && (
                    <p className="mt-1 text-xs text-amber-700">
                      ยอดเบิกไม่ตรงยอดใบรับรอง ({fmtSatangSymbol(activeSubstitute.totalSatang)}) — เลือก “ออกใบรับรองใหม่ตามยอด”
                      ด้านล่างเพื่อแก้ยอดและออกใบใหม่ในการส่งครั้งนี้
                    </p>
                  )
                )}
              </Field>
            ) : (
              <Field
                id={`${fieldId}-amount-baht`}
                label="จำนวนเงิน (บาท)"
                required
                error={fieldError('amount')}
                hint={
                  newSubstitute
                    ? `ต้องไม่น้อยกว่ายอดรวมรายการของใบรับรองใบใหม่ (${fmtSatangSymbol(linesTotal)})`
                    : keepSubstitute
                      ? `ต้องไม่น้อยกว่ายอดใบรับรองแทนใบเสร็จ ${fmtSatangSymbol(activeSubstitute.totalSatang)}`
                      : undefined
                }
              >
                <Input
                  id={`${fieldId}-amount-baht`}
                  numeric
                  inputMode="decimal"
                  value={amountBaht}
                  onChange={(event) => setAmountBaht(event.target.value)}
                />
              </Field>
            )}

            {isHotel && (
              <Field
                id={`${fieldId}-nights-text`}
                label="จำนวนคืน"
                error={fieldError('nights')}
                hint={`เดิม ${hotelNightsCapText(expense.hotelNights, expense.hotelMaxPerNightSatang)} — ไม่กรอก = 1 คืน`}
              >
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
            )}

            {evidenceModes.length > 0 && substitute !== null && (
              <Field id={`${fieldId}-evidence`} group label="หลักฐานรายจ่าย" required>
                <div id={`${fieldId}-evidence`} role="radiogroup" aria-required aria-labelledby={`${fieldId}-evidence-label`} className="space-y-2">
                  {evidenceModes.map((option) => (
                    <label
                      key={option}
                      className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-700 pointer-coarse:min-h-11"
                    >
                      <input
                        type="radio"
                        name={`resubmit-evidence-${expense.id}`}
                        className="focus-ring mt-0.5 h-5 w-5 shrink-0"
                        checked={mode === option}
                        onChange={() => chooseMode(option)}
                      />
                      <span>
                        <span className="font-semibold">
                          {option === 'keep_substitute'
                            ? 'ใช้ใบรับรองแทนใบเสร็จเดิม'
                            : option === 'new_substitute'
                              ? 'ออกใบรับรองแทนใบเสร็จใหม่ตามยอดที่กรอก'
                              : 'แนบใบเสร็จจริง'}
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {option === 'keep_substitute' ? (
                            <>
                              เลขที่ <span className="font-mono">{substitute.receiptNumber}</span> ยอด{' '}
                              {fmtSatangSymbol(substitute.totalSatang)}
                              {isHotel ? ' — ยอดเบิกต้องเท่ายอดใบ' : ''}
                            </>
                          ) : option === 'new_substitute' ? (
                            activeSubstitute !== null ? (
                              <>
                                ระบบยกเลิกใบ <span className="font-mono">{activeSubstitute.receiptNumber}</span> แล้วออกใบใหม่ให้พร้อมการส่งครั้งนี้
                                — จากนั้นดาวน์โหลดไปเซ็นแล้วอัปโหลดฉบับเซ็นจากรายการเบิก
                              </>
                            ) : (
                              <>
                                ออกใบใหม่แทนใบ <span className="font-mono">{substitute.receiptNumber}</span> ที่ยกเลิกแล้ว พร้อมการส่งครั้งนี้
                                — จากนั้นดาวน์โหลดไปเซ็นแล้วอัปโหลดฉบับเซ็นจากรายการเบิก
                              </>
                            )
                          ) : activeSubstitute !== null ? (
                            <>
                              ระบบยกเลิกใบ <span className="font-mono">{activeSubstitute.receiptNumber}</span> พร้อมการส่งครั้งนี้
                            </>
                          ) : (
                            'แนบรูปหรือ PDF ของใบเสร็จที่ได้รับจริง'
                          )}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </Field>
            )}

            {newSubstitute &&
              (loadingLines ? (
                <p className="text-xs text-slate-500">กำลังดึงรายการจากใบเดิม...</p>
              ) : (
                <div>
                  <NoReceiptLinesEditor
                    lines={lines}
                    onChange={setLines}
                    defaultDate={lineDate}
                    variant={isHotel ? 'hotel' : 'general'}
                    error={linesRowError}
                  />
                  {fieldError('lines') !== undefined && linesRowError === null && (
                    <FieldErrorText>{fieldError('lines')}</FieldErrorText>
                  )}
                </div>
              ))}

            {cancelsActive && activeSubstitute !== null && (
              <Field
                id={`${fieldId}-cancel-reason`}
                label={`เหตุผลการยกเลิกใบรับรอง ${activeSubstitute.receiptNumber}`}
                required
                error={fieldError('cancelReason')}
              >
                <Textarea
                  id={`${fieldId}-cancel-reason`}
                  rows={2}
                  maxLength={REASON_MAX}
                  value={cancelReason}
                  onChange={(event) => setCancelReason(event.target.value)}
                  placeholder="เช่น แก้ยอดตามที่ผู้อนุมัติแจ้ง / ได้ใบเสร็จจริงมาแล้ว"
                />
              </Field>
            )}

            {mode === 'receipt' && (
              <Field
                id={`${fieldId}-receipt`}
                label={evidenceState.hasRealReceipt ? 'แนบใบเสร็จใหม่ (ถ้าต้องเปลี่ยน)' : 'แนบใบเสร็จ'}
                required={receiptRequired}
                error={fieldError('receipt')}
              >
                <button
                  id={`${fieldId}-receipt`}
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  {...fieldControlAria(`${fieldId}-receipt`, { error: fieldError('receipt'), describedBy: `${fieldId}-receipt-file-name` })}
                  className={cn(
                    'focus-ring flex w-full flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-slate-300 py-5 text-slate-400',
                    fieldErrorClass(fieldError('receipt')),
                  )}
                >
                  <IconFile className="h-6 w-6" />
                  <span id={`${fieldId}-receipt-file-name`} className="text-xs font-semibold">
                    {resubmitReceiptPickerText({
                      hasExistingReceipt: evidenceState.hasRealReceipt,
                      fileName: receipt === null ? null : receipt.name,
                    })}
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
            )}

            {showReceiptName && (
              <ReceiptInCompanyNameCheckbox checked={receiptInCompanyName} onChange={setReceiptInCompanyName} />
            )}
          </>
        ) : (
          <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
            รายการนี้ระบบคำนวณยอดให้จากแผนค่าตอบแทน — แก้ยอดเองไม่ได้ ระบุสิ่งที่ชี้แจงในหมายเหตุแทน
          </p>
        )}

        <Field id={`${fieldId}-note`} label="สิ่งที่แก้ไข / ชี้แจง" required error={fieldError('note')}>
          <Textarea id={`${fieldId}-note`} rows={3} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
      </div>
      </fieldset>
    </Modal>
  )
}
