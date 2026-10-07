'use client'

import { useState } from 'react'
import { Button, Field, InlineAlert, Input, Modal, Textarea, useToast } from '@/components/ui'
import type { AdvanceDto, AdvanceSettleResult } from '@/lib/advances/types'
import { callApi, jsonRequest } from '@/lib/api/types'
import { advanceSettlement } from '@/lib/finance/advance-calc'
import { settleUsedField } from '@/lib/advances/advance-ui'
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
  substituteDraftPayload,
  substituteDraftTotalSatang,
  type SubstituteLineDraft,
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
  const { showToast } = useToast()
  const [used, setUsed] = useState('')
  const [receipt, setReceipt] = useState<File | null>(null)
  const [receiptError, setReceiptError] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [returnMethod, setReturnMethod] = useState<AdvanceReturnMethod>(DEFAULT_ADVANCE_RETURN_METHOD)
  const [saving, setSaving] = useState(false)
  // มติ PO U103 — รายจ่ายที่ไม่มีใบเสร็จ ⇒ ระบบออกใบรับรองแทนใบเสร็จ (CRT) ผูกเงินทดรองนี้
  const [noReceipt, setNoReceipt] = useState(false)
  const [substituteLines, setSubstituteLines] = useState<SubstituteLineDraft[]>([
    emptySubstituteLine('line-0', toInputDate(new Date())),
  ])
  const [substituteError, setSubstituteError] = useState<string | null>(null)

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

  async function submit(): Promise<void> {
    if (advance === null || !validUsed) return
    const substitute = noReceipt ? substituteDraftPayload(substituteLines) : null
    if (substitute !== null && substitute.error !== null) {
      setSubstituteError(substitute.error)
      return
    }
    if (substitute !== null && substituteDraftTotalSatang(substituteLines) > usedSatang) {
      setSubstituteError('ยอดรวมรายการที่ไม่มีใบเสร็จต้องไม่เกินยอดที่ใช้จริง')
      return
    }
    setSubstituteError(null)
    if (usedSatang > 0 && receipt === null && substitute === null) {
      setReceiptError('ต้องแนบใบเสร็จ หรือติ๊ก "ไม่มีใบเสร็จ" แล้วกรอกรายการ')
      return
    }
    setReceiptError(null)
    setSaving(true)
    let receiptFileUrl: string | null = null
    try {
      receiptFileUrl = receipt === null ? null : await uploadExpenseReceipt(receipt)
    } catch (uploadError) {
      setSaving(false)
      setReceiptError(uploadError instanceof FieldUploadError ? uploadError.message : 'อัปโหลดใบเสร็จไม่สำเร็จ')
      return
    }
    const result = await callApi<AdvanceSettleResult>(
      `/api/advances/${advance.id}/settle`,
      jsonRequest('PATCH', {
        usedSatang,
        returnMethod,
        receiptFileUrl,
        note: note.trim(),
        substituteReceipt: substitute === null ? null : substitute.payload,
      }),
    )
    setSaving(false)
    if (result.error !== undefined) {
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
    setUsed('')
    setReturnMethod(DEFAULT_ADVANCE_RETURN_METHOD)
    setReceipt(null)
    setNote('')
    setNoReceipt(false)
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
      title="เคลียร์เงินทดรองจ่าย (Settle Advance)"
      description={advance.purpose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button loading={saving} disabled={!validUsed} onClick={() => void submit()}>
            บันทึกการเคลียร์ยอด
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Summary label="ยอดที่ยืม (อนุมัติ)" value={fmtSatangSymbol(advance.approvedSatang ?? advance.requestedSatang)} />
          <Summary label="ใช้จริง (กรอก)" value={fmtSatangSymbol(usedSatang)} tone="blue" />
          <Summary
            label="ยอดต้องคืน"
            value={preview === null ? '—' : fmtSatangSymbol(preview.returnSatang)}
            tone="emerald"
          />
        </div>

        <Field label="ยอดที่ใช้จริง (บาท)" required error={usedError}>
          <Input
            numeric
            inputMode="decimal"
            placeholder="0.00"
            invalid={usedError !== null}
            value={used}
            onChange={(event) => setUsed(event.target.value)}
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
          <Field label={`วิธีคืนยอด ${fmtSatangSymbol(preview.returnSatang)}`} required>
            <div className="space-y-2">
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
            </div>
          </Field>
        )}

        <Field
          label="แนบใบเสร็จ"
          error={receiptError}
          hint={'รูปภาพหรือ PDF ไม่เกิน 10 MB — รายจ่ายที่ไม่มีใบเสร็จให้ติ๊ก "ไม่มีใบเสร็จ" ด้านล่าง'}
        >
          <StagedFileInput
            fileName={receipt?.name ?? null}
            accept={EXPENSE_RECEIPT_ACCEPT}
            placeholder="แตะเพื่อเลือกไฟล์ใบเสร็จ"
            disabled={saving}
            onPick={(file) => {
              setReceipt(file)
              setReceiptError(null)
            }}
            onClear={() => setReceipt(null)}
          />
        </Field>

        <NoReceiptToggle
          checked={noReceipt}
          onChange={(checked) => {
            setNoReceipt(checked)
            setSubstituteError(null)
          }}
          hint="มีรายจ่ายบางรายการที่เรียกใบเสร็จไม่ได้ — กรอกรายการแล้วระบบออกใบรับรองแทนใบเสร็จรับเงินให้เซ็น"
        />
        {noReceipt && (
          <>
            <NoReceiptLinesEditor
              lines={substituteLines}
              onChange={setSubstituteLines}
              defaultDate={toInputDate(new Date())}
            />
            {substituteError !== null && <p className="text-xs font-semibold text-red-600">{substituteError}</p>}
          </>
        )}

        <Field label="หมายเหตุ (ถ้ามี)">
          <Textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
      </div>
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
