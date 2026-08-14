'use client'

import { RefText, StatusBadge } from '@/components/ui'
import { cn } from '@/components/ui/cn'
import type { AssetListItemDto } from '@/lib/warehouse/types'
import { assetStatusBadgeGroup, assetStatusLabel } from '@/lib/warehouse/warehouse-ui'

/**
 * หัวการ์ดข้อมูลเครื่องที่ใช้ซ้ำในทุก modal ของหน้าคลัง (`44` §8.2/§8.3 — `ah()` ของ mockup)
 * เคส / ลูกหนี้ / บริษัท ทางซ้าย · อุปกรณ์ + IMEI ในสัญญา ทางขวา
 */
export function AssetSummaryHeader({
  asset,
  tone = 'slate',
  className,
}: {
  asset: AssetListItemDto
  tone?: 'slate' | 'danger'
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-xl border p-4',
        tone === 'danger' ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-slate-50',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <RefText className="font-bold">{asset.caseRef}</RefText>
          <div className="mt-0.5 font-semibold text-slate-900">{asset.debtorName}</div>
          <div className="text-xs text-slate-500">{asset.companyName}</div>
        </div>
        <div className="text-right">
          <div className="font-semibold text-slate-800">{asset.deviceDesc}</div>
          <div className="mt-0.5 font-mono text-[11px] text-slate-500">
            IMEI ในสัญญา: {asset.imeiContract ?? '—'}
          </div>
          {asset.serialContract !== null && (
            <div className="font-mono text-[11px] text-slate-500">Serial: {asset.serialContract}</div>
          )}
          <StatusBadge
            className="mt-1.5"
            group={assetStatusBadgeGroup(asset.assetStatus)}
            label={assetStatusLabel(asset.assetStatus)}
          />
        </div>
      </div>
    </div>
  )
}
