'use client'

import { useEffect, useState } from 'react'
import { FieldCaseDetailBody } from '@/components/field/field-case-detail'
import { IconAlert, IconCalendar } from '@/components/field/field-icons'
import { Button, ErrorState, LoadingState, Modal, Textarea, useToast } from '@/components/ui'
import { apiPath } from '@/lib/api/contract'
import { callApi, jsonRequest, type ApiCallError } from '@/lib/api/types'
import { declineReasonError, reassignmentCountdown } from '@/lib/field/reassignment-ui'
import type { FieldActionResultDto, FieldCaseDetailDto } from '@/lib/field/types'
import { fmtDateTime } from '@/lib/format/datetime'

/**
 * Modal ตอบคำขอเปลี่ยนผู้รับผิดชอบ (`41` §7.8) — **ทางเข้า 3 ทางเปิด modal ตัวเดียวกัน**:
 * auto-popup · ปุ่ม "ตอบคำขอ" บนการ์ดแท็บกำลังติดตาม · ปุ่ม "ตอบคำขอนี้" ในหน้ารายละเอียดเคส
 *
 * - **ยินยอม** → เคสโอนให้คนใหม่ทันที หายจากรายการของเรา (ไฟล์ 40 §8)
 * - **ไม่ยินยอม** → ต้องกรอกเหตุผลก่อนเสมอ (`DECLINE_REASON_REQUIRED`) เคสยังเป็นของเราตามเดิม
 * - หมดเขตแล้ว = job auto-resolve ไปแล้ว ตอบไม่ได้ (`REASSIGNMENT_ALREADY_TIMED_OUT`)
 *
 * ⚠️ ผู้เรียกต้องส่ง `key={caseId}` — state รีเซ็ตด้วยการ remount
 */
export function ReassignmentModal({
  caseId,
  onClose,
  onResponded,
}: {
  caseId: string
  onClose: () => void
  /** เรียกหลังตอบสำเร็จ — ผู้เรียกจดว่าเคสนี้ "ตอบเองแล้ว" + รีโหลดรายการ */
  onResponded: (caseId: string) => void
}) {
  const { showToast } = useToast()
  const [detail, setDetail] = useState<FieldCaseDetailDto | null>(null)
  const [loadError, setLoadError] = useState<ApiCallError | null>(null)
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [now, setNow] = useState<Date>(() => new Date())

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const response = await callApi<FieldCaseDetailDto>(apiPath('field.caseDetail', { id: caseId }))
      if (cancelled) return
      if (response.error !== undefined || response.data === undefined) {
        setLoadError(response.error ?? { title: 'โหลดคำขอไม่สำเร็จ', message: 'กรุณาลองใหม่' })
        return
      }
      setDetail(response.data)
    })()
    return () => {
      cancelled = true
    }
  }, [caseId])

  // นับถอยหลังเวลาหมดเขต — เดินทุก 30 วินาที (ไม่ตั้ง state ตรง ๆ ใน effect)
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const pending = detail?.pendingReassignment ?? null
  const countdown = pending === null ? null : reassignmentCountdown(pending.expiresAt, now)
  const reasonError = declineReasonError(reason)

  async function respond(consent: boolean): Promise<void> {
    if (pending === null) return
    if (!consent && reasonError !== null) return

    setSubmitting(true)
    try {
      const response = await callApi<FieldActionResultDto>(
        apiPath('field.respondReassignment', { id: pending.id }),
        jsonRequest('POST', { consent, declineReason: consent ? null : reason.trim() }),
      )
      if (response.error !== undefined) {
        showToast({ tone: 'error', title: response.error.title, description: response.error.message })
        return
      }

      showToast({
        tone: consent ? 'info' : 'success',
        title: consent ? 'ยินยอมเปลี่ยนผู้รับผิดชอบแล้ว' : 'ไม่ยินยอมแล้ว — เคสยังเป็นของคุณ',
        description: consent ? `เคสนี้โอนให้ ${pending.newAgentName} และจะหายจากรายการของคุณ` : undefined,
      })
      onResponded(caseId)
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="คำขอเปลี่ยนผู้รับผิดชอบ"
      description={detail === null ? undefined : `${detail.debtorName ?? '—'} · ${detail.caseRef}`}
      footer={
        pending === null ? (
          <Button variant="secondary" onClick={onClose}>
            ปิดหน้าต่าง
          </Button>
        ) : declining ? (
          <>
            <Button variant="secondary" onClick={() => setDeclining(false)} disabled={submitting}>
              กลับ
            </Button>
            <Button
              variant="danger"
              onClick={() => void respond(false)}
              loading={submitting}
              disabled={reasonError !== null || countdown?.expired === true}
            >
              ยืนยันไม่ยินยอม
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="secondary"
              onClick={() => setDeclining(true)}
              disabled={submitting || countdown?.expired === true}
            >
              ไม่ยินยอม
            </Button>
            <Button
              variant="success"
              onClick={() => void respond(true)}
              loading={submitting}
              disabled={countdown?.expired === true}
            >
              ยินยอม
            </Button>
          </>
        )
      }
    >
      {loadError !== null ? (
        <ErrorState title={loadError.title} message={loadError.message} code={loadError.code} />
      ) : detail === null ? (
        <LoadingState message="กำลังโหลดคำขอ..." />
      ) : pending === null ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          คำขอนี้ถูกดำเนินการไปแล้ว — ไม่มีอะไรให้ตอบ
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-2xl border-2 border-purple-200 bg-purple-50 p-3.5">
            <div className="flex items-center gap-1.5 text-sm font-extrabold text-purple-700">
              <IconAlert className="h-4 w-4" /> มีคำขอเปลี่ยนผู้รับผิดชอบรออยู่
            </div>
            <div className="mt-1.5 text-sm text-purple-700">
              <strong>{pending.requestedByName}</strong> ขอเปลี่ยนผู้รับผิดชอบเป็น{' '}
              <strong>{pending.newAgentName}</strong>
            </div>
            <div className="mt-1 text-sm text-purple-700">เหตุผล: {pending.reason}</div>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-purple-500">
              <IconCalendar className="h-4 w-4" /> หมดเขตตอบ {fmtDateTime(pending.expiresAt)}
              {countdown !== null && <span className="font-bold">· {countdown.label}</span>}
            </div>
          </div>

          {countdown?.expired === true && (
            <div className="rounded-xl border-2 border-rose-300 bg-rose-50 p-3 text-xs font-bold text-rose-700">
              หมดเขตตอบแล้ว — ระบบจะเปลี่ยนผู้รับผิดชอบให้อัตโนมัติ ตอบคำขอนี้ไม่ได้อีก
            </div>
          )}

          {declining ? (
            <div>
              <label htmlFor="decline-reason" className="mb-1.5 block text-xs font-bold text-slate-600">
                เหตุผลที่ไม่ยินยอม (จำเป็น)
              </label>
              <Textarea
                id="decline-reason"
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="ระบุเหตุผล เช่น กำลังเดินทางไปหาลูกหนี้แล้ว ใกล้ถึงแล้ว"
              />
              {reasonError !== null && <p className="mt-1 text-xs font-bold text-rose-600">{reasonError}</p>}
            </div>
          ) : (
            <p className="text-xs text-slate-400">
              ถ้าไม่ตอบภายในเวลาที่กำหนด ระบบจะเปลี่ยนผู้รับผิดชอบให้อัตโนมัติ
            </p>
          )}

          <FieldCaseDetailBody detail={detail} />
        </div>
      )}
    </Modal>
  )
}
