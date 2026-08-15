'use client'

import { useState } from 'react'
import { Button, Field, InlineAlert, Input, Modal, Textarea, useToast } from '@/components/ui'
import type { AdvanceDto } from '@/lib/advances/types'
import { callApi, jsonRequest } from '@/lib/api/types'
import { advanceSettlement } from '@/lib/finance/advance-calc'
import { fmtSatangSymbol, parseBahtInput } from '@/lib/format/money'

/**
 * Modal "เคลียร์ยอดเงินทดรอง" (`15` §8/§9.1 · mockup `finance.html` `action-clear-advance`)
 *
 * ยอดคืนที่แสดงคำนวณด้วย `advanceSettlement()` (pure ของ 3.1 — มิเรอร์ generated column ของ DB)
 * **เพื่อแสดงผลล่วงหน้าเท่านั้น** ค่าจริงมาจาก DB หลังบันทึก (Rule 01 — ห้ามคำนวณเงินที่ display layer เอง)
 *
 * ใช้จริงเกิน **ยอดที่ขอ** = ปุ่มบันทึกไม่ทำงาน (API ตอบ `USED_EXCEEDS_REQUEST_NO_TOPUP` ซ้ำเสมอ)
 * — ส่วนเกินต้องสร้าง Claim ใหม่แยก ไม่ใช่เพิ่มยอดทดรองย้อนหลัง (`15` §11)
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
  const [saving, setSaving] = useState(false)

  if (advance === null) return null

  const usedSatang = parseBahtInput(used)
  const preview =
    usedSatang === null
      ? null
      : advanceSettlement({
          requestedSatang: advance.requestedSatang,
          approvedSatang: advance.approvedSatang,
          usedSatang,
        })
  const exceedsRequest = usedSatang !== null && usedSatang > advance.requestedSatang

  async function submit(): Promise<void> {
    if (advance === null || usedSatang === null || exceedsRequest) return
    setSaving(true)
    const result = await callApi(
      `/api/advances/${advance.id}/settle`,
      jsonRequest('PATCH', { usedSatang, receiptFileUrl: receiptUrl.trim(), note: note.trim() }),
    )
    setSaving(false)
    if (result.error !== undefined) {
      showToast({ tone: 'error', title: result.error.title, description: result.error.message })
      return
    }
    showToast({ tone: 'success', title: 'เคลียร์ยอดเงินทดรองสำเร็จ', description: 'รายการนี้ปิดแล้ว ขอเบิกรอบใหม่ได้' })
    setUsed('')
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
          <Button loading={saving} disabled={usedSatang === null || exceedsRequest} onClick={() => void submit()}>
            บันทึกการเคลียร์ยอด
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Summary label="ยอดที่ยืม (อนุมัติ)" value={fmtSatangSymbol(advance.approvedSatang ?? advance.requestedSatang)} />
          <Summary label="ใช้จริง (กรอก)" value={usedSatang === null ? '—' : fmtSatangSymbol(usedSatang)} tone="blue" />
          <Summary
            label="ยอดต้องคืน"
            value={preview === null ? '—' : fmtSatangSymbol(preview.returnSatang)}
            tone="emerald"
          />
        </div>

        <Field label="ยอดที่ใช้จริง (บาท)" required>
          <Input
            numeric
            inputMode="decimal"
            placeholder="0.00"
            value={used}
            onChange={(event) => setUsed(event.target.value)}
          />
        </Field>

        {exceedsRequest ? (
          <InlineAlert tone="error">
            ใช้จริงเกินยอดที่ขอเบิก ({fmtSatangSymbol(advance.requestedSatang)}) — ต้องสร้าง Claim เพิ่มเติมสำหรับส่วนที่เกินแยกต่างหาก
            (ยอดคืนติดลบไม่ได้)
          </InlineAlert>
        ) : (
          <InlineAlert tone="warning">
            ถ้าใช้จริงมากกว่ายอดที่ยืม → ต้องสร้าง Claim เพิ่มเติมสำหรับส่วนที่เกิน (ป้องกันยอดคืนติดลบ)
          </InlineAlert>
        )}

        {preview !== null && preview.needsExtraClaim && !exceedsRequest && (
          <InlineAlert tone="warning">
            ใช้เกินยอดที่อนุมัติไป {fmtSatangSymbol(preview.excessSatang)} — ยอดคืนเป็น 0 และต้องเบิกส่วนเกินเป็นรายการใหม่
          </InlineAlert>
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
