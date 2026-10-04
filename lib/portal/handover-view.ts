import { PORTAL_LOT_STATUS_CODES, type PortalLotStatusCode } from '@/lib/portal/status-map'

/**
 * ตรรกะหน้าจอ "ส่งมอบ" ของพอร์ทัลบริษัทไฟแนนซ์ (`97` §6.4 · §10.2 · §18 · มติ O43 D6/D8 · O44) — **pure ล้วน**
 *
 * - ตัวกรองอยู่ใน query string ของหน้า (`/portal/handover?status=&dateFrom=&dateTo=&search=&page=&lot=`)
 *   แล้วแปลงเป็น URL ของ `GET /api/portal/handover-lots` ด้วยชื่อพารามิเตอร์เดียวกัน
 * - สถานะใช้ **รหัสของพอร์ทัล** (`awaiting_dispatch`/`dispatched`/`delivered`) — ไม่มี enum ภายในหลุดมาถึงจอ
 * - วันที่ในตัวกรองเป็น ISO ค.ศ. `YYYY-MM-DD` เพราะผูกกับ `<input type="date">` (ข้อยกเว้นเดียวของ Rule 01)
 */

export const PORTAL_LOT_PAGE_SIZE = 12

export type PortalLotStatusFilter = 'all' | PortalLotStatusCode

export interface PortalLotFilters {
  status: PortalLotStatusFilter
  /** `YYYY-MM-DD` หรือ `''` */
  dateFrom: string
  dateTo: string
  search: string
  page: number
  /** ล็อตที่เปิดรายละเอียดอยู่ (`''` = ไม่ได้เปิด) */
  lot: string
}

export const DEFAULT_PORTAL_LOT_FILTERS: Readonly<PortalLotFilters> = {
  status: 'all',
  dateFrom: '',
  dateTo: '',
  search: '',
  page: 1,
  lot: '',
}

/** ตัวเลือกตัวกรองสถานะ (ป้ายตรง `97` §10.2) */
export const PORTAL_LOT_STATUS_FILTER_OPTIONS: readonly { value: PortalLotStatusFilter; label: string }[] = [
  { value: 'all', label: 'สถานะทั้งหมด' },
  { value: 'awaiting_dispatch', label: 'รอดำเนินการส่งมอบ' },
  { value: 'dispatched', label: 'จัดส่งแล้ว รอยืนยัน' },
  { value: 'delivered', label: 'ส่งมอบสำเร็จ' },
]

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SEARCH_MAX = 100

export interface SearchParamsLike {
  get(name: string): string | null
}

function isStatusCode(value: string): value is PortalLotStatusCode {
  return (PORTAL_LOT_STATUS_CODES as readonly string[]).includes(value)
}

/** วันที่ `YYYY-MM-DD` ที่มีอยู่จริงบนปฏิทิน (กัน `2569-02-31` ที่พิมพ์มือใน URL) */
export function isIsoDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/** query string ของหน้า → ตัวกรอง · ค่าที่อ่านไม่ได้ถอยเป็นค่าเริ่มต้นเงียบ ๆ (ไม่ยิง request ที่รู้ว่าจะ 400) */
export function parsePortalLotFilters(params: SearchParamsLike): PortalLotFilters {
  const statusRaw = (params.get('status') ?? '').trim()
  const dateFromRaw = (params.get('dateFrom') ?? '').trim()
  const dateToRaw = (params.get('dateTo') ?? '').trim()
  const pageRaw = Number((params.get('page') ?? '').trim())
  const lotRaw = (params.get('lot') ?? '').trim()

  const dateFrom = isIsoDate(dateFromRaw) ? dateFromRaw : ''
  let dateTo = isIsoDate(dateToRaw) ? dateToRaw : ''
  // ช่วงกลับหัว ⇒ ทิ้งวันสิ้นสุด (API จะตอบ 400)
  if (dateFrom !== '' && dateTo !== '' && dateFrom > dateTo) dateTo = ''

  return {
    status: isStatusCode(statusRaw) ? statusRaw : 'all',
    dateFrom,
    dateTo,
    search: (params.get('search') ?? '').trim().slice(0, SEARCH_MAX),
    page: Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : 1,
    lot: UUID_PATTERN.test(lotRaw) ? lotRaw : '',
  }
}

/** ตัวกรอง → query string ของหน้า (ตัดค่าเริ่มต้นออก) · ไม่มีอะไรเลย = `''` */
export function portalLotFiltersToQuery(filters: PortalLotFilters): string {
  const params = new URLSearchParams()
  if (filters.status !== 'all') params.set('status', filters.status)
  if (filters.dateFrom !== '') params.set('dateFrom', filters.dateFrom)
  if (filters.dateTo !== '') params.set('dateTo', filters.dateTo)
  if (filters.search.trim() !== '') params.set('search', filters.search.trim())
  if (filters.page > 1) params.set('page', String(filters.page))
  if (filters.lot !== '') params.set('lot', filters.lot)
  const query = params.toString()
  return query === '' ? '' : `?${query}`
}

