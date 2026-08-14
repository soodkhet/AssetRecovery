import { toInputDate } from '@/lib/format/datetime'
import type { AssetCondition, AssetStatus } from '@/lib/generated/prisma/enums'
import { statusesInAssetTab, type AssetTab } from '@/lib/warehouse/asset-status'
import type { AssetListItemDto } from '@/lib/warehouse/types'

/**
 * ตัวกรอง + การจัดกลุ่มของหน้าคลัง (`44` §8.2 filter 7 ตัว · §8.3 การ์ดตามบริษัท) — **pure ล้วน**
 *
 * ทุกอย่างที่หน้าจอต้อง "ตัดสินใจ" อยู่ที่นี่หมด เพื่อให้เทสต์ได้โดยไม่ต้อง render:
 * - แปลง state ของฟอร์ม → query ที่ตรงกับ `assetListQuerySchema` (คีย์ต้องตรง contract เป๊ะ)
 * - เติมตัวเลือก dropdown ทีม/พนักงานจากแถวที่โหลดมาแล้ว เมื่อผู้ใช้ไม่มีสิทธิ์เรียก `/api/teams`
 *   หรือ `/api/users` (ธุรการคลังถือแค่ `intake_asset` — `44` §13 ไม่ได้ให้ `view_master_data`)
 * - จัดกลุ่มเครื่องในคลังตามบริษัท + ตัดสินว่าติ๊กเลือกแถวไหนได้ (`44` §8.3)
 */

export interface AssetFilterState {
  search: string
  /** วันปิดเคส — `YYYY-MM-DD` (ค.ศ.) ตามที่ `<input type="date">` ส่งมา (ข้อยกเว้นเดียวของ Rule 01) */
  closedDate: string
  companyId: string
  teamId: string
  agentId: string
  status: string
  condition: string
}

/** `'all'` = ไม่กรอง (ค่าเดียวกับหน้าอื่นของระบบ เช่น `cases-manager`) */
export const FILTER_ALL = 'all'

export const EMPTY_ASSET_FILTERS: AssetFilterState = {
  search: '',
  closedDate: '',
  companyId: FILTER_ALL,
  teamId: FILTER_ALL,
  agentId: FILTER_ALL,
  status: FILTER_ALL,
  condition: FILTER_ALL,
}

/** สถานะที่เลือกได้ในแท็บ "รับเข้าคลัง" (`44` §8.2 — รอรับเข้าคลัง / ตีกลับ) */
export const INTAKE_FILTER_STATUSES: readonly AssetStatus[] = statusesInAssetTab('intake')

/**
 * สถานะของเครื่องที่ **หน้าจอ**แท็บนั้นดึงมาแสดง (`44` §8.1 ตาราง badge)
 *
 * ⚠️ ต่างจาก `statusesInAssetTab()` ที่ตอบคำถามคนละข้อ ("เครื่องสถานะนี้ถือว่าอยู่แท็บไหน" · §9.3):
 *    แท็บ **"ในคลัง" นับ `in_custody` + `handover_pending`** ตามตาราง §8.1 เพราะการ์ดของ §8.3 ต้อง
 *    แยกให้เห็น "พร้อมส่ง vs ใน Lot แล้ว" — ถ้าดึงเฉพาะ `in_custody` ยอด "ใน Lot แล้ว" จะเป็น 0 เสมอ
 *    (mockup กรองแค่ `in_custody` — spec ชนะ mockup เมื่อขัดกัน)
 */
export function statusesOnWarehouseTab(tab: AssetTab): AssetStatus[] {
  return tab === 'in_custody' ? ['in_custody', 'handover_pending'] : statusesInAssetTab(tab)
}

export type AssetListQueryInit = Record<string, string | number>

/**
 * ประกอบ query ของ `GET /api/assets` — คีย์ทุกตัวต้องอยู่ใน `API_CONTRACT['asset.list'].query`
 * (`apiPath()` โยน error ถ้าหลุด) · วันเดียว = ช่วง `dateFrom = dateTo` (API ครอบทั้งวันให้เอง)
 *
 * ⚠️ ไม่เลือกสถานะ = ส่งสถานะ**ทั้งหมดของแท็บ**เสมอ ห้ามปล่อยว่าง ไม่อย่างนั้นแท็บจะเห็นเครื่องข้ามแท็บ
 */
export function buildAssetListQuery(
  tab: AssetTab,
  filters: AssetFilterState,
  page: number,
  limit: number,
): AssetListQueryInit {
  const statuses = statusesOnWarehouseTab(tab)
  const selected =
    filters.status !== FILTER_ALL && statuses.some((status) => status === filters.status)
      ? [filters.status]
      : statuses

  const query: AssetListQueryInit = { status: selected.join(','), page, limit }
  if (filters.search.trim() !== '') query.search = filters.search.trim()
  if (filters.companyId !== FILTER_ALL) query.companyId = filters.companyId
  if (filters.teamId !== FILTER_ALL) query.teamId = filters.teamId
  if (filters.agentId !== FILTER_ALL) query.agentId = filters.agentId
  if (filters.condition !== FILTER_ALL) query.condition = filters.condition
  if (filters.closedDate !== '') {
    query.dateFrom = filters.closedDate
    query.dateTo = filters.closedDate
  }
  return query
}

export interface FilterOption {
  id: string
  name: string
}

/**
 * ตัวเลือก dropdown ที่ได้จากแถวที่โหลดมา — ใช้เมื่อเรียก endpoint master data ไม่ได้
 * (เรียงตามชื่อเพื่อให้ลำดับคงที่ ไม่ขึ้นกับลำดับแถวที่ API ส่งมา)
 */
