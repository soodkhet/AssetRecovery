'use client'

import { useId, useState } from 'react'
import { Button, Field, InlineAlert, Modal, Textarea, useRevealFieldError, useToast } from '@/components/ui'
import { apiPath } from '@/lib/api/contract'
import { callApi, jsonRequest, type ApiCallError } from '@/lib/api/types'
import { LOT_REMOVE_ASSET_REASON_MAX } from '@/lib/warehouse/schemas'
import type { LotDetailDto } from '@/lib/warehouse/types'

/**
 * Modal "ลบล็อตว่าง" — known Q9: ล็อตที่ยังไม่ยืนยันและไม่มีเครื่องเหลือ (นำออกหมดแล้ว) ค้างในแท็บรอส่งมอบ
 * ⇒ ลบทิ้งได้ (soft delete) · เหตุผลบังคับ (ลง audit) · เลขล็อตไม่นำกลับมาใช้
 * server ตรวจซ้ำทุกข้อ (สิทธิ์ · ยังไม่ยืนยัน · ไม่มีเครื่องเหลือแม้ในทีมที่ผู้ใช้มองไม่เห็น)
 */
export function DeleteEmptyLotModal({
  open,
  lot,
  onClose,
  onDone,
}: {
  open: boolean
  lot: LotDetailDto
  onClose: () => void
  onDone: () => void
}) {
  // id ผูก label ↔ ช่อง + aria-invalid/aria-describedby ผ่าน `<Field id>` (ตรวจซ้ำ staging SV5-R9-01)
  const fieldId = useId()
  const { showToast } = useToast()
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<ApiCallError | null>(null)
  // เหตุผลว่าง = ข้อผิดของช่อง (ใต้ช่อง + aria-invalid + โฟกัส) ไม่ใช่กล่องแจ้งเตือน (ตรวจซ้ำ staging SV5-A11Y-A2-02)
  const [reasonError, setReasonError] = useState<string | null>(null)
  const { ref: formRef, reveal } = useRevealFieldError()

  async function submit(): Promise<void> {
    setError(null)
    setReasonError(null)
    if (reason.trim() === '') {
      setReasonError('ต้องระบุเหตุผลที่ลบล็อต')
      reveal()
      return
    }
    setSubmitting(true)
    try {
      const response = await callApi<{ id: string; lotNumber: string }>(
        apiPath('lot.delete', { id: lot.id }),
        jsonRequest('DELETE', { reason: reason.trim() }),
      )
      if (response.error !== undefined || response.data === undefined) {
        setError(response.error ?? { title: 'ลบล็อตไม่สำเร็จ', message: 'ลองใหม่อีกครั้ง' })
        return
      }
      showToast({ tone: 'success', title: 'ลบล็อตว่างแล้ว', description: lot.lotNumber })
      onDone()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`ลบล็อตว่าง ${lot.lotNumber}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            ยกเลิก
          </Button>
          <Button variant="danger" loading={submitting} onClick={() => void submit()}>
            ยืนยันลบล็อต
          </Button>
        </>
      }
    >
      <div ref={formRef} className="space-y-4">
        <InlineAlert tone="warning" title="ลบแล้วกู้คืนไม่ได้">
          ล็อต {lot.lotNumber} (ใบส่งมอบ {lot.docRef}) จะหายจากรายการล็อตและพอร์ทัลบริษัท · เลขล็อตนี้จะไม่ถูกนำกลับมาใช้
          · ประวัติการลบเก็บไว้ในบันทึกการใช้งาน
        </InlineAlert>

        {error !== null && (
          <InlineAlert tone="error" title={error.title}>
            {error.message}
          </InlineAlert>
        )}

        <Field id={`${fieldId}-reason`} label="เหตุผลที่ลบล็อต" required error={reasonError} hint="บันทึกลงประวัติการใช้งาน">
          <Textarea
            id={`${fieldId}-reason`}
            rows={3}
            value={reason}
            maxLength={LOT_REMOVE_ASSET_REASON_MAX}
            placeholder="เช่น จัดล็อตผิดบริษัท นำเครื่องออกหมดแล้ว"
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
      </div>
    </Modal>
  )
}
