'use client'

import { useEffect, useRef, useState } from 'react'
import { PortalIcon } from '@/components/portal/portal-icons'
import { usePortalApiUrl } from '@/components/portal/portal-scope'
import { InlineAlert } from '@/components/ui'
import { isTopModal, registerModal, unregisterModal } from '@/components/ui/modal-stack'
import { portalAssetPhotoPath, wrapPhotoIndex } from '@/lib/portal/cases-view'

/**
 * รูปสินค้าตอนรับเข้าคลัง (ภาพเครื่อง 7 มุม) ของเคส "ติดตามสำเร็จ" (`97` §6.1 v3 · มติ O46)
 *
 * - รูป stream จาก `GET /api/portal/assets/:id/photos/:index` (server ตรวจสิทธิ์ + `portal_download` เอง — DEC-002)
 * - `canView = false` (ไม่มีสิทธิ์ดาวน์โหลด) ⇒ แสดงแค่จำนวนรูป ไม่ยิง request รูปเลย
 * - คลิกรูป = lightbox เต็มจอ (ลูกศร/Esc/คลิกพื้นหลัง) · รูปโหลดไม่ได้แสดงช่องว่างพร้อมข้อความ
 * - ไม่มีหลักฐานปิดงานภาคสนาม (GPS/วิดีโอ/เสียง) ในส่วนนี้เด็ดขาด
 */
export function PortalCasePhotoGallery({
  assetId,
  photoCount,
  canView,
  caseRef,
}: {
  assetId: string
  photoCount: number
  canView: boolean
  caseRef: string
}) {
  const apiUrl = usePortalApiUrl()
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const [failed, setFailed] = useState<ReadonlySet<number>>(() => new Set())

  if (photoCount === 0) {
    return <p className="text-xs text-slate-400">ยังไม่มีรูปสินค้าที่แนบตอนรับเข้าคลัง</p>
  }
  if (!canView) {
    return (
      <InlineAlert tone="info">
        มีรูปสินค้า {photoCount} รูป — บัญชีของท่านยังไม่ได้รับสิทธิ์เปิดดูรูป กรุณาติดต่อผู้ดูแลบัญชีของบริษัท
      </InlineAlert>
    )
  }

  const markFailed = (index: number) =>
    setFailed((current) => (current.has(index) ? current : new Set([...current, index])))
  const indexes = Array.from({ length: photoCount }, (_, index) => index)

  return (
    <>
      <div className="grid grid-cols-4 gap-2">
        {indexes.map((index) => (
          <button
            key={index}
            type="button"
            onClick={() => setOpenIndex(index)}
            className="focus-ring group flex flex-col items-center gap-1 rounded-lg"
            aria-label={`เปิดรูปที่ ${index + 1} จาก ${photoCount}`}
          >
            <span className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
              {failed.has(index) ? (
                <span className="px-1 text-center text-[11px] text-slate-400">โหลดรูปไม่ได้</span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- รูป stream ผ่าน API ที่ตรวจสิทธิ์ (ไม่ผ่าน image optimizer)
                <img
                  src={apiUrl(portalAssetPhotoPath(assetId, index))}
                  alt={`รูปสินค้า ${caseRef} รูปที่ ${index + 1}`}
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  onError={() => markFailed(index)}
                />
              )}
            </span>
            <span className="text-[11px] leading-tight text-slate-500">รูปที่ {index + 1}</span>
          </button>
        ))}
      </div>
      {openIndex !== null && (
        <PhotoLightbox
          assetId={assetId}
          caseRef={caseRef}
          count={photoCount}
          index={openIndex}
          failed={failed.has(openIndex)}
          onFailed={markFailed}
          onChange={setOpenIndex}
          onClose={() => setOpenIndex(null)}
        />
      )}
    </>
  )
}

function PhotoLightbox({
  assetId,
  caseRef,
  count,
  index,
  failed,
  onFailed,
  onChange,
  onClose,
}: {
  assetId: string
  caseRef: string
  count: number
  index: number
  failed: boolean
  onFailed: (index: number) => void
  onChange: (index: number) => void
  onClose: () => void
}) {
  const apiUrl = usePortalApiUrl()
  const panelRef = useRef<HTMLDivElement>(null)
  // ผูก handler ล่าสุดผ่าน ref — effect ลงทะเบียนชั้น modal ครั้งเดียวตอนเปิด (แนวเดียวกับ `<Modal>`)
  const latest = useRef({ index, count, onChange, onClose })
  useEffect(() => {
    latest.current = { index, count, onChange, onClose }
  }, [index, count, onChange, onClose])

  useEffect(() => {
    const token = registerModal()
    function handleKey(event: KeyboardEvent) {
      if (!isTopModal(token)) return
      const current = latest.current
      if (event.key === 'Escape') current.onClose()
      else if (event.key === 'ArrowRight') current.onChange(wrapPhotoIndex(current.index + 1, current.count))
      else if (event.key === 'ArrowLeft') current.onChange(wrapPhotoIndex(current.index - 1, current.count))
    }
    document.addEventListener('keydown', handleKey)
    panelRef.current?.focus()
    return () => {
      unregisterModal(token)
      document.removeEventListener('keydown', handleKey)
    }
  }, [])

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={`รูปสินค้า ${caseRef}`}
      tabIndex={-1}
      className="fixed inset-0 z-[60] flex flex-col bg-slate-900/90 focus:outline-none"
      onClick={onClose}
    >
      <div className="flex items-center justify-between px-4 py-3 text-white" onClick={(event) => event.stopPropagation()}>
        <span className="text-sm font-semibold">
          <span className="font-mono">{caseRef}</span> · รูปที่ {index + 1} / {count}
        </span>
        <button type="button" onClick={onClose} aria-label="ปิด" className="focus-ring rounded-md p-1.5 text-white/80 hover:bg-white/10">
          <PortalIcon name="close" className="h-5 w-5" />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-12 pb-6">
        {failed ? (
          <span className="text-sm text-white/70" onClick={(event) => event.stopPropagation()}>
            โหลดรูปไม่ได้ กรุณาลองใหม่ภายหลัง
          </span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- รูป stream ผ่าน API ที่ตรวจสิทธิ์
          <img
            key={index}
            src={apiUrl(portalAssetPhotoPath(assetId, index))}
            alt={`รูปสินค้า ${caseRef} รูปที่ ${index + 1}`}
            className="h-full w-full object-contain"
            onClick={(event) => event.stopPropagation()}
            onError={() => onFailed(index)}
          />
        )}
        {count > 1 && (
          <>
            <LightboxArrow direction="prev" onClick={() => onChange(wrapPhotoIndex(index - 1, count))} />
            <LightboxArrow direction="next" onClick={() => onChange(wrapPhotoIndex(index + 1, count))} />
          </>
        )}
      </div>
    </div>
  )
}

function LightboxArrow({ direction, onClick }: { direction: 'prev' | 'next'; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      aria-label={direction === 'prev' ? 'รูปก่อนหน้า' : 'รูปถัดไป'}
      className={`focus-ring absolute top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 ${
        direction === 'prev' ? 'left-2' : 'right-2'
      }`}
    >
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d={direction === 'prev' ? 'M15 19l-7-7 7-7' : 'M9 5l7 7-7 7'} />
      </svg>
    </button>
  )
}
