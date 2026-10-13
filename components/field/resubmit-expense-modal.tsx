'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { IconFile } from '@/components/field/field-icons'
import { ReceiptInCompanyNameCheckbox } from '@/components/field/hotel-claim-modal'
import { NoReceiptLinesEditor } from '@/components/substitute-receipts/no-receipt-lines'
import { Button, Field, InlineAlert, Input, Modal, Textarea, useToast } from '@/components/ui'
import { REASON_MAX } from '@/lib/api/validation'
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
import {
  defaultResubmitEvidenceMode,
  hasRealReceiptFile,
  resubmitEvidenceModes,
  resubmitReceiptFileRequired,
  resubmitReceiptPickerText,
  type ResubmitEvidenceMode,
} from '@/lib/field/resubmit-evidence'
import type { FieldExpenseDto } from '@/lib/field/types'
import { FieldUploadError, uploadExpenseReceipt } from '@/lib/field/upload-client'
import {
  substituteDraftPayload,
  substituteDraftTotalSatang,
  substituteLinesToDrafts,
  type SubstituteLineDraft,
} from '@/lib/substitute-receipts/form'
import {
  isSubstituteReceiptRefActive,
  SUBSTITUTE_RECEIPT_CANCEL_REASON_MIN,
} from '@/lib/substitute-receipts/substitute-receipt'
import type { SubstituteReceiptDetailDto } from '@/lib/substitute-receipts/types'
import { fmtDate, toInputDate } from '@/lib/format/datetime'
import { bahtInputError, fmtSatangSymbol, parseBahtInput, toBahtInput } from '@/lib/format/money'

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
  const [error, setError] = useState<string | null>(null)
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
        if (result.error !== undefined) setError('ดึงรายการจากใบเดิมไม่ได้ — กรอกรายการใหม่')
      })
      .catch(() => {
        if (unmountedRef.current) return
        setLines(substituteLinesToDrafts([], lineDate, targetTotalSatang))
        setError('ดึงรายการจากใบเดิมไม่ได้ — กรอกรายการใหม่')
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
    if (note.trim() === '') {
      setError('ต้องระบุสิ่งที่แก้ไขให้ผู้อนุมัติทราบ')
      return
    }

    let substituteLines: ReturnType<typeof substituteDraftPayload>['payload'] = null
    if (newSubstitute) {
      const draft = substituteDraftPayload(lines)
      if (draft.payload === null) {
        setError(draft.error)
        return
      }
      substituteLines = draft.payload
    }

    let amountSatang: number | undefined
    if (editable && newSubstitute && isHotel) {
      // ค่าที่พัก: ยอดเบิก = ยอดรวมรายการของใบรับรองใหม่
      amountSatang = linesTotal
    } else if (editable && !amountLocked) {
      const parsed = parseBahtInput(amountBaht)
      if (parsed === null || Number.isNaN(parsed) || parsed <= 0) {
        setError(bahtInputError(amountBaht, 'จำนวนเงิน') ?? 'จำนวนเงินต้องมากกว่า 0')
        return
      }
      if (newSubstitute && linesTotal > parsed) {
        setError(`ยอดรวมรายการของใบรับรอง (${fmtSatangSymbol(linesTotal)}) ต้องไม่เกินจำนวนเงินที่เบิก`)
        return
      }
      amountSatang = parsed
    }

    if (receiptRequired && receipt === null) {
      setError('แนบไฟล์ใบเสร็จก่อนส่ง')
      return
    }
    if (cancelsActive && cancelReason.trim().length < SUBSTITUTE_RECEIPT_CANCEL_REASON_MIN) {
      setError(`กรอกเหตุผลการยกเลิกใบรับรองเดิมอย่างน้อย ${SUBSTITUTE_RECEIPT_CANCEL_REASON_MIN} ตัวอักษร`)
      return
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

  return (
    <Modal
      open
      onClose={onClose}
      title="แก้ไขรายการเบิกที่ถูกตีกลับ"
      description={`${EXPENSE_TYPE_ICON[expense.expenseType]} ${expenseTypeLabel(expense.expenseType)} · ${fmtDate(expense.expenseDate)} · ${fmtSatangSymbol(expense.grossSatang)}`}
      // ระหว่างอัปโหลดไม่ใช้ `loading` (ซึ่งล็อกทั้ง footer) — ให้ปุ่ม "ยกเลิกการอัปโหลด" กดได้ (R3-026)
      lockClose={uploading}
      footer={
        uploading ? (
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
        )
      }
    >
      {/* ล็อกช่องกรอกระหว่างอัปโหลด — ค่าที่ส่งคือค่าตอนกดส่ง */}
      <fieldset disabled={uploading} className="m-0 min-w-0 border-0 p-0">
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
                label="จำนวนเงิน (บาท)"
                required
                hint={
                  newSubstitute
                    ? `ต้องไม่น้อยกว่ายอดรวมรายการของใบรับรองใบใหม่ (${fmtSatangSymbol(linesTotal)})`
                    : keepSubstitute
                      ? `ต้องไม่น้อยกว่ายอดใบรับรองแทนใบเสร็จ ${fmtSatangSymbol(activeSubstitute.totalSatang)}`
                      : undefined
                }
              >
                <Input
                  numeric
                  inputMode="decimal"
                  value={amountBaht}
                  onChange={(event) => setAmountBaht(event.target.value)}
                />
              </Field>
            )}

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

            {evidenceModes.length > 0 && substitute !== null && (
              <Field label="หลักฐานรายจ่าย" required>
                <div className="space-y-2">
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
                <NoReceiptLinesEditor lines={lines} onChange={setLines} defaultDate={lineDate} variant={isHotel ? 'hotel' : 'general'} />
              ))}

            {cancelsActive && activeSubstitute !== null && (
              <Field label={`เหตุผลการยกเลิกใบรับรอง ${activeSubstitute.receiptNumber}`} required>
                <Textarea
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
                label={evidenceState.hasRealReceipt ? 'แนบใบเสร็จใหม่ (ถ้าต้องเปลี่ยน)' : 'แนบใบเสร็จ'}
                required={receiptRequired}
              >
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="focus-ring flex w-full flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-slate-300 py-5 text-slate-400"
                >
                  <IconFile className="h-6 w-6" />
                  <span className="text-xs font-semibold">
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

        <Field label="สิ่งที่แก้ไข / ชี้แจง" required>
          <Textarea rows={3} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>

        {error !== null && <p className="text-xs font-semibold text-red-600">{error}</p>}
      </div>
      </fieldset>
    </Modal>
  )
}
