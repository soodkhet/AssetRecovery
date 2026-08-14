'use client'

import { useState } from 'react'
import { FileViewerModal, type ViewableFile } from '@/components/cases/file-viewer-modal'
import { AssetSummaryHeader } from '@/components/warehouse/asset-summary-header'
import { Button, InlineAlert, Modal, StatusBadge } from '@/components/ui'
import { fmtDateTime } from '@/lib/format/datetime'
import { compareAssetIdentity } from '@/lib/warehouse/imei'
import { INTAKE_PHOTO_ANGLE_LABELS } from '@/lib/warehouse/intake'
import { angleOfIntakePhoto, groupIntakePhotos } from '@/lib/warehouse/intake-photos'
import type { AssetDetailDto } from '@/lib/warehouse/types'
import { assetConditionBadgeGroup, assetConditionLabel } from '@/lib/warehouse/warehouse-ui'

/**
 * Modal "ดูรายละเอียดเครื่องในคลัง" (`44` §8.3 view-custody) — read-only
 * IMEI ที่ตรวจจริง / สภาพ / รูปถ่าย 7 มุม / วันรับเข้า / ล็อตที่ถูกจัดเข้าแล้ว (ถ้ามี)
 *
 * รูปเก็บเป็น **path** ใน bucket private ⇒ เปิดดูผ่าน `<FileViewerModal>` ที่ขอ signed URL ให้ทุกครั้ง
 */
export function AssetDetailModal({
  open,
  asset,
  onClose,
}: {
  open: boolean
  asset: AssetDetailDto
  onClose: () => void
}) {
  const [viewing, setViewing] = useState<ViewableFile | null>(null)

  const groups = groupIntakePhotos(asset.photos)
  const comparison = compareAssetIdentity(
    { imeiContract: asset.imeiContract, serialContract: asset.serialContract },
    { imeiActual: asset.imeiActual, serialActual: asset.serialActual },
  )

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        size="lg"
        title="ข้อมูลเครื่องในคลัง"
        footer={
          <Button variant="secondary" onClick={onClose}>
            ปิดหน้าต่าง
          </Button>
        }
      >
        <div className="space-y-4">
          <AssetSummaryHeader asset={asset} />

          {!comparison.matched && (
            <InlineAlert tone="warning" title="IMEI ที่ตรวจจริงไม่ตรงกับสัญญา">
              เครื่องนี้ถูกรับเข้าคลังโดยธุรการยืนยันทับคำเตือน — ค่าที่ตรวจจริงถูกบันทึกไว้ครบ
            </InlineAlert>
          )}

          <div className="overflow-hidden rounded-xl border border-slate-200 text-sm">
            <div className="bg-slate-50 px-4 py-2 text-[10px] font-bold tracking-wider text-slate-500 uppercase">
              ข้อมูลรับเข้าคลัง
            </div>
            <dl className="space-y-2 p-4">
              <DetailRow label="วันที่รับเข้า" value={fmtDateTime(asset.receivedAt)} />
              <DetailRow label="IMEI ที่ตรวจจริง" value={asset.imeiActual ?? '—'} mono />
              {asset.serialContract !== null && (
                <DetailRow label="Serial ที่ตรวจจริง" value={asset.serialActual ?? '—'} mono />
              )}
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-400">สภาพ</dt>
                <dd>
                  <StatusBadge
                    group={assetConditionBadgeGroup(asset.condition)}
                    label={assetConditionLabel(asset.condition)}
                  />
                </dd>
              </div>
              {asset.conditionNote !== null && (
                <div className="border-t border-slate-100 pt-2 text-xs text-slate-600">{asset.conditionNote}</div>
              )}
              {asset.lot !== null && (
                <DetailRow label="ล็อตส่งมอบ" value={`${asset.lot.lotNumber} · ${asset.lot.docRef}`} mono />
              )}
            </dl>
          </div>

          <div>
            <div className="mb-2 text-[10px] font-bold tracking-wider text-slate-500 uppercase">
              รูปหลักฐาน ({asset.photos.length})
            </div>
            {asset.photos.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-xs text-slate-400">
                ไม่มีรูปถ่าย
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {asset.photos.map((path) => {
                  const angle = angleOfIntakePhoto(path)
                  return (
                    <button
                      key={path}
                      type="button"
                      onClick={() =>
                        setViewing({ fileUrl: path, originalName: fileNameOf(path), mimeType: 'image/jpeg' })
                      }
                      className="focus-ring rounded-lg border border-slate-200 bg-slate-50 px-2 py-3 text-center text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
                    >
                      {angle === null ? 'รูปเพิ่มเติม' : INTAKE_PHOTO_ANGLE_LABELS[angle]}
                    </button>
                  )
                })}
              </div>
            )}
            {groups.filledAngles < Object.keys(INTAKE_PHOTO_ANGLE_LABELS).length && asset.photos.length > 0 && (
              <div className="mt-2 text-[11px] text-slate-400">
                ถ่ายไว้ {groups.filledAngles} มุมจาก {Object.keys(INTAKE_PHOTO_ANGLE_LABELS).length} มุม
              </div>
            )}
          </div>
        </div>
      </Modal>

      <FileViewerModal open={viewing !== null} document={viewing} onClose={() => setViewing(null)} />
    </>
  )
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-slate-400">{label}</dt>
      <dd className={`font-semibold text-slate-800 ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  )
}

function fileNameOf(path: string): string {
  return path.split('/').at(-1) ?? path
}
