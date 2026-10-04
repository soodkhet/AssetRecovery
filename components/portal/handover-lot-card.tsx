'use client'

import { HandoverDownloadButton } from '@/components/portal/handover-download-button'
import { Badge, RefText, StatusBadge } from '@/components/ui'
import { fmtDate } from '@/lib/format/datetime'
import type { PortalLotListItemDto } from '@/lib/portal/serializers'

/**
 * การ์ดล็อตส่งมอบ 1 ใบ (mockup `renderHandover()` — grid การ์ดทั้ง desktop/มือถือ)
 * คลิกการ์ด = เปิดรายละเอียด · ปุ่มดาวน์โหลดหยุด event ไม่ให้เปิดรายละเอียดซ้อน
 */
export function HandoverLotCard({
  lot,
  canDownload,
  onOpen,
}: {
  lot: PortalLotListItemDto
  canDownload: boolean
  onOpen: (lotId: string) => void
}) {
  return (
    <article className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-slate-300 hover:shadow-md">
      <button
        type="button"
        onClick={() => onOpen(lot.id)}
        className="focus-ring -m-1 flex-1 rounded-lg p-1 text-left"
      >
        <span className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <Badge>{lot.typeLabel}</Badge>
          <StatusBadge group={lot.statusDisplay.tone} label={lot.statusDisplay.label} />
        </span>
        <RefText className="block text-sm font-bold text-slate-800">{lot.lotNumber}</RefText>
        <span className="block mt-0.5 text-xs text-slate-400">
          เลขที่ใบส่งมอบ: <RefText className="text-xs text-slate-600">{lot.docRef}</RefText>
        </span>
        <span className="block mt-2 text-xs text-slate-500">
          จำนวนทรัพย์: {lot.assetCount.toLocaleString('th-TH')} เครื่อง · คลิกเพื่อดูรายการ
        </span>
        <span className="block mt-1 text-xs text-slate-500">สร้างเมื่อ {fmtDate(lot.createdAt)}</span>
        {lot.confirmedAt !== null ? (
          <span className="block mt-1 text-xs text-emerald-600">ยืนยันส่งมอบเมื่อ {fmtDate(lot.confirmedAt)}</span>
        ) : null}
      </button>
      {canDownload ? (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <HandoverDownloadButton
            lotId={lot.id}
            docRef={lot.docRef}
            downloadable={lot.downloadable}
            canDownload={canDownload}
            block
          />
        </div>
      ) : null}
    </article>
  )
}
