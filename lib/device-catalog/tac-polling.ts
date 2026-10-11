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

/**
 * mytester A-13 — ข้อความตารางว่างของรายการแบรนด์/TAC: ระหว่างมีงานนำเข้า ⇒ บอกว่ากำลังนำเข้า (ห้ามชวนกดอัปเดตซ้ำ)
 * · มีคำค้น/ตัวกรอง ⇒ ให้เปลี่ยนเงื่อนไข · ว่างจริง ⇒ ชวนอัปเดต/เพิ่มเอง
 */
export function catalogEmptyDescription(input: { pendingJob: boolean; filtered: boolean; unit: string }): string {
  if (input.pendingJob) return 'กำลังนำเข้าฐาน TAC อยู่เบื้องหลัง — รายการจะขึ้นเองเมื่อเสร็จ (ครั้งแรกใช้เวลาไม่กี่นาที)'
  if (input.filtered) return `ไม่พบ${input.unit}ที่ตรงกับคำค้นหรือตัวกรอง — ลองเปลี่ยนเงื่อนไข`
  return 'ยังไม่มีข้อมูล — กด “อัปเดตตอนนี้” ด้านบน หรือเพิ่มเอง'
}

/** ช่อง "นำเข้าสำเร็จล่าสุด" — ระหว่างงานแรกยังไม่จบ ไม่บอกว่า "ยังไม่เคย" (mytester A-13) */
export function tacImportedAtText(
  summary: Pick<DeviceCatalogSummaryDto, 'pendingJob' | 'tacImportedAt'>,
  formatDateTime: (iso: string) => string,
): string {
  if (summary.tacImportedAt !== null) return formatDateTime(summary.tacImportedAt)
  return summary.pendingJob ? 'กำลังนำเข้าครั้งแรก…' : 'ยังไม่เคย'
}
