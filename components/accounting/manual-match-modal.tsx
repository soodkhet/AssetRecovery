'use client'

import { useEffect, useState } from 'react'
import { Button, Field, InlineAlert, Modal, Select, Textarea, useToast } from '@/components/ui'
import { callApi, jsonRequest } from '@/lib/api/types'
import {
  MATCH_TARGET_LABEL,
  allowedTargetKind,
  matchCandidateOptionText,
  matchSuccessToast,
  mismatchCompareAmounts,
  suspenseMatchRequiresNote,
} from '@/lib/bank-recon/matching'
import type { BankTransactionDto, MatchCandidateDto, MatchResultDto } from '@/lib/bank-recon/types'
import { fmtDate } from '@/lib/format/datetime'
import { fmtSatangSymbol } from '@/lib/format/money'

/**
 * Modal "จับคู่รายการธนาคาร Manual" (`35` §8 · mockup `accounting.html` `manual-match`)
 *
 * ⚠️ ประเภทที่จับคู่ได้ถูกกำหนดโดย**เครื่องหมายของยอด** (เงินเข้า = รอบวางบิล · เงินออก = รอบจ่าย)
 *    ตาม `35` §6.2 — ไม่ใช่ให้ผู้ใช้เลือกเอง
 * ⚠️ ยอดไม่ตรงเป๊ะ หรือเปลี่ยนการจับคู่เดิม ⇒ ต้องกรอกหมายเหตุ (`MATCH_NOTE_REQUIRED`) —
 *    ปุ่มถูกปิดไว้จนกว่าจะกรอก และ API ตรวจซ้ำอีกชั้นเสมอ
 */
