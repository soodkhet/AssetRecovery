import { StatusBadge } from '@/components/ui'
import type { PortalStatusDisplay } from '@/lib/portal/status-map'

/**
 * ป้ายสถานะของพอร์ทัลจาก `statusDisplay` ที่ API ส่งมา (`97` §10 — ป้ายไทย + กลุ่มสี 10 กลุ่มของ mapper กลาง)
 * · `outline` = ป้ายเส้นขอบ (เคส "ติดตามไม่สำเร็จ" — slate outline) — ยังเป็นสี slate ของกลุ่ม neutral
 * · ไม่แสดง `code` (รหัสใช้กับตัวกรองเท่านั้น)
 */
export function PortalStatusBadge({ display }: { display: PortalStatusDisplay }) {
  return (
    <StatusBadge
      group={display.tone}
      label={display.label}
      {...(display.outline ? { className: 'border border-slate-300 bg-white text-slate-600' } : {})}
    />
  )
}
