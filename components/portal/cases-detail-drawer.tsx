'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { PortalCasePhotoGallery } from '@/components/portal/cases-photo-gallery'
import { PortalStatusBadge } from '@/components/portal/cases-status-badge'
import { PortalIcon } from '@/components/portal/portal-icons'
import { usePortalData } from '@/components/portal/use-portal-data'
import { Button, ErrorState, LoadingState, RefText } from '@/components/ui'
import { TOUCH_TARGET_CLASS } from '@/components/ui/button'
import { isTopModal, registerModal, unregisterModal } from '@/components/ui/modal-stack'
import { fmtDate } from '@/lib/format/datetime'
import { portalCaseDetailApiPath, portalServiceFeeRows } from '@/lib/portal/cases-view'
import type { PortalCaseDetailDto } from '@/lib/portal/serializers'

/**
 * Drawer รายละเอียดเคสของพอร์ทัล (`97` §6.1/§8 `view_case_detail` · mockup `case-detail` / mobile bottom sheet)
 *
 * - desktop = แผงเลื่อนจากขวา · มือถือ = bottom sheet (สูงสุด 85vh)
 * - ข้อมูลจาก `GET /api/portal/cases/:id` เท่านั้น (id สุ่ม/ข้ามบริษัท = 403 แสดงเป็น error state)
 * - ค่าบริการ = snapshot ตอนอนุมัติ (ป้ายไทย) · รูปสินค้าเฉพาะเคส "ติดตามสำเร็จ" (API ส่ง `assetPhotos` มาเฉพาะกรณีนั้น)
 * - อ่านอย่างเดียว — ไม่มีปุ่มแก้ไข/ส่ง · ไม่แสดงข้อมูลภาคสนาม (ผู้รับผิดชอบ/วันนัด/GPS/วิดีโอ/เสียง)
 */
export function PortalCaseDetailDrawer({
  caseId,
  canViewPhotos,
  onClose,
}: {
  caseId: string
  canViewPhotos: boolean
  onClose: () => void
}) {
  const state = usePortalData<PortalCaseDetailDto>(portalCaseDetailApiPath(caseId))
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const token = registerModal()
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && isTopModal(token)) onCloseRef.current()
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKey)
    panelRef.current?.focus()
    return () => {
      unregisterModal(token)
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKey)
    }
  }, [])

  const detail = state.data
  const title = detail === null ? 'รายละเอียดเคส' : `รายละเอียดเคส ${detail.caseRef}`

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-2xl bg-white shadow-lg focus:outline-none md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:w-full md:max-w-md md:rounded-none md:border-l md:border-slate-200"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <h2 className="min-w-0 truncate text-base font-bold text-slate-900">
            {detail === null ? (
              'รายละเอียดเคส'
            ) : (
              <>
                รายละเอียดเคส <span className="font-mono">{detail.caseRef}</span>
              </>
            )}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            // preship R2-011 — พื้นที่แตะ ≥44px บนจอสัมผัส (แบบปุ่มปิดของ Modal กลาง)
            className={`focus-ring inline-flex items-center justify-center rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 ${TOUCH_TARGET_CLASS}`}
          >
            <PortalIcon name="close" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-sm text-slate-700">
          {state.loading ? (
            <LoadingState />
          ) : state.error !== null ? (
            <ErrorState
              title={state.error.title}
              message={state.error.message}
              {...(state.error.code === undefined ? {} : { code: state.error.code })}
              action={
                <Button variant="secondary" onClick={state.reload}>
                  ลองใหม่
                </Button>
              }
            />
          ) : detail === null ? (
            <ErrorState title="ไม่พบข้อมูลเคส" />
          ) : (
            <CaseDetailBody detail={detail} canViewPhotos={canViewPhotos} />
          )}
        </div>

        <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-5 py-3 md:flex md:justify-end">
          <Button variant="secondary" size="md" className="w-full md:w-auto" onClick={onClose}>
            ปิด
          </Button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <dt className="shrink-0 text-slate-400">{label}</dt>
      <dd className="text-right font-semibold break-words text-slate-800">{children}</dd>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-slate-100 pt-3">
      <h3 className="mb-2 text-xs font-bold text-slate-600">{title}</h3>
      {children}
    </section>
  )
}

function CaseDetailBody({ detail, canViewPhotos }: { detail: PortalCaseDetailDto; canViewPhotos: boolean }) {
  const feeRows = portalServiceFeeRows(detail.serviceFee)
  const photos = detail.assetPhotos

  return (
    <div className="space-y-4">
      <dl>
        <Row label="เลขที่สัญญา">
          <RefText className="text-sm font-semibold text-slate-800">{detail.caseRef}</RefText>
        </Row>
        <Row label="สถานะ">
          <PortalStatusBadge display={detail.statusDisplay} />
        </Row>
        <Row label="ลูกหนี้">{detail.debtorName ?? '—'}</Row>
        <Row label="ทรัพย์">{detail.deviceText ?? '—'}</Row>
        <Row label="วันที่ส่งเคส">{fmtDate(detail.createdAt)}</Row>
        {detail.recycleRound !== null && (
          <Row label="รอบการติดตาม">
            <span className="text-violet-700">รอบที่ {detail.recycleRound}</span>
          </Row>
        )}
      </dl>

      {detail.statusReason !== null && detail.statusReason.trim() !== '' && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <b>หมายเหตุจากเจ้าหน้าที่:</b>
          <p className="mt-1 whitespace-pre-line">{detail.statusReason}</p>
        </div>
      )}

      <Section title="ค่าบริการ">
        {feeRows === null ? (
          <p className="text-xs text-slate-400">ค่าบริการจะถูกกำหนดเมื่อเคสได้รับการอนุมัติ</p>
        ) : (
          <dl>
            {feeRows.map((row) => (
              <Row key={row.label} label={row.label}>
                {row.value}
              </Row>
            ))}
          </dl>
        )}
      </Section>

      {photos !== null && (
        <Section title="รูปสินค้า (แนบตอนรับเข้าคลัง)">
          {photos.conditionLabel !== null && (
            <div className="mb-2 flex items-center gap-2 text-xs">
              <span className="text-slate-500">สภาพเครื่อง</span>
              <span className="font-semibold text-slate-800">{photos.conditionLabel}</span>
            </div>
          )}
          <PortalCasePhotoGallery
            assetId={photos.assetId}
            photoCount={photos.photoCount}
            canView={canViewPhotos}
            caseRef={detail.caseRef}
          />
          {photos.conditionNote !== null && photos.conditionNote.trim() !== '' && (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <b>หมายเหตุสภาพเครื่อง:</b>
              <p className="mt-1 whitespace-pre-line">{photos.conditionNote}</p>
            </div>
          )}
        </Section>
      )}

      <p className="border-t border-slate-100 pt-3 text-xs text-slate-400">
        รายละเอียดภาคสนาม (ผู้รับผิดชอบ / วันนัดหมาย / พิกัด / วิดีโอ-เสียงหน้างาน) ไม่แสดงในพอร์ทัลนี้ ตามนโยบายขอบเขตข้อมูล
      </p>
    </div>
  )
}