export function ManualMatchModal({
  transaction,
  onClose,
  onMatched,
}: {
  transaction: BankTransactionDto | null
  onClose: () => void
  onMatched: () => void
}) {
  const { showToast } = useToast()
  const [candidates, setCandidates] = useState<readonly MatchCandidateDto[]>([])
  const [targetId, setTargetId] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (transaction === null) return
    let cancelled = false
    void (async () => {
      const result = await callApi<MatchCandidateDto[]>(
        `/api/bank-reconciliation/match-candidates?transactionId=${transaction.id}`,
      )
      if (cancelled) return
      setCandidates(result.data ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [transaction])

  if (transaction === null) return null

  const kind = allowedTargetKind(transaction.amountSatang)
  const selected = candidates.find((candidate) => candidate.id === targetId)
  const isRematch = transaction.matchStatus === 'auto_matched' || transaction.matchStatus === 'manual_matched'
  // เงินรับรอตรวจสอบ (มติ PO U41) ⇒ ต้องบอกเสมอว่าทราบที่มาจากอะไร
  const fromSuspense = suspenseMatchRequiresNote(transaction.matchStatus)
  // staging E-057 — รอบจ่ายที่จับคู่กับรายการอื่นแล้ว: จับเพิ่มได้ (1:N) แต่ต้องยืนยันพร้อมเหตุผล
  const targetAlreadyMatched = selected?.alreadyMatchedWith != null
  const noteRequired =
    isRematch || fromSuspense || targetAlreadyMatched || (selected !== undefined && !selected.exactAmount)
  const ready = targetId !== '' && (!noteRequired || note.trim() !== '')

  async function submit(): Promise<void> {
    if (!ready || transaction === null) return
    setSaving(true)
    const result = await callApi<MatchResultDto | null>(
      `/api/bank-reconciliation/transactions/${transaction.id}/match`,
      jsonRequest('PATCH', {
        targetKind: kind,
        targetId,
        matchNote: note.trim() === '' ? null : note.trim(),
        // ผู้ใช้เห็นคำเตือน "รายการนี้จับคู่ไปแล้ว" บนหน้าจอนี้ก่อนกดยืนยันแล้ว (`35` §11)
        confirmRematch: isRematch,
      }),
    )
    setSaving(false)

    if (result.error !== undefined) {
      showToast({ tone: 'error', title: result.error.title, description: result.error.message })
      return
    }
    if (result.warning !== undefined) {
      showToast({ tone: 'warning', title: result.warning.title, description: result.warning.message })
      return
    }

    showToast({ tone: 'success', ...matchSuccessToast(result.data?.effect, selected?.ref ?? 'รายการที่เลือก') })
    onMatched()
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="จับคู่รายการธนาคาร Manual (Bank Reconciliation)"
      description={MATCH_TARGET_LABEL[kind]}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button loading={saving} disabled={!ready} onClick={() => void submit()}>
            ยืนยันการจับคู่
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div>
            <div className="mb-1 text-[10px] font-bold text-blue-800 uppercase">Bank Statement Transaction</div>
            <div className="font-bold text-slate-900">{transaction.description}</div>
            <div className="mt-0.5 font-mono text-xs text-slate-500">
              {fmtDate(transaction.transactionDate)} · {transaction.bankAccountLabel}
            </div>
          </div>
          <div className="text-right">
            <div className="mb-1 text-[10px] font-bold text-slate-500 uppercase">
              {transaction.amountSatang >= 0 ? 'ยอดเงินเข้า' : 'ยอดเงินออก'}
            </div>
            <div
              className={`text-xl font-extrabold ${transaction.amountSatang >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}
            >
              {transaction.amountSatang >= 0 ? '+' : '-'}
              {fmtSatangSymbol(Math.abs(transaction.amountSatang))}
            </div>
          </div>
        </div>

        {isRematch && (
          <InlineAlert tone="warning" title="รายการนี้จับคู่ไปแล้ว">
            การยืนยันจะเปลี่ยนการจับคู่เดิม ({transaction.matchedRef ?? '—'}) — เงินรับที่สร้างจากการจับคู่เดิม
            จะถูกถอนออกและบันทึกลง audit พร้อมเหตุผลที่กรอก
          </InlineAlert>
        )}

        {fromSuspense && (
          <InlineAlert tone="info" title="จับคู่เงินรับรอตรวจสอบ">
            เมื่อจับคู่แล้วระบบจะสร้างเงินรับและลดยอดค้างชำระของรอบวางบิลที่เลือก — ระบุว่าทราบที่มาของเงินจากอะไร
          </InlineAlert>
        )}

        <Field label="เลือกรายการที่ต้องการจับคู่" required>
          <Select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
            <option value="">— เลือกรายการ —</option>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {matchCandidateOptionText(transaction.amountSatang, candidate)}
              </option>
            ))}
          </Select>
        </Field>

        {selected?.alreadyMatchedWith != null && (
          <InlineAlert tone="warning" title="รอบจ่ายนี้จับคู่ไปแล้ว">
            จับคู่แล้วกับ{selected.alreadyMatchedWith} — จับคู่เพิ่มได้เมื่อโอนรอบเดียวแยกหลายรายการ{' '}
            <b>ต้องกรอกหมายเหตุยืนยัน</b>
          </InlineAlert>
        )}

        {selected !== undefined && !selected.exactAmount && (
          <InlineAlert tone="warning" title="ยอดไม่ตรงกันเป๊ะ">
            {(() => {
              const compare = mismatchCompareAmounts(selected)
              return (
                <>
                  {compare.label} {fmtSatangSymbol(compare.amountSatang)}
                  {compare.afterWhtSatang !== null &&
                    ` (คาดรับหลังลูกค้าหัก ณ ที่จ่าย ${fmtSatangSymbol(compare.afterWhtSatang)})`}{' '}
                  · ยอดที่ธนาคารบันทึก {fmtSatangSymbol(Math.abs(transaction.amountSatang))} —{' '}
                  <b>ต้องกรอกหมายเหตุชี้แจง</b> เช่น ลูกค้าหักค่าธรรมเนียม/ภาษี ณ ที่จ่ายก่อนโอน
                </>
              )
            })()}
          </InlineAlert>
        )}

        <Field
          label="หมายเหตุชี้แจง"
          required={noteRequired}
          hint={noteRequired ? 'บังคับกรอก — บันทึกลง audit log' : 'ไม่บังคับเมื่อยอดตรงเป๊ะ'}
        >
          <Textarea
            maxLength={1000}
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="อธิบายเหตุผลที่ยอดไม่ตรงกัน หรือเหตุผลที่เปลี่ยนการจับคู่..."
          />
        </Field>
      </div>
    </Modal>
  )
}
