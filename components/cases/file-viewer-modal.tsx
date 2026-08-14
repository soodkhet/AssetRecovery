'use client'

import { useEffect, useState } from 'react'
import { Button, ErrorState, LoadingState, Modal } from '@/components/ui'
import { isPdfMime } from '@/lib/cases/document-upload'
import type { CaseDocumentDto } from '@/lib/cases/types'
import { signedFileUrl } from '@/lib/cases/upload-client'
import { fmtDateTime } from '@/lib/format/datetime'

/**
 * ตัวเปิดดูไฟล์แนบ (`38` §7.5 — "เอกสารแนบต้องเปิดดูได้จริง")
 * PDF เปิดใน viewer ในตัว · รูปภาพเปิดแบบ lightbox เต็มจอ · ชนิดอื่นให้ดาวน์โหลด
 *
 * bucket เป็น private ⇒ ขอ **signed URL** ตอนเปิดทุกครั้ง (ไม่เก็บลิงก์ถาวรไว้ในหน้า)
 * **shared component** — โมดูล 40/41 ที่ต้องเปิดดูหลักฐานใช้ตัวนี้ซ้ำ
 */
export function FileViewerModal({
  open,
  document,
  onClose,
}: {
  open: boolean
  document: CaseDocumentDto | null
  onClose: () => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  const fileUrl = document?.fileUrl ?? null

  useEffect(() => {
    if (!open || fileUrl === null) return
    let cancelled = false
    void (async () => {
      const signed = await signedFileUrl(fileUrl)
      if (cancelled) return
      setUrl(signed)
      setFailed(signed === null)
    })()
    return () => {
      cancelled = true
    }
  }, [open, fileUrl])

  if (document === null) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={document.originalName}
      description={`แนบโดย ${document.uploadedByName} · ${fmtDateTime(document.uploadedAt)}`}
      footer={
        <>
          {url !== null && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="focus-ring rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              เปิดในแท็บใหม่
            </a>
          )}
          <Button variant="secondary" onClick={onClose}>
            ปิดหน้าต่าง
          </Button>
        </>
      }
    >
      {failed ? (
        <ErrorState title="เปิดไฟล์ไม่สำเร็จ" message="ขอลิงก์ชั่วคราวของไฟล์ไม่ได้ — ลองใหม่อีกครั้ง" />
      ) : url === null ? (
        <LoadingState message="กำลังเตรียมไฟล์..." />
      ) : isPdfMime(document.mimeType) ? (
        <iframe src={url} title={document.originalName} className="h-[70vh] w-full rounded-lg border border-slate-200" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- signed URL ชั่วคราวของ Storage (โดเมนไม่คงที่ ใช้ next/image ไม่ได้)
        <img src={url} alt={document.originalName} className="mx-auto max-h-[70vh] rounded-lg object-contain" />
      )}
    </Modal>
  )
}
