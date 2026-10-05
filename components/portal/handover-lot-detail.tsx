'use client'

import type { ReactNode } from 'react'
import { HandoverDownloadButton } from '@/components/portal/handover-download-button'
import { usePortalApiUrl } from '@/components/portal/portal-scope'
import { usePortalData } from '@/components/portal/use-portal-data'
import { Button, EmptyState, ErrorState, LoadingState, Modal, RefText, StatusBadge } from '@/components/ui'
import { fmtDate, fmtDateTime } from '@/lib/format/datetime'
import { portalAssetPhotoApiUrl, portalLotDetailApiUrl } from '@/lib/portal/handover-view'
import type { PortalLotAssetDto, PortalLotDetailDto } from '@/lib/portal/serializers'

/**
 * รายละเอียดล็อตส่งมอบ (modal — mockup `lot-detail` + `asset-detail` รวมเป็นหน้าต่างเดียว)
 * `GET /api/portal/handover-lots/:id` (มติ O43 D6) — รายการทรัพย์ **ไม่มี IMEI/serial** (O44: DTO ไม่มีช่องนี้)
 * · รูปทรัพย์ `GET /api/portal/assets/:id/photos/:index` ต้องมีสิทธิ์ดาวน์โหลด ⇒ ไม่มีสิทธิ์ = ไม่โหลดรูปเลย
 * · เอกสาร (มติ U13): ใบส่งมอบ PDF จากระบบ (ตั้งแต่สร้างล็อต) · หลักฐานการจัดส่ง (เฉพาะล็อตเราส่งที่แนบแล้ว) · ใบเซ็นรับ
 */
export function HandoverLotDetailModal({
  lotId,
  canDownload,
  onClose,
}: {
  lotId: string
  canDownload: boolean
  onClose: () => void
}) {
  const state = usePortalData<PortalLotDetailDto>(portalLotDetailApiUrl(lotId))
  const lot = state.data

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={lot === null ? 'รายละเอียดล็อต' : `รายการทรัพย์ใน ${lot.lotNumber}`}
      footer={
        <>
          {lot !== null && !state.loading && state.error === null ? (
            <div className="mr-auto flex flex-wrap items-start gap-2">
              <HandoverDownloadButton
                kind="delivery_note"
                lotId={lot.id}
                docRef={lot.docRef}
                downloadable
                canDownload={canDownload}
              />
              {lot.deliveryProofAvailable ? (
                <HandoverDownloadButton
                  kind="delivery_proof"
                  lotId={lot.id}
                  docRef={lot.docRef}
                  downloadable
                  canDownload={canDownload}
                />
              ) : null}
              <HandoverDownloadButton
                lotId={lot.id}
                docRef={lot.docRef}
                downloadable={lot.downloadable}
                canDownload={canDownload}
              />
            </div>
          ) : null}
          <Button onClick={onClose}>ปิด</Button>
        </>
      }
    >
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
      ) : lot === null ? (
        <EmptyState title="ไม่พบข้อมูลล็อต" />
      ) : (
        <LotDetailBody lot={lot} canDownload={canDownload} />
      )}
    </Modal>
  )
}

function LotDetailBody({ lot, canDownload }: { lot: PortalLotDetailDto; canDownload: boolean }) {
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs sm:grid-cols-3">
        <Meta label="เลขที่ใบส่งมอบ">
          <RefText className="text-xs font-semibold text-slate-800">{lot.docRef}</RefText>
        </Meta>
        <Meta label="สถานะ">
          <StatusBadge group={lot.statusDisplay.tone} label={lot.statusDisplay.label} />
        </Meta>
        <Meta label="วิธีส่งมอบ">{lot.typeLabel}</Meta>
        <Meta label="จำนวนทรัพย์">{lot.assets.length.toLocaleString('th-TH')} เครื่อง</Meta>
        <Meta label="วันที่สร้างล็อต">{fmtDate(lot.createdAt)}</Meta>
        <Meta label="วันที่ยืนยันส่งมอบ">{fmtDateTime(lot.confirmedAt)}</Meta>
      </dl>

      {lot.assets.length === 0 ? (
        <EmptyState title="ยังไม่มีทรัพย์ในล็อตนี้" />
      ) : (
        <ul className="space-y-2">
          {lot.assets.map((asset, index) => (
            <AssetItem key={asset.id} asset={asset} order={index + 1} canDownload={canDownload} />
          ))}
        </ul>
      )}

      <p className="text-[11px] text-slate-400">ไม่แสดงหมายเลข IMEI ในพอร์ทัลนี้ตามนโยบายขอบเขตข้อมูล</p>
    </div>
  )
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-slate-400">{label}</dt>
      <dd className="mt-0.5 font-semibold break-words text-slate-800">{children}</dd>
    </div>
  )
}

function AssetItem({ asset, order, canDownload }: { asset: PortalLotAssetDto; order: number; canDownload: boolean }) {
  const apiUrl = usePortalApiUrl()
  const photoIndexes = Array.from({ length: asset.photoCount }, (_, index) => index)

  return (
    <li className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <RefText className="text-xs font-bold">{asset.caseRef}</RefText>
            <span className="text-[11px] text-slate-400">#{order}</span>
          </div>
          <div className="mt-1 truncate text-sm font-semibold text-slate-800">{asset.debtorName}</div>
          <div className="mt-0.5 text-xs text-slate-500">{asset.deviceDesc}</div>
        </div>
        {asset.conditionLabel !== null ? (
          <StatusBadge group="neutral" label={`สภาพ: ${asset.conditionLabel}`} />
        ) : null}
      </div>

      {asset.conditionNote !== null && asset.conditionNote.trim() !== '' ? (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
          <span className="font-bold">หมายเหตุสภาพเครื่อง:</span> {asset.conditionNote}
        </div>
      ) : null}

      {canDownload && photoIndexes.length > 0 ? (
        <div className="mt-3">
          <div className="mb-1.5 text-[11px] font-bold text-slate-600">ภาพถ่ายสภาพเครื่อง ({photoIndexes.length} รูป)</div>
          <div className="flex flex-wrap gap-2">
            {photoIndexes.map((index) => {
              const src = apiUrl(portalAssetPhotoApiUrl(asset.id, index))
              return (
                <a
                  key={index}
                  href={src}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="focus-ring block h-16 w-16 overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
                  title={`เปิดรูปที่ ${index + 1}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- รูปส่งผ่าน API ของพอร์ทัลที่ตรวจสิทธิ์ทุกครั้ง (ไม่ใช่ไฟล์ static ให้ next/image ปรับขนาด) */}
                  <img
                    src={src}
                    alt={`รูปทรัพย์ ${asset.caseRef} ลำดับ ${index + 1}`}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </a>
              )
            })}
          </div>
        </div>
      ) : null}
    </li>
  )
}