/**
 * เปลี่ยนตัวกรอง — ทุกการเปลี่ยนที่ไม่ใช่หน้า/ล็อตจะกลับไปหน้า 1 · ช่วงวันที่กลับหัวจะดันอีกฝั่งตาม
 */
export function updatePortalLotFilters(current: PortalLotFilters, patch: Partial<PortalLotFilters>): PortalLotFilters {
  const next: PortalLotFilters = { ...current, ...patch }
  const resetsPage = (['status', 'dateFrom', 'dateTo', 'search'] as const).some(
    (key) => patch[key] !== undefined && patch[key] !== current[key],
  )
  if (resetsPage && patch.page === undefined) next.page = 1
  if (next.dateFrom !== '' && next.dateTo !== '' && next.dateFrom > next.dateTo) {
    if (patch.dateFrom !== undefined) next.dateTo = next.dateFrom
    else next.dateFrom = next.dateTo
  }
  return next
}

/** URL ของ `GET /api/portal/handover-lots` (ไม่ส่ง `lot` — เป็นสถานะของหน้าจอ) */
export function portalLotListApiUrl(filters: PortalLotFilters, limit = PORTAL_LOT_PAGE_SIZE): string {
  const params = new URLSearchParams()
  if (filters.status !== 'all') params.set('status', filters.status)
  if (filters.dateFrom !== '') params.set('dateFrom', filters.dateFrom)
  if (filters.dateTo !== '') params.set('dateTo', filters.dateTo)
  if (filters.search.trim() !== '') params.set('search', filters.search.trim())
  params.set('page', String(filters.page))
  params.set('limit', String(limit))
  return `/api/portal/handover-lots?${params.toString()}`
}

export function portalLotDetailApiUrl(lotId: string): string {
  return `/api/portal/handover-lots/${encodeURIComponent(lotId)}`
}

export function portalLotDownloadApiUrl(lotId: string): string {
  return `/api/portal/handover-lots/${encodeURIComponent(lotId)}/download`
}

export function portalAssetPhotoApiUrl(assetId: string, index: number): string {
  return `/api/portal/assets/${encodeURIComponent(assetId)}/photos/${index}`
}

/** มีตัวกรองใดทำงานอยู่ (แยกข้อความ empty state "ยังไม่มีล็อต" กับ "ไม่พบตามเงื่อนไข") */
export function hasActivePortalLotFilters(filters: PortalLotFilters): boolean {
  return filters.status !== 'all' || filters.dateFrom !== '' || filters.dateTo !== '' || filters.search.trim() !== ''
}

/** หน้าสุดท้าย (อย่างน้อย 1) */
export function portalLotLastPage(total: number, limit: number): number {
  if (!Number.isFinite(total) || total <= 0 || limit <= 0) return 1
  return Math.ceil(total / limit)
}

export type PortalLotDownloadState =
  /** ผู้ใช้ไม่มีสิทธิ์ดาวน์โหลด ⇒ ซ่อนปุ่ม */
  | { visible: false }
  | { visible: true; enabled: true }
  | { visible: true; enabled: false; hint: string }

export const LOT_DOWNLOAD_LOCKED_HINT = 'ดาวน์โหลดได้เมื่อการส่งมอบได้รับการยืนยันแล้ว'

/**
 * ปุ่ม "ดาวน์โหลดใบเซ็นรับ" — ซ่อนเมื่อไม่มีสิทธิ์ดาวน์โหลด · disabled พร้อมคำอธิบายจนกว่าล็อตจะ confirmed
 * (`downloadable` มาจาก backend = `portalLotDownloadable()`)
 */
export function portalLotDownloadState(input: { downloadable: boolean; canDownload: boolean }): PortalLotDownloadState {
  if (!input.canDownload) return { visible: false }
  if (input.downloadable) return { visible: true, enabled: true }
  return { visible: true, enabled: false, hint: LOT_DOWNLOAD_LOCKED_HINT }
}

/** ชื่อไฟล์จาก `content-disposition` (`filename*` ก่อน แล้วจึง `filename`) — อ่านไม่ได้ใช้ชื่อสำรอง */
export function fileNameFromDisposition(disposition: string | null, fallback: string): string {
  const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  if (encoded !== undefined) {
    try {
      return decodeURIComponent(encoded)
    } catch {
      // ตกไปอ่าน filename ธรรมดา
    }
  }
  const plain = disposition?.match(/filename="([^"]+)"/i)?.[1]
  return plain !== undefined && plain !== '' ? plain : fallback
}
