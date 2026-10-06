import { monthKeyOfDateOnly, monthKeyOfInstant } from '@/lib/field/month-filter'
import type { HandoverLotStatus } from '@/lib/generated/prisma/enums'
import { statusesInLotTab, type LotTab } from '@/lib/warehouse/lot-status'
import type { LotSummaryDto } from '@/lib/warehouse/types'

/**
 * ตัวกรองของ 2 แท็บล็อตส่งมอบ (`44` §8.4 filter 3 ตัว · §8.5 filter 4 ตัว + เดือน) — **pure ล้วน**
 *
 * แนวเดียวกับ `asset-filters.ts` ของ 2.14: ทุกการตัดสินใจของหน้าจออยู่ที่นี่เพื่อให้เทสต์ได้โดยไม่ต้อง render
 *
 * ⚠️ **"วันที่" ของสองแท็บคนละความหมาย** (§8.4 = วันนัด · §8.5 = วันส่งมอบ) ⇒
 *    - แท็บ "รอส่งมอบ" ส่ง `dateFrom`/`dateTo` ให้ API กรองวันนัด
 *    - แท็บ "ส่งมอบแล้ว" (มติ PO U142) ส่ง `handedOverFrom`/`handedOverTo` ให้ API กรอง**วันส่งมอบ**
 *      ฝั่ง server ตามปฏิทินไทย — ค่าเริ่มต้น = ทั้งเดือนปัจจุบัน · เลือกวันเดียว = วันนั้น
 *      (เดิมกรอง `deliveredAt` ฝั่ง client บนชุดที่โหลดมาได้แค่ 200 ล็อต)
 */

export interface LotFilterState {
  /** เลขล็อต / เลขใบส่งมอบ / IMEI / ชื่อลูกหนี้ (`44` §8.4) — ส่งให้ API ค้นให้ */
  search: string
  /** `YYYY-MM-DD` (ค.ศ.) ตามที่ `<input type="date">` ส่งมา — ข้อยกเว้นเดียวของ Rule 01 */
  date: string
  companyId: string
  /** เฉพาะแท็บ "ส่งมอบแล้ว" (รอยืนยัน / ยืนยันแล้ว — §8.5) */
  status: string
  /**
   * เฉพาะแท็บ "ส่งมอบแล้ว" (มติ PO U142) — เดือนของวันส่งมอบ `YYYY-MM` (**ค.ศ.** ค่าที่ส่ง API ·
   * ป้ายบนจอเป็น พ.ศ. ผ่าน `monthLabel()`) · `''` = ไม่กรองเดือน
   */
  month: string
}

/** `'all'` = ไม่กรอง (ค่าเดียวกับทุกหน้าในระบบ) */
export const FILTER_ALL = 'all'

export const EMPTY_LOT_FILTERS: LotFilterState = {
  search: '',
  date: '',
  companyId: FILTER_ALL,
  status: FILTER_ALL,
  month: '',
}

/** เดือนปัจจุบันตามเวลาไทย (`YYYY-MM` ค.ศ.) — วันที่ 1 ตี 1 ไทย = เดือนใหม่แล้ว แม้ UTC ยังเป็นเดือนก่อน */
export function currentMonthKey(now: Date): string {
  return monthKeyOfInstant(now.toISOString()) ?? now.toISOString().slice(0, 7)
}

/** ค่าเริ่มต้นของแต่ละแท็บ — แท็บ "ส่งมอบแล้ว" เริ่มที่เดือนปัจจุบัน (มติ PO U142) */
export function initialLotFilters(tab: LotTab, now: Date): LotFilterState {
  return tab === 'handed_over' ? { ...EMPTY_LOT_FILTERS, month: currentMonthKey(now) } : { ...EMPTY_LOT_FILTERS }
}

/** เลื่อนเดือน `YYYY-MM` ไปข้างหน้า/ย้อนหลัง (ข้ามปีได้) */
export function shiftMonthKey(monthKey: string, delta: number): string {
  const [yearText = '', monthText = ''] = monthKey.split('-')
  const zeroBased = Number(yearText) * 12 + (Number(monthText) - 1) + delta
  const year = Math.floor(zeroBased / 12)
  const month = (zeroBased % 12) + 1
  return `${year}-${String(month).padStart(2, '0')}`
}

