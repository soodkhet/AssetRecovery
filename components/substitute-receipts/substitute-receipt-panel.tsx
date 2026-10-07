'use client'

import { useRef, useState } from 'react'
import { NoReceiptLinesEditor } from '@/components/substitute-receipts/no-receipt-lines'
import { Button, ConfirmModal, Field, InlineAlert, Modal, StatusBadge, Textarea, useToast } from '@/components/ui'
import { callApi, jsonRequest } from '@/lib/api/types'
import { EXPENSE_RECEIPT_ACCEPT } from '@/lib/field/media-upload'
import { fmtDateTime } from '@/lib/format/datetime'
import { fmtSatangSymbol } from '@/lib/format/money'
import { substituteDraftPayload, substituteLinesToDrafts, type SubstituteLineDraft } from '@/lib/substitute-receipts/form'
import {
  SUBSTITUTE_RECEIPT_CANCEL_REASON_MIN,
  SUBSTITUTE_RECEIPT_STATUS_LABEL,
  substituteReceiptBadgeText,
  substituteReceiptStatusBadgeGroup,
} from '@/lib/substitute-receipts/substitute-receipt'
import type { SubstituteReceiptDetailDto, SubstituteReceiptRefDto } from '@/lib/substitute-receipts/types'
import { StorageUploadError, uploadToStorage } from '@/lib/uploads/client'

/**
 * แถบใบรับรองแทนใบเสร็จรับเงิน (มติ PO U103) — ป้าย "ใบรับรองแทนใบเสร็จ CRT-…" + สถานะ + ปุ่มดาวน์โหลด PDF
 * + อัปโหลดฉบับเซ็นแล้ว (เฉพาะ `canUpload` และยังรอฉบับเซ็น) · ใช้ร่วมรายการเบิก/เงินทดรอง/คิวอนุมัติ
 * (Field Tracker Mobile/Desktop ใช้ component เดียวกัน) — สิทธิ์จริงตรวจที่ API (UI ซ่อนปุ่มเป็น UX เท่านั้น)
 *
 * มติ PO U107 — `canCancel`: ปุ่ม "ยกเลิกใบ" (modal destructive + เหตุผลบังคับ) และเมื่อยกเลิกแล้ว ปุ่ม
 * "ออกใบใหม่แทน" (กรอกรายการชุดใหม่) · ผู้เรียกส่ง `canCancel` เฉพาะรายการที่ยังไม่อนุมัติจ่าย (server ปัดซ้ำเสมอ)
 */
