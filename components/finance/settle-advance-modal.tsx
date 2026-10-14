'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Button, Field, FieldErrorText, FieldGroupBox, FormSubmitFooter, InlineAlert, Input, Modal, ModalCancelButton, Textarea, useClearOnClose, useResetOnRecordChange, useRevealFieldError, useToast } from '@/components/ui'
import type { AdvanceDto, AdvanceSettleResult } from '@/lib/advances/types'
import { callApi, jsonRequest } from '@/lib/api/types'
import { advanceSettlement } from '@/lib/finance/advance-calc'
import { settleUsedField } from '@/lib/advances/advance-ui'
import { settleApiIssues, settleFormIssues, type SettleFormIssues } from '@/lib/advances/settle-form'
import { ADVANCE_RETURN_METHOD_LABEL, DEFAULT_ADVANCE_RETURN_METHOD } from '@/lib/advances/advance'
import type { AdvanceReturnMethod } from '@/lib/generated/prisma/enums'
import { fmtSatangSymbol } from '@/lib/format/money'
import { NoReceiptLinesEditor, NoReceiptToggle } from '@/components/substitute-receipts/no-receipt-lines'
import { StagedFileInput } from '@/components/uploads/staged-file-input'
import { EXPENSE_RECEIPT_ACCEPT } from '@/lib/field/media-upload'
import { FieldUploadError, uploadExpenseReceipt } from '@/lib/field/upload-client'
import { toInputDate } from '@/lib/format/datetime'
import {
  emptySubstituteLine,
  substituteLineRowError,
  type SubstituteLineDraft,
  type SubstituteLineIssueAt,
} from '@/lib/substitute-receipts/form'

/**
 * Modal "เคลียร์ยอดเงินทดรอง" (`15` §8/§9.1 · mockup `finance.html` `action-clear-advance`)
 *
 * ยอดคืนที่แสดงคำนวณด้วย `advanceSettlement()` (pure ของ 3.1 — มิเรอร์ generated column ของ DB)
 * **เพื่อแสดงผลล่วงหน้าเท่านั้น** ค่าจริงมาจาก DB หลังบันทึก (Rule 01 — ห้ามคำนวณเงินที่ display layer เอง)
 *
 * มติ PO 03/10/2569 (UAT Q3, BUG-011): ใช้จริงเกินยอดอนุมัติ = **บันทึกได้** ยอดคืน 0 และระบบสร้าง
 * คำขอเบิกส่วนเกินให้อัตโนมัติ (เข้าคิวอนุมัติค่าตอบแทน) — ไม่เพิ่มยอดทดรองย้อนหลัง (`15` §9.1)
 *
 * มติ PO U143 — ใบเสร็จ **อัปโหลดไฟล์จริง** (อัปโหลดตอนกดบันทึก → server ตรวจไฟล์ + SHA-256) · มีรายจ่าย ⇒
 * ต้องแนบใบเสร็จ หรือติ๊ก "ไม่มีใบเสร็จ" (ใบรับรองแทนใบเสร็จ) อย่างน้อยหนึ่งอย่าง
 */