export function optionsFromAssets(
  items: readonly AssetListItemDto[],
  field: 'team' | 'agent' | 'company',
): FilterOption[] {
  const found = new Map<string, string>()
  for (const item of items) {
    const id = field === 'team' ? item.teamId : field === 'agent' ? item.agentId : item.companyId
    const name = field === 'team' ? item.teamName : field === 'agent' ? item.agentName : item.companyName
    if (id === null || name === null) continue
    if (!found.has(id)) found.set(id, name)
  }
  return [...found.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((left, right) => left.name.localeCompare(right.name, 'th'))
}

/** ใช้ตัวเลือกจาก master data ถ้าเรียกได้ ไม่งั้นถอยไปใช้ค่าที่พบในแถว (ห้ามปล่อย dropdown ว่าง) */
export function filterOptionsOrFallback(
  fromApi: readonly FilterOption[],
  items: readonly AssetListItemDto[],
  field: 'team' | 'agent' | 'company',
): FilterOption[] {
  return fromApi.length > 0 ? [...fromApi] : optionsFromAssets(items, field)
}

// ── แท็บ "ในคลัง" (`44` §8.3) ───────────────────────────────────────────────

export interface CustodyCompanyGroup {
  companyId: string
  companyName: string
  /** เครื่องทั้งหมดของบริษัทในแท็บนี้ (in_custody + handover_pending) */
  total: number
  /** พร้อมส่ง = ยังไม่ถูกใส่ล็อต (`in_custody`) — ตัวเลขซ้ายบนการ์ด */
  ready: number
  /** อยู่ในล็อตแล้ว (`handover_pending`) */
  inLot: number
  byCondition: Readonly<Partial<Record<AssetCondition, number>>>
}

/**
 * การ์ด 1 ใบ = 1 บริษัท (`44` §8.3) พร้อม breakdown "พร้อมส่ง vs ใน Lot แล้ว"
 * เรียงตามจำนวนเครื่องมากไปน้อย แล้วตามชื่อบริษัท (ลำดับคงที่)
 */
export function groupCustodyByCompany(items: readonly AssetListItemDto[]): CustodyCompanyGroup[] {
  const groups = new Map<string, CustodyCompanyGroup & { byCondition: Partial<Record<AssetCondition, number>> }>()

  for (const item of items) {
    const existing = groups.get(item.companyId) ?? {
      companyId: item.companyId,
      companyName: item.companyName,
      total: 0,
      ready: 0,
      inLot: 0,
      byCondition: {},
    }
    existing.total += 1
    if (isSelectableForLot(item)) existing.ready += 1
    else existing.inLot += 1
    if (item.condition !== null) {
      existing.byCondition[item.condition] = (existing.byCondition[item.condition] ?? 0) + 1
    }
    groups.set(item.companyId, existing)
  }

  return [...groups.values()].sort(
    (left, right) => right.total - left.total || left.companyName.localeCompare(right.companyName, 'th'),
  )
}

/**
 * ติ๊กเลือกเข้าล็อตได้เฉพาะเครื่องที่ยัง `in_custody` และยังไม่มีล็อต (`44` §8.3 · §10)
 * — เงื่อนไขเดียวกับด่าน `ASSET_NOT_IN_CUSTODY`/`ASSET_ALREADY_IN_LOT` ของ `assertLotAssets()`
 */
export function isSelectableForLot(item: AssetListItemDto): boolean {
  return item.assetStatus === 'in_custody' && item.lotId === null
}

export function selectableAssetIds(items: readonly AssetListItemDto[]): string[] {
  return items.filter(isSelectableForLot).map((item) => item.id)
}

/** id ที่เลือกไว้แต่ไม่อยู่ในรายการที่มองเห็นแล้ว ต้องถูกตัดทิ้ง (กันส่งเครื่องที่ถูกกรองออกไปเข้าล็อต) */
export function keepSelectable(selected: readonly string[], items: readonly AssetListItemDto[]): string[] {
  const allowed = new Set(selectableAssetIds(items))
  return selected.filter((id) => allowed.has(id))
}

/**
 * ค้นในชุดที่โหลดมาแล้ว (drill-down ของ §8.3 ไม่ยิง API ใหม่ทุกตัวอักษร)
 * — ชื่อ/เลขสัญญา/อุปกรณ์ เทียบแบบ contains ส่วน **IMEI/serial เทียบ exact เท่านั้น** (`44` §6.5
 *   ห้าม fuzzy) ⇒ กติกาเดียวกับ `where` ของ `listAssets()` ฝั่ง API
 */
export function matchesAssetSearch(item: AssetListItemDto, keyword: string): boolean {
  const needle = keyword.trim().toLowerCase()
  if (needle === '') return true
  return (
    item.caseRef.toLowerCase().includes(needle) ||
    item.debtorName.toLowerCase().includes(needle) ||
    item.deviceDesc.toLowerCase().includes(needle) ||
    item.imeiContract === keyword.trim() ||
    item.imeiActual === keyword.trim() ||
    item.serialContract === keyword.trim() ||
    item.serialActual === keyword.trim()
  )
}

/**
 * กรอง "วันที่รับเข้า" ของ drill-down ฝั่ง client (`44` §8.3)
 * — `GET /api/assets` มี `dateFrom`/`dateTo` ที่กรอง **วันปิดเคส** เท่านั้น (`44` §15) จึงกรอง
 *   `receivedAt` ที่หน้าจอบนชุดที่โหลดมา · เทียบวันตามโซนเวลา **Asia/Bangkok** ไม่ใช่ UTC
 */
export function filterByReceivedDate(items: readonly AssetListItemDto[], date: string): AssetListItemDto[] {
  if (date === '') return [...items]
  return items.filter((item) => item.receivedAt !== null && toInputDate(item.receivedAt) === date)
}
