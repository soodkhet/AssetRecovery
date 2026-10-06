'use client'

import { useRef, useState } from 'react'
import { StatusBadge, useToast } from '@/components/ui'
import { callApi, jsonRequest } from '@/lib/api/types'
import { EXPENSE_RECEIPT_ACCEPT } from '@/lib/field/media-upload'
import { fmtDateTime } from '@/lib/format/datetime'
import { fmtSatangSymbol } from '@/lib/format/money'
import {
  SUBSTITUTE_RECEIPT_STATUS_LABEL,
  substituteReceiptBadgeText,
  substituteReceiptStatusBadgeGroup,
} from '@/lib/substitute-receipts/substitute-receipt'
import type { SubstituteReceiptRefDto } from '@/lib/substitute-receipts/types'
import { StorageUploadError, uploadToStorage } from '@/lib/uploads/client'

/**
 * แถบใบรับรองแทนใบเสร็จรับเงิน (มติ PO U103) — ป้าย "ใบรับรองแทนใบเสร็จ CRT-…" + สถานะ + ปุ่มดาวน์โหลด PDF
 * + อัปโหลดฉบับเซ็นแล้ว (เฉพาะ `canUpload` และยังรอฉบับเซ็น) · ใช้ร่วมรายการเบิก/เงินทดรอง/คิวอนุมัติ
 * (Field Tracker Mobile/Desktop ใช้ component เดียวกัน) — สิทธิ์จริงตรวจที่ API (UI ซ่อนปุ่มเป็น UX เท่านั้น)
 */
export function SubstituteReceiptPanel({
  receipt,
  canUpload = false,
  compact = false,
  onSigned,
}: {
  receipt: SubstituteReceiptRefDto
  canUpload?: boolean
  /** แบบย่อในตาราง — แสดงแค่ป้าย + ลิงก์ */
  compact?: boolean
  onSigned?: (receipt: SubstituteReceiptRefDto) => void
}) {
  const { showToast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const pending = receipt.status === 'pending_signature'

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

  return (
    <div className={compact ? 'mt-1 space-y-0.5' : 'mt-2 space-y-1.5 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2'}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[11px] font-semibold text-slate-700">{substituteReceiptBadgeText(receipt.receiptNumber)}</span>
        <StatusBadge
          status={receipt.status}
          group={substituteReceiptStatusBadgeGroup(receipt.status)}
          label={SUBSTITUTE_RECEIPT_STATUS_LABEL[receipt.status]}
        />
      </div>
      {!compact && (
        <p className="text-[11px] text-slate-600">
          ยอด {fmtSatangSymbol(receipt.totalSatang)}
          {receipt.signedAt !== null ? ` · อัปโหลดฉบับเซ็น ${fmtDateTime(receipt.signedAt)}` : ' · ดาวน์โหลดไปเซ็นแล้วอัปโหลดกลับเพื่อใช้แทนใบเสร็จ'}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={`/api/substitute-receipts/${receipt.id}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="focus-ring text-[11px] font-semibold text-emerald-700 underline"
        >
          ดาวน์โหลดใบรับรอง PDF
        </a>
        {canUpload && pending && (
          <>
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="focus-ring text-[11px] font-semibold text-slate-700 underline disabled:opacity-50"
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
      </div>
    </div>
  )
}