export function SettleAdvanceModal({ advance, onClose, onSettled }: {
  advance: AdvanceDto | null
  onClose: () => void
  onSettled: () => void
}) {
  // id ผูก label ↔ ช่อง + aria-invalid/aria-describedby ผ่าน `<Field id>` (ตรวจซ้ำ staging SV5-R9-01)
  const fieldId = useId()
  const { showToast } = useToast()
  const [used, setUsed] = useState('')
  const [receipt, setReceipt] = useState<File | null>(null)
  // ข้อผิดจากการกดบันทึก/API รายช่อง (ยอดที่ใช้จริง/วิธีคืน/ใบเสร็จ/หมายเหตุ) — ใต้ช่อง + aria-invalid (SV5-J1-02/03)
  const [errors, setErrors] = useState<SettleFormIssues['errors']>({})
  const [note, setNote] = useState('')
  const [returnMethod, setReturnMethod] = useState<AdvanceReturnMethod>(DEFAULT_ADVANCE_RETURN_METHOD)
  const [saving, setSaving] = useState(false)
  // มติ PO U103 — รายจ่ายที่ไม่มีใบเสร็จ ⇒ ระบบออกใบรับรองแทนใบเสร็จ (CRT) ผูกเงินทดรองนี้
  const [noReceipt, setNoReceipt] = useState(false)
  const [substituteLines, setSubstituteLines] = useState<SubstituteLineDraft[]>([
    emptySubstituteLine('line-0', toInputDate(new Date())),
  ])
  const [substituteError, setSubstituteError] = useState<string | null>(null)
  // แถว/ช่องที่ผิดในตารางรายการ + เลื่อน/โฟกัสช่องที่ผิดหลังกดบันทึก (ตรวจซ้ำ staging SV5-R4-01)
  const [substituteAt, setSubstituteAt] = useState<SubstituteLineIssueAt | null>(null)
  // ข้อผิดข้อแรกตามลำดับบนจอ (รวมข้อผิดจาก API) — footer ติดจอเหนือปุ่ม role=alert (ตรวจซ้ำ staging SV5-J1-03)
  const [firstError, setFirstError] = useState<string | null>(null)
  const [submitTick, setSubmitTick] = useState(0)
  const { ref: bodyRef, reveal: revealError } = useRevealFieldError()
  // อัปโหลดใบเสร็จยกเลิกได้จริง — ปิด modal/ออกจากหน้า = abort request ที่ค้าง (preship R3-026)
  const [uploading, setUploading] = useState(false)
  const uploadAbortRef = useRef<AbortController | null>(null)
  const open = advance !== null
  useEffect(() => {
    if (!open) uploadAbortRef.current?.abort()
  }, [open])
  useEffect(() => () => uploadAbortRef.current?.abort(), [])
  // ปิดฟอร์ม (ยกเลิก/X/บันทึกสำเร็จ) ⇒ ล้างข้อผิดจากการกดบันทึกครั้งก่อน — ร่างที่กรอกไว้ยังอยู่ (ตรวจซ้ำ staging SV5-R6-01)
  useClearOnClose(open, clearErrors)
  /** ล้างข้อผิดทั้งหมด (ช่อง + แถวในตาราง + footer) */
  function clearErrors(): void {
    setErrors({})
    setSubstituteError(null)
    setSubstituteAt(null)
    setFirstError(null)
  }
  /**
   * ผู้ใช้แก้ช่องที่ผิดแล้ว ⇒ ล้างข้อความใต้ช่อง + footer (ถ้าเป็นข้อความเดียวกัน) — ไม่ค้างตัวเลขเก่า (รีวิว SV5-J1-02)
   */
  function clearFieldError(field: keyof SettleFormIssues['errors']): void {
    const message = errors[field]
    if (message === undefined) return
    setErrors(({ [field]: _cleared, ...rest }) => rest)
    setFirstError((current) => (current === message ? null : current))
  }
  /** แสดงผลตรวจ: ใต้ช่อง/แถว + ข้อแรกที่ footer (`footer` = ข้อความเต็มจาก API ถ้ามี) แล้วเลื่อน/โฟกัสช่องแรกที่ผิด */
  function showIssues(issues: SettleFormIssues, footer: string | null): void {
    setErrors(issues.errors)
    setSubstituteError(issues.lines?.message ?? null)
    setSubstituteAt(issues.lines?.at ?? null)
    setFirstError(footer ?? issues.first?.message ?? null)
    setSubmitTick((tick) => tick + 1)
    revealError()
  }
  // เปิดให้เงินทดรองคนละรายการกับร่างที่ค้าง ⇒ ล้างร่าง (ยอดที่ใช้จริง/ไฟล์/รายการ/หมายเหตุ) · เปิดรายการเดิมคงร่างไว้
  // (มติผู้ใช้ 14/10/2569)
  function resetDraft(): void {
    setUsed('')
    setReceipt(null)
    setNote('')
    setReturnMethod(DEFAULT_ADVANCE_RETURN_METHOD)
    setNoReceipt(false)
    setSubstituteLines([emptySubstituteLine('line-0', toInputDate(new Date()))])
    clearErrors()
  }
  useResetOnRecordChange(advance?.id ?? null, resetDraft)

  if (advance === null) return null

  // BUG-107: ค่าที่ parse ไม่ได้ต้องไม่ไหลเข้า `fmtSatangSymbol()`/`advanceSettlement()` (โยนระหว่าง render
  // = ทั้งหน้าล่ม) — `settleUsedField()` คืนเฉพาะยอดที่ใช้ได้ + ข้อความใต้ช่อง
  const { usedSatang, error: usedError } = settleUsedField(used)
  const validUsed = usedSatang !== null
  const preview = validUsed
    ? advanceSettlement({
        requestedSatang: advance.requestedSatang,
        approvedSatang: advance.approvedSatang,
        usedSatang,
      })
    : null

  const substituteRowError = substituteLineRowError(substituteError, substituteAt, substituteLines)

  async function submit(): Promise<void> {
    if (advance === null || !validUsed) return
    // ตรวจทุกข้อพร้อมกัน แล้วชี้ข้อแรกตามลำดับบนจอ — ยอดรวมรายการเกินยอดใช้จริง ⇒ ช่องยอดที่ใช้จริง (SV5-J1-02)
    const issues = settleFormIssues({ usedSatang, hasReceipt: receipt !== null, noReceipt, lines: substituteLines })
    if (issues.first !== null) {
      showIssues(issues, null)
      return
    }
    const substitute = issues.payload
    clearErrors()
    let receiptFileUrl: string | null = null
    if (receipt !== null) {
      const controller = new AbortController()
      uploadAbortRef.current = controller
      setUploading(true)
      try {
        receiptFileUrl = await uploadExpenseReceipt(receipt, { signal: controller.signal })
      } catch (uploadError) {
        const message = uploadError instanceof FieldUploadError ? uploadError.message : 'อัปโหลดใบเสร็จไม่สำเร็จ'
        showIssues({ errors: { receiptFileUrl: message }, lines: null, first: { field: 'receiptFileUrl', message } }, null)
        return
      } finally {
        uploadAbortRef.current = null
        setUploading(false)
      }
    }
    setSaving(true)
    const result = await callApi<AdvanceSettleResult>(
      `/api/advances/${advance.id}/settle`,
      jsonRequest('PATCH', {
        usedSatang,
        returnMethod,
        receiptFileUrl,
        note: note.trim(),
        substituteReceipt: substitute,
      }),
    )
    setSaving(false)
    if (result.error !== undefined) {
      // ข้อผิดจาก API ค้างที่ footer ติดจอ + ผูกช่องที่ server ระบุ (เดิมขึ้นแค่ toast — SV5-J1-03)
      showIssues(settleApiIssues(result.error.fields, substituteLines), result.error.message)
      showToast({ tone: 'error', title: result.error.title, description: result.error.message })
      return
    }
    const settled = result.data
    const excessClaimCreated = settled !== undefined && settled.excessClaimId !== null
    showToast({
      tone: 'success',
      title: 'เคลียร์ยอดเงินทดรองสำเร็จ',
      description: excessClaimCreated
        ? `สร้างคำขอเบิกส่วนเกิน ${fmtSatangSymbol(settled?.excessSatang)} ให้อัตโนมัติแล้ว (รออนุมัติ) — ขอเบิกรอบใหม่ได้`
        : settled !== undefined && settled.returnSatang > 0
          ? `ยอดคืน ${fmtSatangSymbol(settled.returnSatang)} — ${ADVANCE_RETURN_METHOD_LABEL[returnMethod]} · ขอเบิกรอบใหม่ได้`
          : 'รายการนี้ปิดแล้ว ขอเบิกรอบใหม่ได้',
    })
    resetDraft()
    if (settled?.substituteReceipt !== null && settled?.substituteReceipt !== undefined) {
      showToast({
        tone: 'success',
        title: `ออกใบรับรองแทนใบเสร็จ ${settled.substituteReceipt.receiptNumber} แล้ว`,
        description: 'ดาวน์โหลดไปให้ผู้เบิกเซ็น แล้วอัปโหลดฉบับเซ็นจากรายการเงินทดรอง',
      })
    }
    onSettled()
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="เคลียร์เงินทดรองจ่าย"
      // "ทิ้งข้อมูล" ⇒ ล้างร่างจริง · ปุ่มยกเลิกถามแบบเดียวกับ Esc/X (ตรวจซ้ำ staging SV5-J1-01)
      onDiscard={resetDraft}
      description={advance.purpose}
      // ระหว่างอัปโหลดไม่ใช้ `loading` (ซึ่งล็อกทั้ง footer) — ให้ปุ่ม "ยกเลิกการอัปโหลด" กดได้ (R3-026)
      lockClose={uploading}
      footer={
        <FormSubmitFooter message={firstError} tick={submitTick}>
          {uploading ? (
            <>
              <Button variant="secondary" onClick={() => uploadAbortRef.current?.abort()}>
                ยกเลิกการอัปโหลด
              </Button>
              <Button disabled>กำลังอัปโหลดใบเสร็จ...</Button>
            </>
          ) : (
            <>
              <ModalCancelButton onClose={onClose} />
              <Button loading={saving} disabled={!validUsed} onClick={() => void submit()}>
                บันทึกการเคลียร์ยอด
              </Button>
            </>
          )}
        </FormSubmitFooter>
      }
    >
      {/* ล็อกช่องกรอกระหว่างอัปโหลด — ค่าที่ส่งคือค่าตอนกดบันทึก */}
      <fieldset disabled={uploading} className="m-0 min-w-0 border-0 p-0">
      <div ref={bodyRef} className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Summary label="ยอดที่ยืม (อนุมัติ)" value={fmtSatangSymbol(advance.approvedSatang ?? advance.requestedSatang)} />
          <Summary label="ใช้จริง (กรอก)" value={fmtSatangSymbol(usedSatang)} tone="blue" />
          <Summary
            label="ยอดต้องคืน"
            value={preview === null ? '—' : fmtSatangSymbol(preview.returnSatang)}
            tone="emerald"
          />
        </div>

        <Field id={`${fieldId}-used`} label="ยอดที่ใช้จริง (บาท)" required error={usedError ?? errors.usedSatang ?? null}>
          <Input
            id={`${fieldId}-used`}
            numeric
            inputMode="decimal"
            placeholder="0.00"
            value={used}
            onChange={(event) => {
              setUsed(event.target.value)
              clearFieldError('usedSatang')
            }}
          />
        </Field>

        {preview !== null && preview.needsExtraClaim ? (
          <InlineAlert tone="warning">
            ใช้เกินยอดที่อนุมัติไป {fmtSatangSymbol(preview.excessSatang)} — ยอดคืนเป็น 0 และระบบจะสร้างคำขอเบิกส่วนเกิน
            {' '}{fmtSatangSymbol(preview.excessSatang)} ให้อัตโนมัติ (เข้าคิวอนุมัติค่าตอบแทน)
          </InlineAlert>
        ) : (
          <InlineAlert tone="warning">
            ถ้าใช้จริงมากกว่ายอดที่ยืม → ระบบสร้างคำขอเบิกส่วนเกินให้อัตโนมัติ (ยอดคืนไม่ติดลบ)
          </InlineAlert>
        )}

        {/* มติ PO U30 — มียอดคืน ⇒ ผู้เคลียร์เลือกวิธีคืน (ค่าเริ่มต้นหักกลบในรอบจ่ายถัดไป) */}
        {preview !== null && preview.returnSatang > 0 && (
          <Field
            id={`${fieldId}-return-method`}
            group
            label={`วิธีคืนยอด ${fmtSatangSymbol(preview.returnSatang)}`}
            required
            error={errors.returnMethod ?? null}
          >
            <FieldGroupBox role="radiogroup" aria-required className="space-y-2">
              {(['payout_offset', 'separate'] as const).map((method) => (
                <label key={method} className="flex items-start gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="advance-return-method"
                    className="mt-1"
                    checked={returnMethod === method}
                    onChange={() => setReturnMethod(method)}
                  />
                  <span>
                    {ADVANCE_RETURN_METHOD_LABEL[method]}
                    <span className="block text-[11px] text-slate-500">
                      {method === 'payout_offset'
                        ? 'หักจากยอดโอนสุทธิของรอบจ่ายถัดไปหลังหักภาษี — ยอดไม่พอหักเท่าที่มี ส่วนที่เหลือยกไปรอบถัดไป'
                        : 'การเงินบันทึกรับเงินสดหรือเงินโอนพร้อมแนบหลักฐาน'}
                    </span>
                  </span>
                </label>
              ))}
            </FieldGroupBox>
          </Field>
        )}

        <Field
          id={`${fieldId}-file`}
          label="แนบใบเสร็จ"
          error={errors.receiptFileUrl ?? null}
          hint={'รูปภาพหรือ PDF ไม่เกิน 10 MB — รายจ่ายที่ไม่มีใบเสร็จให้ติ๊ก "ไม่มีใบเสร็จ" ด้านล่าง'}
        >
          <StagedFileInput
            id={`${fieldId}-file`}
            fileName={receipt?.name ?? null}
            accept={EXPENSE_RECEIPT_ACCEPT}
            placeholder="แตะเพื่อเลือกไฟล์ใบเสร็จ"
            disabled={saving}
            onPick={(file) => {
              setReceipt(file)
              clearFieldError('receiptFileUrl')
            }}
            onClear={() => setReceipt(null)}
          />
        </Field>

        <NoReceiptToggle
          checked={noReceipt}
          onChange={(checked) => {
            setNoReceipt(checked)
            setSubstituteError(null)
            setSubstituteAt(null)
            if (substituteError !== null) setFirstError((current) => (current === substituteError ? null : current))
            // ข้อความ "ต้องแนบใบเสร็จ…" เก่าค้างเหนือตาราง ⇒ reveal ครั้งถัดไปโฟกัสผิดช่อง (รีวิว SV5-R4-01)
            clearFieldError('receiptFileUrl')
          }}
          hint="มีรายจ่ายบางรายการที่เรียกใบเสร็จไม่ได้ — กรอกรายการแล้วระบบออกใบรับรองแทนใบเสร็จรับเงินให้เซ็น"
        />
        {noReceipt && (
          // ห่อ div ⇒ ข้อความระดับทั้งตารางโฟกัสช่องในตาราง ไม่ใช่ช่องบนสุดของฟอร์ม
          <div>
            <NoReceiptLinesEditor
              lines={substituteLines}
              onChange={(next) => {
                setSubstituteLines(next)
                // ยอดรวมรายการเปลี่ยน ⇒ ข้อความ "ยอดรวมเกินยอดที่ใช้จริง" ใต้ช่องยอดที่ใช้จริงไม่จริงแล้ว
                clearFieldError('usedSatang')
              }}
              defaultDate={toInputDate(new Date())}
              error={substituteRowError}
            />
            {substituteError !== null && substituteRowError === null && <FieldErrorText>{substituteError}</FieldErrorText>}
          </div>
        )}

        <Field id={`${fieldId}-note`} label="หมายเหตุ (ถ้ามี)" error={errors.note ?? null}>
          <Textarea id={`${fieldId}-note`} rows={2} maxLength={500} value={note} onChange={(event) => {
              setNote(event.target.value)
              clearFieldError('note')
            }} />
        </Field>
      </div>
      </fieldset>
    </Modal>
  )
}

function Summary({ label, value, tone }: { label: string; value: string; tone?: 'blue' | 'emerald' }) {
  const toneClass = tone === 'blue' ? 'text-blue-700' : tone === 'emerald' ? 'text-emerald-700' : 'text-slate-800'
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <p className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">{label}</p>
      <p className={`font-mono text-sm font-bold ${toneClass}`}>{value}</p>
    </div>
  )
}
