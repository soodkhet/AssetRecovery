import type { FieldCaseListItemDto } from '@/lib/field/types'

/**
 * ข้อมูลของหน้าแรก Field Tracker (`41` §7.1 — 5 บล็อก) — **pure ล้วน**
 *
 * รับ 2 ชุดที่หน้าจอโหลดมาแล้ว: เคสที่ยังทำงานอยู่ (`GET /api/field/cases`) และเคสที่จบแล้ว
 * (`?status=closed`) — ที่นี่ไม่ยิง API และ **ไม่อ่านนาฬิกาเอง** (รับ `todayIso` เข้ามา) เพื่อให้เทสต์ได้
 *
 * ⚠️ ตัวเลขเงิน/%: คอมมิชชั่นเดือนนี้ + % ความสำเร็จสะสม มาจาก `GET /api/field/income-summary`
 * (ค่าที่ snapshot ไว้กับเคส — `41` §6.8) ห้ามคำนวณเองจากแผนปัจจุบันในหน้าจอ
 */

export interface FieldDashboardModel {
  /** บล็อก 1 — Draft ค้าง (แตะแล้วไปแท็บ "กำลังติดตาม") */
  draftCases: FieldCaseListItemDto[]
  /** บล็อก 2 — เคสที่ต้องไปวันนี้ เรียงตามลำดับที่จัดไว้ */
  todayCases: FieldCaseListItemDto[]
  /** บล็อก 3 — สรุปภาพรวม 3 สถานะ */
  pendingAcceptCount: number
  trackingCount: number
  successCount: number
  /** การ์ดเสริมของ mockup — เคสที่รับแล้วแต่ยังไม่จัดวัน */
  unscheduledCount: number
}

export function buildFieldDashboard(
  activeItems: readonly FieldCaseListItemDto[],
  closedItems: readonly FieldCaseListItemDto[],
  todayIso: string,
): FieldDashboardModel {
  return {
    // draft ค้างเกิดได้เฉพาะเคสที่ยังทำงานอยู่ (ปิดงานแล้ว draft ถูกล้าง — `41` §6.5)
    draftCases: activeItems.filter((item) => item.hasDraft),
    todayCases: activeItems
      .filter((item) => item.status === 'scheduled' && item.scheduleDate === todayIso)
      .sort((a, b) => (a.scheduleOrder ?? 0) - (b.scheduleOrder ?? 0)),
    pendingAcceptCount: activeItems.filter((item) => item.status === 'pending_accept').length,
    // "กำลังติดตาม" = กลุ่ม tracking ของ §7.5 (รวมเคสที่ถูกตีกลับหลักฐาน เพราะยังเป็นงานค้างของพนักงาน)
    trackingCount: activeItems.filter((item) => item.status === 'scheduled' || item.status === 'needs_revision').length,
    successCount: closedItems.filter((item) => item.status === 'closed_success').length,
    unscheduledCount: activeItems.filter((item) => item.status === 'accepted_unscheduled').length,
  }
}

// ── บล็อก 5 — แนวโน้มผลงาน 7 วันล่าสุด (`41` §7.1) ─────────────────────────

export interface TrendDay {
  /** `YYYY-MM-DD` ตามเวลาไทย — หน้าจอแสดงเลขวันอย่างเดียว */
  dateIso: string
  success: number
  fail: number
  total: number
  /** ความสูงของแท่งเทียบวันที่มากที่สุด (%) — วันที่ไม่มีเคสเหลือขีดบาง ๆ ไว้ให้เห็นแกน */
  heightPct: number
  /** สัดส่วนสีเขียว (สำเร็จ) ภายในแท่ง (%) */
  successPct: number
}

export const TREND_DAYS = 7

/** ย้อน/เดินวัน ISO — คำนวณบน UTC เพื่อไม่ให้เขตเวลาเครื่องมีผล (คีย์เป็น "วันไทย" อยู่แล้ว) */
function shiftDateIso(dateIso: string, days: number): string {
  const [year = 0, month = 0, day = 0] = dateIso.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

/**
 * 7 ช่องเรียงเก่า→ใหม่ ลงท้ายด้วย "วันนี้" — นับจากวันที่ปิดงานตามเวลาไทย
 * ผู้เรียกแปลง `closedAt` เป็นวันไทยมาก่อนด้วย `toInputDate()` (Rule 01) เพื่อให้ฟังก์ชันนี้ยัง pure
 */
export function buildSevenDayTrend(
  closedDays: readonly { dayIso: string; success: boolean }[],
  todayIso: string,
): TrendDay[] {
  const days = Array.from({ length: TREND_DAYS }, (_unused, index) => {
    const dateIso = shiftDateIso(todayIso, index - (TREND_DAYS - 1))
    const ofDay = closedDays.filter((row) => row.dayIso === dateIso)
    const success = ofDay.filter((row) => row.success).length
    return { dateIso, success, fail: ofDay.length - success, total: ofDay.length }
  })

  const max = Math.max(...days.map((day) => day.total))
  return days.map((day) => ({
    ...day,
    heightPct: day.total === 0 || max === 0 ? 4 : Math.max(8, Math.round((day.total / max) * 100)),
    successPct: day.total === 0 ? 0 : Math.round((day.success / day.total) * 100),
  }))
}

/**
 * % ความสำเร็จสะสม (`41` §6.8) — คืน `null` เมื่อยังไม่เคยปิดงาน (**ห้ามหารศูนย์** Rule 01)
 * หน้าจอแสดง `-` แทนเมื่อเป็น `null`
 */
export function successRatePct(successCount: number, failCount: number): number | null {
  const total = successCount + failCount
  if (total === 0) return null
  return Math.round((successCount / total) * 100)
}
