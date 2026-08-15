'use client'

import { useState } from 'react'
import { useSession } from '@/components/auth/permission-provider'
import { requestJobRetry, useJobDetail } from '@/components/jobs/use-jobs'
import { Button, Field, InlineAlert, LoadingState, Modal, RefText, StatusBadge, Textarea } from '@/components/ui'
import { fmtDateTime } from '@/lib/format/datetime'
import { JOB_STATUS_GROUP, JOB_STATUS_LABEL } from '@/lib/jobs/job-state'

/**
 * รายละเอียดงานเบื้องหลัง (`91` §8 — สถานะ / รายละเอียดข้อผิดพลาด / ปุ่ม Retry / ดาวน์โหลดผลลัพธ์)
 *
 * - ปุ่ม "สั่งทำงานใหม่" แสดงเฉพาะ **Superadmin** และเฉพาะงานที่ล้มเหลว/ถูกยกเลิก (`91` §12/§6.2)
 *   — การซ่อนปุ่มเป็นแค่ UX ส่วนการบังคับจริงอยู่ที่ API (DEC-002)
 * - ปุ่มดาวน์โหลดชี้ไป endpoint ของโมดูลเจ้าของไฟล์ ซึ่งตรวจสิทธิ์ของตัวเองอีกครั้งตอนกด
 */
export function JobDetailModal({
  id,
  onClose,
  onRetried,
}: {
  id: string | null
  onClose: () => void
  onRetried: () => void
}) {
  const session = useSession()
  const [refreshToken, setRefreshToken] = useState(0)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [retryError, setRetryError] = useState<{ title: string; message: string } | null>(null)
  const { detail, loading, error } = useJobDetail(id, refreshToken)

  const canRetry =
    session?.isSuperadmin === true && detail !== null && (detail.status === 'failed' || detail.status === 'dead_letter' || detail.status === 'cancelled')

  async function submitRetry(): Promise<void> {
    if (detail === null) return
    setSubmitting(true)
    const failure = await requestJobRetry(detail.id, reason.trim())
    setSubmitting(false)
    if (failure !== null) {
      setRetryError(failure)
      return
    }
    setRetryError(null)
    setReason('')
    setRefreshToken((token) => token + 1)
    onRetried()
  }

  return (
    <Modal
      open={id !== null}
      onClose={onClose}
      size="lg"
      title="รายละเอียดงานเบื้องหลัง"
      description="สถานะ ผลลัพธ์ และสาเหตุที่ล้มเหลวของงานที่ระบบทำให้เบื้องหลัง"
      footer={
        <Button variant="secondary" size="sm" onClick={onClose}>
          ปิด
        </Button>
      }
    >
      {loading && <LoadingState message="กำลังโหลดรายละเอียด..." />}
      {error !== null && (
        <InlineAlert tone="error" title={error.title}>
          {error.message}
        </InlineAlert>
      )}

      {!loading && detail !== null && (
        <div className="space-y-5">
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Item label="ประเภทงาน">{detail.jobTypeLabel}</Item>
            <Item label="สถานะ">
              <StatusBadge group={JOB_STATUS_GROUP[detail.status]} label={JOB_STATUS_LABEL[detail.status]} />
              <span className="ml-2 text-xs text-slate-500">
                ทำใหม่ไปแล้ว {detail.retryCount}/{detail.maxRetries} ครั้ง
              </span>
            </Item>
            <Item label="ผู้สั่งงาน">{detail.createdByName ?? 'ระบบ (ตัวตั้งเวลา)'}</Item>
            <Item label="รหัสงาน">
              <RefText>{detail.id}</RefText>
            </Item>
            <Item label="สร้างเมื่อ">{fmtDateTime(detail.createdAt)}</Item>
            <Item label="เริ่มทำเมื่อ">{detail.startedAt === null ? '—' : fmtDateTime(detail.startedAt)}</Item>
            <Item label="ถึงคิวเมื่อ">{detail.scheduledAt === null ? 'ทันที' : fmtDateTime(detail.scheduledAt)}</Item>
            <Item label="จบเมื่อ">{detail.completedAt === null ? '—' : fmtDateTime(detail.completedAt)}</Item>
          </dl>

          {detail.errorMessage !== null && (
            <InlineAlert tone="error" title="สาเหตุที่ทำงานไม่สำเร็จ">
              {detail.errorMessage}
            </InlineAlert>
          )}

          {detail.output !== null && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">ไฟล์ผลลัพธ์ (เก็บเป็นเวอร์ชัน ห้ามเขียนทับ — `91` §10)</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <a
                  href={detail.output.href}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
                >
                  ดาวน์โหลด{detail.output.label}
                </a>
                {detail.output.fileName !== null && (
                  <RefText className="text-xs">{detail.output.fileName}</RefText>
                )}
                {detail.output.version !== null && (
                  <span className="text-xs text-slate-500">เวอร์ชัน {detail.output.version}</span>
                )}
              </div>
              {detail.output.fileHash !== null && (
                <p className="mt-2 font-mono text-[11px] break-all text-slate-400">SHA-256 {detail.output.fileHash}</p>
              )}
            </div>
          )}

          <JsonBlock label="ข้อมูลนำเข้า (payload)" value={detail.payload} />
          <JsonBlock label="ผลลัพธ์ (result)" value={detail.result} />

          {canRetry && (
            <div className="space-y-3 rounded-lg border border-slate-200 p-3">
              <p className="text-sm font-semibold text-slate-900">สั่งทำงานใหม่</p>
              <p className="text-xs text-slate-500">
                งานจะถูกคืนเข้าคิวและถูกหยิบไปทำในรอบถัดไปของตัวตั้งเวลา — ต้องระบุเหตุผลเพื่อบันทึกลง
                บันทึกการใช้งาน (`91` §12)
              </p>
              {retryError !== null && (
                <InlineAlert tone="error" title={retryError.title}>
                  {retryError.message}
                </InlineAlert>
              )}
              <Field label="เหตุผล">
                <Textarea
                  rows={2}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="เช่น ปลายทางล่มชั่วคราว แก้ไขแล้วจึงสั่งทำใหม่"
                />
              </Field>
              <Button size="sm" disabled={submitting || reason.trim().length < 5} onClick={() => void submitRetry()}>
                {submitting ? 'กำลังสั่งงาน...' : 'สั่งทำงานใหม่'}
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-800">{children}</dd>
    </div>
  )
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  const text = value === null || value === undefined ? '—' : JSON.stringify(value, null, 2)
  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold text-slate-900">{label}</h3>
      <pre className="max-h-56 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-[11px] break-all whitespace-pre-wrap text-slate-600">
        {text}
      </pre>
    </div>
  )
}
