'use client'

import { useState } from 'react'
import { Button, Field, InlineAlert, Modal, Textarea, useToast } from '@/components/ui'
import type { AccountantQuestionDto } from '@/lib/accounting/types'
import { callApi, jsonRequest } from '@/lib/api/types'
import { fmtDateTime } from '@/lib/format/datetime'

/**
 * Modal "ตอบข้อซักถาม" / "ดูคำตอบ" (`36` §7/§8 · mockup `accounting.html` `qa-answer` + `qa-view`)
 *
 * ตอบได้ครั้งเดียว (`36` §8) ⇒ คำถามที่ตอบแล้วเปิดได้แต่เป็นโหมดอ่านอย่างเดียว
 */
export function AnswerQuestionModal({
  question,
  onClose,
  onAnswered,
}: {
  question: AccountantQuestionDto | null
  onClose: () => void
  onAnswered: () => void
}) {
  const { showToast } = useToast()
  const [answerText, setAnswerText] = useState('')
  const [saving, setSaving] = useState(false)

  if (question === null) return null

  const readOnly = question.isResolved
  const ready = answerText.trim() !== ''

  async function submit(): Promise<void> {
    if (!ready || question === null) return
    setSaving(true)
    const result = await callApi<AccountantQuestionDto>(
      `/api/accounting/questions/${question.id}/answer`,
      jsonRequest('PATCH', { answerText: answerText.trim() }),
    )
    setSaving(false)

    if (result.error !== undefined) {
      showToast({ tone: 'error', title: result.error.title, description: result.error.message })
      return
    }
    showToast({ tone: 'success', title: 'ส่งคำตอบแล้ว', description: 'สถานะเปลี่ยนเป็น “ตอบแล้ว”' })
    setAnswerText('')
    onAnswered()
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={readOnly ? 'ข้อซักถาม & คำตอบ' : 'ตอบข้อซักถาม'}
      description={`รอบบัญชี ${question.periodLabel}`}
      footer={
        readOnly ? (
          <Button variant="ghost" onClick={onClose}>
            ปิดหน้าต่าง
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              ยกเลิก
            </Button>
            <Button loading={saving} disabled={!ready} onClick={() => void submit()}>
              ส่งคำตอบ
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4 text-sm">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="mb-1 text-[10px] font-bold text-slate-400 uppercase">คำถาม (บันทึกโดย {question.createdByName})</div>
          <div className="leading-relaxed font-medium text-slate-800">{question.questionText}</div>
          <div className="mt-2 font-mono text-[10px] text-slate-400">บันทึกเมื่อ {fmtDateTime(question.createdAt)}</div>
        </div>

        {readOnly ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <div className="mb-1 text-[10px] font-bold text-emerald-600 uppercase">คำตอบ</div>
            <div className="leading-relaxed text-slate-800">{question.answerText}</div>
            <div className="mt-2 text-[10px] text-slate-400">
              ตอบโดย {question.answeredByName ?? '—'} · {fmtDateTime(question.answeredAt)}
            </div>
          </div>
        ) : (
          <>
            <Field label="พิมพ์คำตอบ / ชี้แจง" required hint="ตอบให้ครบถ้วน รวมถึงอ้างอิงเอกสารที่แก้ไขแล้วถ้ามี">
              <Textarea
                rows={5}
                value={answerText}
                onChange={(event) => setAnswerText(event.target.value)}
                placeholder="เช่น เป็นเงินรับจากบริษัท เร็วดี จำกัด — ตั้งรับ AR ให้แล้วตามใบแจ้งหนี้ INV-2569-0015"
              />
            </Field>
            <InlineAlert tone="warning" title="ตอบได้ครั้งเดียว">
              คำตอบที่บันทึกแล้วแก้ไม่ได้ เพื่อคงหลักฐานการสื่อสารกับสำนักงานบัญชี — ถ้ามีข้อมูลเพิ่มให้บันทึกเป็น
              ข้อซักถามใหม่
            </InlineAlert>
          </>
        )}
      </div>
    </Modal>
  )
}
