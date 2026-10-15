'use client'

import { useId, useState } from 'react'
import { Button, Field, FormSubmitFooter, Modal, ModalCancelButton, Textarea, useClearOnClose, useRevealFieldError, useSubmitError, useToast } from '@/components/ui'
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
  // id ผูก label ↔ ช่อง + aria-invalid/aria-describedby ผ่าน `<Field id>` (ตรวจซ้ำ staging SV5-R9-01)
  const fieldId = useId()
  const { showToast } = useToast()
  const [questionText, setQuestionText] = useState('')
  const [saving, setSaving] = useState(false)
  const { ref: formRef, reveal: revealFormError } = useRevealFieldError()
  const submitError = useSubmitError(revealFormError)
  // ค้าง mount ⇒ ปิดแล้วล้างข้อผิดจากการกดส่ง (ร่างยังอยู่) · มติผู้ใช้ 15/10/2569
  useClearOnClose(open, submitError.clear)

  if (!open) return null

  /** ล้างร่าง + ข้อผิด — หลังบันทึกสำเร็จ และเมื่อผู้ใช้ยืนยัน "ทิ้งข้อมูล" */
  function resetDraft(): void {
    setQuestionText('')
    submitError.clear()
  }

  const ready = questionText.trim() !== ''

  async function submit(): Promise<void> {
    if (!ready) return
    submitError.clear()
    setSaving(true)
    const result = await callApi<AccountantQuestionDto>(
      '/api/accounting/questions',
      jsonRequest('POST', { questionText: questionText.trim() }),
    )
    setSaving(false)

    if (result.error !== undefined) {
      submitError.fail(result.error)
      showToast({ tone: 'error', title: result.error.title, description: result.error.message })
      return
    }
    showToast({ tone: 'success', title: 'บันทึกข้อซักถามแล้ว', description: 'ติดตามสถานะได้จากตารางนี้' })
    resetDraft()
    onCreated()
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="บันทึกข้อซักถามจากสำนักงานบัญชี"
      description="เก็บคำถามที่สำนักงานบัญชีส่งกลับมาให้เป็นหลักฐาน พร้อมติดตามว่าตอบไปแล้วหรือยัง"
      // ค้าง mount ⇒ ยกเลิก/Esc/X/Back ถามเมื่อมีร่าง · "ทิ้งข้อมูล" ล้างร่างจริง (มติผู้ใช้ 15/10/2569)
      onDiscard={resetDraft}
      footer={
        <FormSubmitFooter message={submitError.message} tick={submitError.tick}>
          <ModalCancelButton onClose={onClose} />
          <Button loading={saving} disabled={!ready} onClick={() => void submit()}>
            บันทึกข้อซักถาม
          </Button>
        </FormSubmitFooter>
      }
    >
      <div ref={formRef}>
        <Field
          id={`${fieldId}-question-text`}
          label="คำถาม / ข้อสงสัย"
          required
          hint="ระบุให้ครบว่าถามถึงรายการไหน เพื่อให้ตามกลับได้ภายหลัง"
          error={submitError.fields.questionText}
        >
          <Textarea
            id={`${fieldId}-question-text`}
            maxLength={2000}
            rows={5}
            value={questionText}
            onChange={(event) => {
              setQuestionText(event.target.value)
              submitError.clearField('questionText')
            }}
            placeholder="เช่น เงินเข้า 12,500 บาท วันที่ 22/06/2569 (Ref: KBANK-TRX-003) มาจากบริษัทใด"
          />
        </Field>
      </div>
    </Modal>
  )
}
