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

/**
 * Modal "เคลียร์ยอดเงินทดรอง" (`15` §8/§9.1 · mockup `finance.html` `action-clear-advance`)
 *
 * ยอดคืนที่แสดงคำนวณด้วย `advanceSettlement()` (pure ของ 3.1 — มิเรอร์ generated column ของ DB)
 * **เพื่อแสดงผลล่วงหน้าเท่านั้น** ค่าจริงมาจาก DB หลังบันทึก (Rule 01 — ห้ามคำนวณเงินที่ display layer เอง)
 *
 * มติ PO 03/10/2569 (UAT Q3, BUG-011): ใช้จริงเกินยอดอนุมัติ = **บันทึกได้** ยอดคืน 0 และระบบสร้าง
 * คำขอเบิกส่วนเกินให้อัตโนมัติ (เข้าคิวอนุมัติค่าตอบแทน) — ไม่เพิ่มยอดทดรองย้อนหลัง (`15` §9.1)
 */
export function SettleAdvanceModal({ advance, onClose, onSettled }: {
  advance: AdvanceDto | null
  onClose: () => void
  onSettled: () => void
}) {
  const { showToast } = useToast()
  const [used, setUsed] = useState('')
  const [receiptUrl, setReceiptUrl] = useState('')
  const [note, setNote] = useState('')
  const [returnMethod, setReturnMethod] = useState<AdvanceReturnMethod>(DEFAULT_ADVANCE_RETURN_METHOD)
  const [saving, setSaving] = useState(false)

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
    setSaving(true)
    const result = await callApi<AdvanceSettleResult>(
      `/api/advances/${advance.id}/settle`,
      jsonRequest('PATCH', { usedSatang, returnMethod, receiptFileUrl: receiptUrl.trim(), note: note.trim() }),
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
    setReceiptUrl('')
    setNote('')
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
          <Button variant="ghost" onClick={onClose}>
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

        <Field label="ลิงก์ใบเสร็จ / หลักฐาน (ถ้ามี)">
          <Input
            placeholder="path ของไฟล์ใน Storage เช่น expenses/<userId>/receipts/…"
            value={receiptUrl}
            onChange={(event) => setReceiptUrl(event.target.value)}
          />
        </Field>

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