/** วันแรก/วันสุดท้ายของเดือน (`YYYY-MM-DD` · รวมทั้งสองขอบ) — ก.พ. ปีอธิกสุรทินได้ 29 */
export function monthDayRange(monthKey: string): { from: string; to: string } {
  const [yearText = '', monthText = ''] = monthKey.split('-')
  const lastDay = new Date(Date.UTC(Number(yearText), Number(monthText), 0)).getUTCDate()
  return { from: `${monthKey}-01`, to: `${monthKey}-${String(lastDay).padStart(2, '0')}` }
}

/** เลือกวันส่งมอบวันเดียว = เดือนที่แสดงขยับตามวันนั้นด้วย (ไม่ให้ป้ายเดือนกับวันขัดกัน) */
export function withDeliveredDate(filters: LotFilterState, date: string): LotFilterState {
  return date === '' ? { ...filters, date } : { ...filters, date, month: monthKeyOfDateOnly(date) }
}

export type LotListQueryInit = Record<string, string | number>

/**
 * ประกอบ query ของ `GET /api/handover-lots` — คีย์ทุกตัวต้องอยู่ใน `API_CONTRACT['lot.list'].query`
 *
 * ⚠️ ไม่เลือกสถานะ = ส่งสถานะ**ทั้งหมดของแท็บ**เสมอ ห้ามปล่อยว่าง ไม่อย่างนั้นแท็บจะเห็นล็อตข้ามแท็บ
 *    (เช่น `pending_delivery_proof` ที่ต้องอยู่แท็บ "ส่งมอบแล้ว" ทันทีตาม §9.3)
 */
export function buildLotListQuery(
  tab: LotTab,
  filters: LotFilterState,
  page: number,
  limit: number,
): LotListQueryInit {
  const statuses = statusesInLotTab(tab)
  const selected = statuses.filter((status) => filters.status === FILTER_ALL || filters.status === status)

  const query: LotListQueryInit = {
    status: (selected.length === 0 ? statuses : selected).join(','),
    page,
    limit,
  }
  if (filters.search.trim() !== '') query.search = filters.search.trim()
  if (filters.companyId !== FILTER_ALL) query.companyId = filters.companyId
  if (tab === 'pending_handover') {
    // แท็บ "รอส่งมอบ" = วันนัด
    if (filters.date !== '') {
      query.dateFrom = filters.date
      query.dateTo = filters.date
    }
    return query
  }
  // แท็บ "ส่งมอบแล้ว" = วันส่งมอบ (มติ PO U142) — วันเดียวชนะเดือน
  if (filters.date !== '') {
    query.handedOverFrom = filters.date
    query.handedOverTo = filters.date
  } else if (filters.month !== '') {
    const range = monthDayRange(filters.month)
    query.handedOverFrom = range.from
    query.handedOverTo = range.to
  }
  return query
}

/** query ของ `GET /api/handover-lots/company-summary` — ตัวกรองชุดเดียวกับ list ไม่มี page/limit */
export function buildLotCompanySummaryQuery(tab: LotTab, filters: LotFilterState): LotListQueryInit {
  const query = buildLotListQuery(tab, filters, 1, 1)
  delete query.page
  delete query.limit
  return query
}

/** ตัวเลือกสถานะของแท็บ "ส่งมอบแล้ว" (`44` §8.5 — รอยืนยัน / ยืนยันแล้ว) */
export const DELIVERED_STATUS_OPTIONS: readonly HandoverLotStatus[] = statusesInLotTab('handed_over')

/** แถวใดก็ได้ที่บอกบริษัท — ล็อต (`LotSummaryDto`) หรือหัวกลุ่ม (`LotCompanyGroupDto`) */
export type LotCompanyRef = Pick<LotSummaryDto, 'companyId' | 'companyName'>

export interface LotFilterOption {
  id: string
  name: string
}

/**
 * ตัวเลือกบริษัทจากล็อตที่โหลดมา — ใช้เมื่อผู้ใช้ไม่มีสิทธิ์เรียก `/api/finance-companies`
 * (ธุรการคลังถือแค่ capability ของงานคลัง — `44` §13) · เรียงตามชื่อให้ลำดับคงที่
 */
export function companyOptionsFromLots(items: readonly LotCompanyRef[]): LotFilterOption[] {
  const found = new Map<string, string>()
  for (const item of items) {
    if (!found.has(item.companyId)) found.set(item.companyId, item.companyName)
  }
  return [...found.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((left, right) => left.name.localeCompare(right.name, 'th'))
}

export function lotFilterOptionsOrFallback(
  fromApi: readonly LotFilterOption[],
  items: readonly LotCompanyRef[],
): LotFilterOption[] {
  return fromApi.length > 0 ? [...fromApi] : companyOptionsFromLots(items)
}
