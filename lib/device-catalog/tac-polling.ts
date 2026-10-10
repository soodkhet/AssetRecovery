import type { DeviceCatalogSummaryDto } from '@/lib/device-catalog/types'
import { fmtCount } from '@/lib/format/money'

/**
 * staging E-019 — หน้าฐาน TAC ติดตามงานเบื้องหลังเอง: ระหว่างมีงานรอ/กำลังทำ ⇒ ถามสรุปซ้ำทุก 5 วินาที
 * งานจบ (pending → ไม่ pending) ⇒ แจ้งผล + โหลดรายการใหม่ · **pure** (หน้าจอเป็นคนตั้งเวลา)
 */
export const TAC_POLL_INTERVAL_MS = 5000

export function shouldPollTacSummary(summary: Pick<DeviceCatalogSummaryDto, 'pendingJob'> | null): boolean {
  return summary?.pendingJob === true
}

export function tacJobFinishedNotice(
  previous: Pick<DeviceCatalogSummaryDto, 'pendingJob' | 'tacCount' | 'brandCount'> | null,
  next: Pick<DeviceCatalogSummaryDto, 'pendingJob' | 'tacCount' | 'brandCount'>,
): { title: string; description: string } | null {
  if (previous?.pendingJob !== true || next.pendingJob) return null
  return {
    title: 'อัปเดตฐานรุ่นเครื่องเสร็จแล้ว',
    description: `TAC ${fmtCount(next.tacCount)} รายการ · แบรนด์ ${fmtCount(next.brandCount)} แบรนด์ — ดูรายละเอียดที่แท็บประวัติการอัปเดต`,
  }
}
