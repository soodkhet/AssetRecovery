'use client'

import { cn } from '@/components/ui/cn'
import { ASSET_TABS, type AssetTab } from '@/lib/warehouse/asset-status'
import { ASSET_TAB_LABEL } from '@/lib/warehouse/warehouse-ui'

/** ตัวเลขบน badge ของแต่ละแท็บ — `null` = ยังนับไม่เสร็จ/นับไม่ได้ (ซ่อน badge ไม่ใช่แสดง 0) */
export type WarehouseTabCounts = Readonly<Record<AssetTab, number | null>>

export const EMPTY_TAB_COUNTS: WarehouseTabCounts = {
  intake: null,
  in_custody: null,
  pending_handover: null,
  handed_over: null,
}

/**
 * แท็บหลัก 4 อันของหน้าคลัง (`44` §8.1) — ตัวเลขใน badge = จำนวนรายการของแท็บนั้น
 * (2 แท็บแรกนับ **เครื่อง** · 2 แท็บหลังนับ **ล็อต** ตามตารางใน §8.1)
 *
 * ชื่อแท็บมาจาก `ASSET_TAB_LABEL` ตัวเดียวกับที่ `44` §8 ใช้ — ห้ามพิมพ์ข้อความซ้ำที่นี่
 */
export function WarehouseTabs({
  tab,
  counts,
  onTabChange,
  className,
}: {
  tab: AssetTab
  counts: WarehouseTabCounts
  onTabChange: (tab: AssetTab) => void
  className?: string
}) {
  return (
    <div
      className={cn('flex gap-6 overflow-x-auto border-b border-slate-200', className)}
      role="tablist"
      aria-label="แท็บคลังสินค้า"
    >
      {ASSET_TABS.map((item) => {
        const active = item === tab
        const count = counts[item]
        return (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onTabChange(item)}
            className={cn(
              'focus-ring flex items-center gap-1.5 border-b-2 py-2.5 text-sm font-medium whitespace-nowrap transition-colors',
              active ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800',
            )}
          >
            {ASSET_TAB_LABEL[item]}
            {count !== null && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                  active ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-600',
                )}
              >
                {count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