export function SubstituteReceiptPanel({
  receipt,
  canUpload = false,
  canCancel = false,
  compact = false,
  defaultLineDate,
  onSigned,
  onChanged,
}: {
  receipt: SubstituteReceiptRefDto
  canUpload?: boolean
  /** มติ PO U107 — แสดงปุ่มยกเลิก/ออกใบใหม่แทน */
  canCancel?: boolean
  /** แบบย่อในตาราง — แสดงแค่ป้าย + ลิงก์ */
  compact?: boolean
  /** วันที่ตั้งต้นของบรรทัดใบใหม่ (`YYYY-MM-DD`) — ไม่ส่ง = วันที่ออกใบเดิม */
  defaultLineDate?: string
  onSigned?: (receipt: SubstituteReceiptRefDto) => void
  /** หลังยกเลิก/ออกใบใหม่สำเร็จ — ผู้เรียกโหลดรายการใหม่ */
  onChanged?: (receipt: SubstituteReceiptRefDto) => void
}) {
  const { showToast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [reissueOpen, setReissueOpen] = useState(false)
  const [reissueLines, setReissueLines] = useState<SubstituteLineDraft[]>([])
  const [reissueError, setReissueError] = useState<string | null>(null)
  const [reissuing, setReissuing] = useState(false)
  const [loadingLines, setLoadingLines] = useState(false)
  const pending = receipt.status === 'pending_signature'
  const cancelled = receipt.status === 'cancelled'
  const lineDate = defaultLineDate ?? receipt.issueDate

  async function upload(file: File): Promise<void> {
    setUploading(true)
    try {
      const signedFilePath = await uploadToStorage({ kind: 'substitute_receipt', substituteReceiptId: receipt.id }, file)
      const result = await callApi<SubstituteReceiptRefDto>(
        `/api/substitute-receipts/${receipt.id}/signed`,
        jsonRequest('POST', { signedFilePath }),
      )
      if (result.error !== undefined || result.data === undefined) {
        showToast({
          tone: 'error',
          title: result.error?.title ?? 'อัปโหลดฉบับเซ็นไม่สำเร็จ',
          description: result.error?.message,
        })
        return
      }
      showToast({ tone: 'success', title: `อัปโหลดใบรับรอง ${receipt.receiptNumber} ฉบับเซ็นแล้ว` })
      onSigned?.(result.data)
    } catch (error) {
      showToast({
        tone: 'error',
        title: 'อัปโหลดฉบับเซ็นไม่สำเร็จ',
        description: error instanceof StorageUploadError ? error.message : 'ลองใหม่อีกครั้ง',
      })
    } finally {
      setUploading(false)
      if (fileRef.current !== null) fileRef.current.value = ''
    }
  }

  async function confirmCancel(): Promise<void> {
    setCancelling(true)
    try {
      const result = await callApi<SubstituteReceiptRefDto>(
        `/api/substitute-receipts/${receipt.id}/cancel`,
        jsonRequest('POST', { reason: cancelReason.trim() }),
      )
      if (result.error !== undefined || result.data === undefined) {
        showToast({ tone: 'error', title: result.error?.title ?? 'ยกเลิกใบไม่สำเร็จ', description: result.error?.message })
        return
      }
      showToast({ tone: 'success', title: `ยกเลิกใบรับรอง ${receipt.receiptNumber} แล้ว` })
      setCancelOpen(false)
      setCancelReason('')
      onChanged?.(result.data)
    } finally {
      setCancelling(false)
    }
  }

  // มติ PO U117 ข้อ 1 — ตั้งต้นด้วยรายการ/ยอดของใบที่ยกเลิก (แก้ได้) · โหลดไม่ได้ = บรรทัดว่าง
  async function openReissue(): Promise<void> {
    setReissueError(null)
    setLoadingLines(true)
    setReissueOpen(true)
    try {
      const result = await callApi<SubstituteReceiptDetailDto>(`/api/substitute-receipts/${receipt.id}`)
      setReissueLines(substituteLinesToDrafts(result.data?.lines ?? [], lineDate))
      if (result.error !== undefined) setReissueError(`ดึงรายการจากใบเดิมไม่ได้ — กรอกรายการใหม่ (${result.error.message})`)
    } finally {
      setLoadingLines(false)
    }
  }

  async function confirmReissue(): Promise<void> {
    const draft = substituteDraftPayload(reissueLines)
    if (draft.payload === null) {
      setReissueError(draft.error)
      return
    }
    setReissueError(null)
    setReissuing(true)
    try {
      const result = await callApi<SubstituteReceiptRefDto>(
        `/api/substitute-receipts/${receipt.id}/reissue`,
        jsonRequest('POST', draft.payload),
      )
      if (result.error !== undefined || result.data === undefined) {
        setReissueError(result.error?.message ?? 'ออกใบใหม่ไม่สำเร็จ')
        return
      }
      showToast({
        tone: 'success',
        title: `ออกใบรับรอง ${result.data.receiptNumber} แทนใบ ${receipt.receiptNumber} แล้ว`,
        description: 'ดาวน์โหลดไปเซ็นแล้วอัปโหลดฉบับเซ็นจากรายการเดิม',
      })
      setReissueOpen(false)
      onChanged?.(result.data)
    } finally {
      setReissuing(false)
    }
  }

  const reasonTooShort = cancelReason.trim().length < SUBSTITUTE_RECEIPT_CANCEL_REASON_MIN

  return (
    <div
      className={
        compact
          ? 'mt-1 space-y-0.5'
          : `mt-2 space-y-1.5 rounded-lg border px-3 py-2 ${cancelled ? 'border-slate-200 bg-slate-50' : 'border-amber-200 bg-amber-50/60'}`
      }
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`font-mono text-[11px] font-semibold ${cancelled ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
          {substituteReceiptBadgeText(receipt.receiptNumber)}
        </span>
        <StatusBadge
          status={receipt.status}
          group={substituteReceiptStatusBadgeGroup(receipt.status)}
          label={SUBSTITUTE_RECEIPT_STATUS_LABEL[receipt.status]}
        />
      </div>
      {receipt.replacesReceiptNumber !== null && (
        <p className="text-[11px] text-slate-500">
          ออกแทนเลขที่ <span className="font-mono">{receipt.replacesReceiptNumber}</span>
        </p>
      )}
      {!compact && (
        <p className="text-[11px] text-slate-600">
          ยอด {fmtSatangSymbol(receipt.totalSatang)}
          {cancelled
            ? ` · ยกเลิกเมื่อ ${receipt.cancelledAt === null ? '-' : fmtDateTime(receipt.cancelledAt)} · เหตุผล: ${receipt.cancelReason ?? '-'}`
            : receipt.signedAt !== null
              ? ` · อัปโหลดฉบับเซ็น ${fmtDateTime(receipt.signedAt)}`
              : ' · ดาวน์โหลดไปเซ็นแล้วอัปโหลดกลับเพื่อใช้แทนใบเสร็จ'}
        </p>
      )}
      {/* preship R2-027 — ลิงก์/ปุ่มเอกสาร ≥44px บนจอสัมผัส (แบบลิงก์เอกสารเงินทดรอง) */}
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={`/api/substitute-receipts/${receipt.id}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="focus-ring text-[11px] font-semibold text-emerald-700 underline inline-flex items-center pointer-coarse:min-h-11 pointer-coarse:px-1"
        >
          ดาวน์โหลดใบรับรอง PDF
        </a>
        {canUpload && pending && (
          <>
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="focus-ring text-[11px] font-semibold text-slate-700 underline disabled:opacity-50 inline-flex items-center pointer-coarse:min-h-11 pointer-coarse:px-1"
            >
              {uploading ? 'กำลังอัปโหลด...' : 'อัปโหลดฉบับเซ็นแล้ว'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept={EXPENSE_RECEIPT_ACCEPT}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file !== undefined) void upload(file)
              }}
            />
          </>
        )}
        {canCancel && !cancelled && (
          <button
            type="button"
            onClick={() => setCancelOpen(true)}
            className="focus-ring text-[11px] font-semibold text-red-700 underline inline-flex items-center pointer-coarse:min-h-11 pointer-coarse:px-1"
          >
            ยกเลิกใบรับรอง
          </button>
        )}
        {canCancel && cancelled && (
          <button
            type="button"
            onClick={() => void openReissue()}
            className="focus-ring text-[11px] font-semibold text-slate-700 underline inline-flex items-center pointer-coarse:min-h-11 pointer-coarse:px-1"
          >
            ออกใบใหม่แทน
          </button>
        )}
      </div>

      {receipt.cancelledHistory.length > 0 && (
        <ul className="space-y-0.5 border-t border-slate-200 pt-1" aria-label="ใบรับรองที่ยกเลิกแล้ว">
          {receipt.cancelledHistory.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
              <span className="font-mono text-slate-400 line-through">{substituteReceiptBadgeText(entry.receiptNumber)}</span>
              <StatusBadge
                status="cancelled"
                group={substituteReceiptStatusBadgeGroup('cancelled')}
                label={SUBSTITUTE_RECEIPT_STATUS_LABEL.cancelled}
              />
              {!compact && (
                <span>
                  {fmtSatangSymbol(entry.totalSatang)}
                  {entry.cancelledAt !== null && ` · ยกเลิกเมื่อ ${fmtDateTime(entry.cancelledAt)}`}
                  {entry.cancelReason !== null && ` · เหตุผล: ${entry.cancelReason}`}
                </span>
              )}
              <a
                href={`/api/substitute-receipts/${entry.id}/pdf`}
                target="_blank"
                rel="noreferrer"
                className="focus-ring text-emerald-700 underline inline-flex items-center pointer-coarse:min-h-11 pointer-coarse:px-1"
              >
                PDF
              </a>
            </li>
          ))}
        </ul>
      )}

      <ConfirmModal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => void confirmCancel()}
        title={`ยกเลิกใบรับรอง ${receipt.receiptNumber}`}
        description="ใบเดิมจะถูกเก็บไว้พร้อมป้าย “ยกเลิก” (ลบไม่ได้) ใช้แทนใบเสร็จไม่ได้อีก และไม่นับเพดานต่อเดือน — ออกใบใหม่แทนได้หลังยกเลิก"
        confirmLabel="ยืนยันยกเลิกใบรับรอง"
        cancelLabel="ไม่ยกเลิก"
        loading={cancelling}
        confirmDisabled={reasonTooShort}
      >
        <Field id={`cancel-reason-${receipt.id}`} label="เหตุผลการยกเลิก (บังคับ)">
          <Textarea
            id={`cancel-reason-${receipt.id}`}
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
            rows={3}
            placeholder="เช่น กรอกรายการผิด / ได้ใบเสร็จจริงมาแล้ว"
          />
        </Field>
      </ConfirmModal>

      <Modal
        open={reissueOpen}
        onClose={() => setReissueOpen(false)}
        title={`ออกใบรับรองแทนใบเสร็จใหม่ แทนใบ ${receipt.receiptNumber}`}
        description="ตั้งต้นด้วยรายการจากใบที่ยกเลิก แก้ได้ก่อนออก — ระบบออกเลขใหม่ ผูกกับรายการเดิม และพิมพ์ “ออกแทนเลขที่” บนใบใหม่ · เพดานต่อใบ/ต่อเดือนตรวจใหม่ (ใบที่ยกเลิกไม่นับแล้ว)"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setReissueOpen(false)}>
              ปิด
            </Button>
            <Button onClick={() => void confirmReissue()} loading={reissuing} disabled={loadingLines}>
              ออกใบรับรองใหม่
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {reissueError !== null && <InlineAlert tone="error" title={reissueError} />}
          {loadingLines ? (
            <p className="text-xs text-slate-500">กำลังดึงรายการจากใบ {receipt.receiptNumber}...</p>
          ) : (
            <NoReceiptLinesEditor lines={reissueLines} onChange={setReissueLines} defaultDate={lineDate} />
          )}
        </div>
      </Modal>
    </div>
  )
}
