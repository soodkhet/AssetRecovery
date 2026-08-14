import { toInputDate } from '@/lib/format/datetime'
import type { HandoverLotStatus } from '@/lib/generated/prisma/enums'
import { statusesInLotTab, type LotTab } from '@/lib/warehouse/lot-status'
import type { LotSummaryDto } from '@/lib/warehouse/types'

/**
 * ตัวกรองของ 2 แท็บล็อตส่งมอบ (`44` §8.4 filter 3 ตัว · §8.5 filter 4 ตัว) — **pure ล้วน**
 *
 * แนวเดียวกับ `asset-filters.ts` ของ 2.14: ทุกการตัดสินใจของหน้าจออยู่ที่นี่เพื่อให้เทสต์ได้โดยไม่ต้อง render
 *
 * ⚠️ **"วันที่" ของสองแท็บคนละความหมาย** (§8.4 = วันนัด · §8.5 = วันส่งมอบจริง) และ
 *    `GET /api/handover-lots` กรองได้เฉพาะ `scheduledAt` (`44` §15) ⇒
 *    - แท็บ "รอส่งมอบ" ส่ง `dateFrom`/`dateTo` ให้ API กรองวันนัดให้
 *    - แท็บ "ส่งมอบแล้ว" กรอง `deliveredAt` ฝั่ง client บนชุดที่โหลดมา (`filterByDeliveredDate()`)
 *      เทียบวันตามเวลา **Asia/Bangkok** ไม่ใช่ UTC (แนวเดียวกับ `filterByReceivedDate()`)
 */

export interface LotFilterState {
  /** เลขล็อต / เลขใบส่งมอบ / IMEI / ชื่อลูกหนี้ (`44` §8.4) — ส่งให้ API ค้นให้ */
  search: string
  /** `YYYY-MM-DD` (ค.ศ.) ตามที่ `<input type="date">` ส่งมา — ข้อยกเว้นเดียวของ Rule 01 */
  date: string
  companyId: string
  /** เฉพาะแท็บ "ส่งมอบแล้ว" (รอยืนยัน / ยืนยันแล้ว — §8.5) */
  status: string
}

/** `'all'` = ไม่กรอง (ค่าเดียวกับทุกหน้าในระบบ) */
export const FILTER_ALL = 'all'

export const EMPTY_LOT_FILTERS: LotFilterState = {
  search: '',
  date: '',
  companyId: FILTER_ALL,
  status: FILTER_ALL,
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
  // วันนัดเท่านั้นที่ API กรองให้ได้ — แท็บ "ส่งมอบแล้ว" กรอง `deliveredAt` ที่ client
  if (filters.date !== '' && tab === 'pending_handover') {
    query.dateFrom = filters.date
    query.dateTo = filters.date
  }
  return query
}

/** ตัวเลือกสถานะของแท็บ "ส่งมอบแล้ว" (`44` §8.5 — รอยืนยัน / ยืนยันแล้ว) */
export const DELIVERED_STATUS_OPTIONS: readonly HandoverLotStatus[] = statusesInLotTab('handed_over')

/**
 * กรอง "วันส่งมอบจริง" ฝั่ง client (`44` §8.5) — ล็อตที่ยังไม่มี `deliveredAt` ถูกกรองออกเสมอ
 * เมื่อผู้ใช้ระบุวัน (ยังไม่ยืนยัน = ยังไม่มีวันส่งมอบให้เทียบ)
 */
export function filterByDeliveredDate(items: readonly LotSummaryDto[], date: string): LotSummaryDto[] {
  if (date === '') return [...items]
  return items.filter((item) => item.deliveredAt !== null && toInputDate(item.deliveredAt) === date)
}

export interface LotFilterOption {
  id: string
  name: string
}

/**
 * ตัวเลือกบริษัทจากล็อตที่โหลดมา — ใช้เมื่อผู้ใช้ไม่มีสิทธิ์เรียก `/api/finance-companies`
 * (ธุรการคลังถือแค่ capability ของงานคลัง — `44` §13) · เรียงตามชื่อให้ลำดับคงที่
 */
export function companyOptionsFromLots(items: readonly LotSummaryDto[]): LotFilterOption[] {
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
  items: readonly LotSummaryDto[],
): LotFilterOption[] {
  return fromApi.length > 0 ? [...fromApi] : companyOptionsFromLots(items)
}
