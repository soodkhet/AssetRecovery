'use client'

import { useState } from 'react'
import { Button, cn } from '@/components/ui'
import { readEnvelope } from '@/lib/api/envelope'
import { downloadFile } from '@/lib/imports/download-client'
import { fileNameFromDisposition, portalLotDownloadApiUrl, portalLotDownloadState } from '@/lib/portal/handover-view'

/**
 * ปุ่ม "ดาวน์โหลดใบเซ็นรับ" ของล็อต (`97` §6.4/§18 · มติ O43 D8)
 *
 * - ไม่มีสิทธิ์ดาวน์โหลด (`portal_download`) ⇒ ไม่ render เลย
 * - ล็อตยังไม่ยืนยัน ⇒ disabled + คำอธิบายใต้ปุ่ม (ปุ่มที่ disabled ไม่รับ hover จึงไม่พึ่ง tooltip)
 * - ดาวน์โหลดผ่าน `fetch` เพื่อแสดงข้อผิดพลาดจาก API เป็นภาษาไทยได้ (เปิดลิงก์ตรงจะเห็น JSON ดิบ)
 * - backend ยังตรวจสิทธิ์/สถานะซ้ำทุกครั้ง — ปุ่มนี้เป็นแค่ UX (DEC-002)
 */
export function HandoverDownloadButton({
  lotId,
  docRef,
  downloadable,
  canDownload,
  block = false,
}: {
  lotId: string
  docRef: string
  downloadable: boolean
  canDownload: boolean
  /** เต็มความกว้าง (การ์ด) */
  block?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const state = portalLotDownloadState({ downloadable, canDownload })
  if (!state.visible) return null

  async function download() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(portalLotDownloadApiUrl(lotId), { cache: 'no-store' })
      const contentType = response.headers.get('content-type') ?? ''
      if (response.ok && !contentType.includes('application/json')) {
        const bytes = await response.arrayBuffer()
        downloadFile(
          fileNameFromDisposition(response.headers.get('content-disposition'), `${docRef}-signed.pdf`),
          bytes,
          contentType === '' ? 'application/octet-stream' : contentType,
        )
        return
      }
      const envelope = readEnvelope<unknown>(await response.json().catch(() => null), false)
      setError(envelope.success ? 'ดาวน์โหลดไม่สำเร็จ กรุณาลองใหม่' : envelope.error.message)
    } catch {
      setError('เชื่อมต่อไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={cn(block && 'w-full')}>
      <Button
        variant={state.enabled ? 'info' : 'secondary'}
        disabled={!state.enabled}
        loading={busy}
        onClick={(event) => {
          event.stopPropagation()
          void download()
        }}
        fullWidth={block}
        aria-describedby={state.enabled ? undefined : `lot-download-hint-${lotId}`}
      >
        {state.enabled ? <DownloadIcon /> : <LockIcon />}
        ดาวน์โหลดใบเซ็นรับ
      </Button>
      {!state.enabled ? (
        <p id={`lot-download-hint-${lotId}`} className="mt-1.5 text-[11px] text-slate-400">
          {state.hint}
        </p>
      ) : null}
      {error !== null ? (
        <p role="alert" className="mt-1.5 text-[11px] font-semibold text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function DownloadIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
      />
    </svg>
  )
}
