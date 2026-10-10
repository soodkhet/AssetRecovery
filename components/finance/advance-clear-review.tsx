'use client'

import { useState } from 'react'
import { ReasonConfirmModal } from '@/components/settings/reason-confirm-modal'
import { Button, ConfirmModal, useToast } from '@/components/ui'
import { StoredFileButton } from '@/components/uploads/stored-file-button'
import { canReviewAdvanceClear } from '@/lib/advances/advance-ui'
import type { AdvanceDto } from '@/lib/advances/types'
import { callApi, jsonRequest } from '@/lib/api/types'

/**
 * การเงินตรวจการเคลียร์เงินทดรอง (staging E-012 · มติ PO 10/10/2569) — เปิดดูใบเสร็จที่แนบตอนเคลียร์ ·
 * "ตรวจแล้ว" (ประทับผู้ตรวจ ไม่เปลี่ยนสถานะ) · "ตีกลับการเคลียร์" (เหตุผลบังคับ ⇒ กลับรอเคลียร์ + แจ้งผู้ขอ)
 * ปุ่มเป็น UX — API ตรวจสิทธิ์/สถานะ/รายการต่อเนื่องซ้ำเสมอ
 */
export function AdvanceClearReviewActions({
  advance,
  canManage,
  onChanged,
}: {
  advance: AdvanceDto
  canManage: boolean
  onChanged: () => void
}) {
  const { showToast } = useToast()
  const [mode, setMode] = useState<'review' | 'reopen' | null>(null)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const reviewable = canManage && canReviewAdvanceClear(advance)

  async function submit(action: 'review' | 'reopen'): Promise<void> {
    setSaving(true)
    const result = await callApi<AdvanceDto>(
      `/api/advances/${advance.id}/${action === 'review' ? 'clear-review' : 'reopen-clear'}`,
      jsonRequest('PATCH', action === 'review' ? { note: null } : { reason: reason.trim() }),
    )
    setSaving(false)
    if (result.error !== undefined) {
      showToast({ tone: 'error', title: result.error.title, description: result.error.message })
      return
    }
    showToast(
      action === 'review'
        ? { tone: 'success', title: 'ตรวจการเคลียร์แล้ว', description: advance.ref }
        : { tone: 'success', title: 'ตีกลับการเคลียร์แล้ว', description: `${advance.ref} กลับไปรอเคลียร์ยอด — แจ้งผู้ขอแล้ว` },
    )
    setMode(null)
    setReason('')
    onChanged()
  }

  if (advance.receiptFileUrl === null && !reviewable) return null

  return (
    <>
      {advance.receiptFileUrl !== null && (
        <StoredFileButton path={advance.receiptFileUrl} label="เปิดดูใบเสร็จ" title={`ใบเสร็จเคลียร์ยอด ${advance.ref}`} />
      )}
      {reviewable && (
        <>
          <Button size="sm" variant="success" onClick={() => setMode('review')}>
            ตรวจแล้ว
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMode('reopen')}>
            ตีกลับการเคลียร์
          </Button>
        </>
      )}

      <ConfirmModal
        open={mode === 'review'}
        onClose={() => setMode(null)}
        onConfirm={() => void submit('review')}
        title={`ยืนยันว่าตรวจการเคลียร์ ${advance.ref} แล้ว?`}
        description="ตรวจยอดใช้จริง ใบเสร็จ และใบรับรองแทนใบเสร็จแล้ว — หลังยืนยันจะตีกลับการเคลียร์นี้ไม่ได้ (แก้ยอดผ่านรายการปรับปรุง)"
        confirmLabel="ยืนยันตรวจแล้ว"
        confirmVariant="primary"
        loading={saving}
      />
      <ReasonConfirmModal
        open={mode === 'reopen'}
        title={`ตีกลับการเคลียร์ ${advance.ref}`}
        description="เงินทดรองกลับไปรอเคลียร์ยอด · ยอดใช้จริงและใบเสร็จเดิมถูกล้าง · คำขอเบิกส่วนเกินที่ยังไม่อนุมัติถูกยกเลิก · ผู้ขอได้รับแจ้งพร้อมเหตุผล"
        confirmLabel="ตีกลับการเคลียร์"
        loading={saving}
        reason={reason}
        onReasonChange={setReason}
        onClose={() => {
          setMode(null)
          setReason('')
        }}
        onConfirm={() => void submit('reopen')}
        placeholder="เช่น ใบเสร็จไม่ชัด/ยอดใช้จริงไม่ตรงใบเสร็จ — ให้แนบใบเสร็จที่อ่านได้แล้วเคลียร์ใหม่"
        maxLength={500}
      />
    </>
  )
}
