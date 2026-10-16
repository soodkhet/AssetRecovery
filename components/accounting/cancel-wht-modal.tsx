'use client'

import { useId, useState } from 'react'
import { Button, Field, InlineAlert, Modal, ModalCancelButton, Textarea, useToast } from '@/components/ui'
import { callApi, jsonRequest } from '@/lib/api/types'
import { fmtDate } from '@/lib/format/datetime'
import { fmtSatangSymbol } from '@/lib/format/money'
import type { WhtCertificateDto } from '@/lib/wht/types'
import { WHT_FILING_FORM_SHORT_LABEL } from '@/lib/wht/wht'

/**
 * Modal "ยกเลิกหนังสือรับรอง" (`33` §10 · mockup `accounting.html` `cancel-wht-cert`)
 *
 * เหตุผลบังคับกรอก (`WHT_CANCEL_REQUIRES_REASON`) · ยกเลิกเป็น **terminal** ห้ามลบ/ย้อนกลับ
 * · ติ๊ก "ออกใบแทนทันที" = ระบบออกใบใหม่ในทรานแซกชันเดียวกันพร้อมอ้างกลับฉบับนี้ (`33` §9)
 */
export function CancelWhtModal({
  certificate,
  onClose,
  onCancelled,
}: {
  certificate: WhtCertificateDto | null
  onClose: () => void
  onCancelled: () => void
}) {
  // id ผูก label ↔ ช่อง + aria-invalid/aria-describedby ผ่าน `<Field id>` (ตรวจซ้ำ staging SV5-R9-01)
  const fieldId = useId()
  const { showToast } = useToast()
  const [reason, setReason] = useState('')
  const [reissue, setReissue] = useState(false)
  const [saving, setSaving] = useState(false)

  if (certificate === null) return null

  const ready = reason.trim() !== ''

  async function submit(): Promise<void> {
    if (!ready || certificate === null) return
    setSaving(true)
    const result = await callApi<{ replacement: WhtCertificateDto | null }>(
      `/api/accounting/wht-certificates/${certificate.id}/cancel`,
      jsonRequest('PATCH', { reason: reason.trim(), reissue }),
    )
    setSaving(false)

    if (result.error !== undefined) {
      showToast({ tone: 'error', title: result.error.title, description: result.error.message })
      return
    }
    const replacement = result.data?.replacement ?? null
    showToast({
      tone: 'success',
      title: `ยกเลิก ${certificate.certificateNumber} แล้ว`,
      description:
        replacement === null
          ? 'ยอดของใบนี้ถูกตัดออกจาก ภ.ง.ด.1/3/53 ของรอบแล้ว'
          : `ออกใบแทนเลขที่ ${replacement.certificateNumber} เรียบร้อย`,
    })
    onCancelled()
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`ยกเลิกหนังสือรับรอง — ${certificate.certificateNumber}`}
      description="ใบที่ยกเลิกยังเก็บไว้เป็นหลักฐาน แต่ยอดจะไม่ถูกนับในแบบ ภ.ง.ด. ของรอบอีก"
      footer={
        <>
          <ModalCancelButton onClose={onClose}>
            ปิด
          </ModalCancelButton>
          <Button variant="danger" loading={saving} disabled={!ready} onClick={() => void submit()}>
            ยืนยันยกเลิก
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-400">ผู้ถูกหัก:</span>
            <span className="font-semibold">{certificate.payeeName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">วันที่จ่าย / แบบ:</span>
            <span className="font-mono">
              {fmtDate(certificate.paymentDate)} · {WHT_FILING_FORM_SHORT_LABEL[certificate.filingForm]}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">ยอด WHT:</span>
            <span className="font-bold text-rose-600">{fmtSatangSymbol(certificate.whtSatang)}</span>
          </div>
        </div>

        <Field id={`${fieldId}-reason`} label="เหตุผลการยกเลิก" required hint="บังคับกรอก — บันทึกลงเอกสารและประวัติการใช้งาน">
          <Textarea
            id={`${fieldId}-reason`}
            maxLength={1000}
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="เช่น ฐานหักผิด / ข้อมูลผู้ถูกหักผิด"
          />
        </Field>

        <label className="flex items-start gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            className="focus-ring mt-0.5 h-4 w-4 rounded border-slate-300"
            checked={reissue}
            onChange={(event) => setReissue(event.target.checked)}
          />
          <span>
            {/* ใบใหม่อ้างกลับด้วย `replaces_certificate_id` — ชื่อคอลัมน์ไม่แสดงบนจอ (UAT R7cv3-B05) */}
            ออกใบแทนทันทีด้วยข้อมูลปัจจุบัน — ใบใหม่จะได้เลขที่ถัดไปและอ้างกลับฉบับนี้
          </span>
        </label>

        <InlineAlert tone="error" title="การยกเลิกเป็นสถานะสุดท้าย">
          ห้ามลบและห้ามย้อนกลับ — ยอดของใบนี้จะไม่ถูกนับใน ภ.ง.ด.1/3/53 ของรอบทันที
        </InlineAlert>
      </div>
    </Modal>
  )
}
