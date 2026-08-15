'use client'

import { useState } from 'react'
import { Button, Field, Modal, Textarea, useToast } from '@/components/ui'
import type { AccountantQuestionDto } from '@/lib/accounting/types'
import { callApi, jsonRequest } from '@/lib/api/types'

/**
 * Modal "สร้างข้อซักถาม" (`36` §7 · mockup `accounting.html` `qa-form`)
 *
 * ⚠️ ช่อง "อ้างอิง" และ "กำหนดตอบกลับ" ของ mockup **ยังไม่มีคอลัมน์ใน `02` §9** ⇒ ยังไม่ทำ
 *    (บันทึกไว้ที่ `docs/02_OPEN_DECISIONS.md` D14) — รอบบัญชีของคำถามใช้รอบเดือนปัจจุบันอัตโนมัติ
 */
export function QuestionFormModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const { showToast } = useToast()
  const [questionText, setQuestionText] = useState('')
  const [saving, setSaving] = useState(false)

  if (!open) return null

  const ready = questionText.trim() !== ''

  async function submit(): Promise<void> {
    if (!ready) return
    setSaving(true)
    const result = await callApi<AccountantQuestionDto>(
      '/api/accounting/questions',
      jsonRequest('POST', { questionText: questionText.trim() }),
    )
    setSaving(false)

    if (result.error !== undefined) {
      showToast({ tone: 'error', title: result.error.title, description: result.error.message })
      return
    }
    showToast({ tone: 'success', title: 'บันทึกข้อซักถามแล้ว', description: 'ติดตามสถานะได้จากตารางนี้' })
    setQuestionText('')
    onCreated()
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="บันทึกข้อซักถามจากสำนักงานบัญชี"
      description="เก็บคำถามที่สำนักงานบัญชีส่งกลับมาให้เป็นหลักฐาน พร้อมติดตามว่าตอบไปแล้วหรือยัง"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button loading={saving} disabled={!ready} onClick={() => void submit()}>
            บันทึกข้อซักถาม
          </Button>
        </>
      }
    >
      <Field label="คำถาม / ข้อสงสัย" required hint="ระบุให้ครบว่าถามถึงรายการไหน เพื่อให้ตามกลับได้ภายหลัง">
        <Textarea
          rows={5}
          value={questionText}
          onChange={(event) => setQuestionText(event.target.value)}
          placeholder="เช่น เงินเข้า 12,500 บาท วันที่ 22/06/2569 (Ref: KBANK-TRX-003) มาจากบริษัทใด"
        />
      </Field>
    </Modal>
  )
}
