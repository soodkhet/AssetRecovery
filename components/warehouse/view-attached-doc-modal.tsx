'use client'

import { useState } from 'react'
import { Button, Modal } from '@/components/ui'
import { FileViewerModal, type ViewableFile } from '@/components/cases/file-viewer-modal'
import { fmtDateTime } from '@/lib/format/datetime'
import { lotDocumentMime, lotDocumentSlots } from '@/lib/warehouse/lot-documents'
import type { LotDetailDto } from '@/lib/warehouse/types'
import { HANDOVER_TYPE_LABEL } from '@/lib/warehouse/warehouse-ui'

/**
 * Modal "ดูเอกสารที่แนบ" ของล็อตที่ยืนยันแล้ว (`44` §8.5 `view-attached-doc`)
 * — จำนวนเอกสารมาจาก `lotDocumentSlots()` ตามชนิดล็อต (1 หรือ 2 ชิ้น · §6.3)
 *
 * bucket เป็น private ⇒ เปิด/ดาวน์โหลดผ่าน `<FileViewerModal>` ที่ขอ signed URL ให้ทุกครั้ง
 */
export function ViewAttachedDocModal({
  open,
  lot,
  onClose,
}: {
  open: boolean
  lot: LotDetailDto
  onClose: () => void
}) {
  const [viewing, setViewing] = useState<ViewableFile | null>(null)
  const slots = lotDocumentSlots(lot)

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        size="md"
        title={`เอกสารที่แนบ — ${lot.lotNumber}`}
        description={`${lot.companyName} · ${HANDOVER_TYPE_LABEL[lot.type]}`}
        footer={
          <Button variant="primary" onClick={onClose}>
            ปิด
          </Button>
        }
      >
        <div className="space-y-3">
          <dl className="rounded-xl border border-slate-200 p-3 text-xs">
            <div className="flex justify-between gap-3 py-1">
              <dt className="text-slate-400">เลขที่ใบส่งมอบ</dt>
              <dd className="font-mono font-semibold text-slate-700">{lot.docRef}</dd>
            </div>
            <div className="flex justify-between gap-3 py-1">
              <dt className="text-slate-400">ส่งมอบจริง</dt>
              <dd className="font-semibold text-slate-700">{fmtDateTime(lot.deliveredAt)}</dd>
            </div>
            <div className="flex justify-between gap-3 py-1">
              <dt className="text-slate-400">ยืนยันเมื่อ</dt>
              <dd className="font-semibold text-emerald-700">
                {fmtDateTime(lot.confirmedAt)}
                {lot.confirmedByName !== null && <span className="text-slate-500"> · {lot.confirmedByName}</span>}
              </dd>
            </div>
          </dl>

          {slots.map((slot) => (
            <div
              key={slot.document}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-slate-800">
                  {slot.ordinal} {slot.label}
                </div>
                <div className="mt-0.5 truncate font-mono text-[11px] text-slate-500">
                  {slot.fileUrl ?? 'ไม่พบไฟล์ที่แนบไว้'}
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                disabled={slot.fileUrl === null}
                onClick={() =>
                  slot.fileUrl === null
                    ? undefined
                    : setViewing({
                        fileUrl: slot.fileUrl,
                        originalName: slot.label,
                        mimeType: lotDocumentMime(slot.fileUrl),
                      })
                }
              >
                เปิดดู / ดาวน์โหลด
              </Button>
            </div>
          ))}
        </div>
      </Modal>

      <FileViewerModal open={viewing !== null} document={viewing} onClose={() => setViewing(null)} />
    </>
  )
}
