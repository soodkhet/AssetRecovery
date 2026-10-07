'use client'

import { useEffect, useState } from 'react'
import { Button, ErrorState, LoadingState, Modal } from '@/components/ui'
import { buttonClass } from '@/components/ui/button'
import { isPdfMime } from '@/lib/cases/document-upload'
import { signedFileUrl } from '@/lib/cases/upload-client'
import { fmtDateTime } from '@/lib/format/datetime'

/**
 * ไฟล์ที่เปิดดูได้ — โครงร่วมที่น้อยที่สุด เพื่อให้ DTO ของแต่ละโมดูลเสียบได้ตรง ๆ
 * (`CaseDocumentDto` ของไฟล์ 38 · `FieldDocumentDto` ของไฟล์ 41 ที่ไม่มีข้อมูลผู้อัปโหลด)
 */
export interface ViewableFile {
  fileUrl: string
  originalName: string
  mimeType: string
  uploadedByName?: string
  uploadedAt?: string
}

/**
 * ตัวแสดง PDF ของ browser ดึง focus เข้า iframe หลังโหลด ⇒ คีย์ Esc ไปค้างใน iframe ไม่ถึงตัวปิดของ Modal
 * (preship R5-010) — คืน focus ให้แผง modal ถ้า focus ยังอยู่ใน iframe นั้น (ผู้ใช้คลิกเข้าไปเลื่อนเองทีหลังได้ตามปกติ)
 * ตัวแสดงบางตัวดึง focus ช้ากว่า load เล็กน้อย จึงตรวจซ้ำอีกสองครั้งในช่วงสั้น ๆ
 */
function returnFocusFromViewer(frame: HTMLIFrameElement): void {
  const panel = frame.closest<HTMLElement>('[role="dialog"]')
  if (panel === null) return
  const restore = () => {
    if (frame.isConnected && window.document.activeElement === frame) panel.focus()
  }
  restore()
  for (const delay of [150, 600]) window.setTimeout(restore, delay)
}

/**
 * ตัวเปิดดูไฟล์แนบ (`38` §7.5 — "เอกสารแนบต้องเปิดดูได้จริง")
 * PDF เปิดใน viewer ในตัว · รูปภาพเปิดแบบ lightbox เต็มจอ · วิดีโอ/เสียงเล่นในหน้า · ชนิดอื่นให้ดาวน์โหลด
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
  document: ViewableFile | null
  onClose: () => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  // ปุ่ม "ลองใหม่" บน ErrorState — เพิ่มตัวนับให้ effect ขอลิงก์ใหม่ (R3-027)
  const [retryKey, setRetryKey] = useState(0)

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
  }, [open, fileUrl, retryKey])

  if (document === null) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={document.originalName}
      description={
        document.uploadedByName === undefined
          ? undefined
          : `แนบโดย ${document.uploadedByName} · ${fmtDateTime(document.uploadedAt)}`
      }
      footer={
        <>
          {url !== null && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className={buttonClass('secondary')}
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
        <ErrorState
          title="เปิดไฟล์ไม่สำเร็จ"
          message="ขอลิงก์ชั่วคราวของไฟล์ไม่ได้ — ลองใหม่อีกครั้ง"
          onRetry={() => {
            setFailed(false)
            setUrl(null)
            setRetryKey((key) => key + 1)
          }}
        />
      ) : url === null ? (
        <LoadingState message="กำลังเตรียมไฟล์..." />
      ) : isPdfMime(document.mimeType) ? (
        <iframe
          src={url}
          title={document.originalName}
          onLoad={(event) => returnFocusFromViewer(event.currentTarget)}
          className="h-[70vh] w-full rounded-lg border border-slate-200"
        />
      ) : document.mimeType.startsWith('video/') ? (
        // หลักฐานวิดีโอปิดงาน (UAT BUG-045) — เล่นในหน้าได้เลย
        <video src={url} controls className="mx-auto max-h-[70vh] w-full rounded-lg bg-black" />
      ) : document.mimeType.startsWith('audio/') ? (
        <audio src={url} controls className="w-full" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- signed URL ชั่วคราวของ Storage (โดเมนไม่คงที่ ใช้ next/image ไม่ได้)
        <img src={url} alt={document.originalName} className="mx-auto max-h-[70vh] rounded-lg object-contain" />
      )}
    </Modal>
  )
}
