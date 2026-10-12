import { fmtPercent, fmtSatangSymbol } from '@/lib/format/money'
import type { PortalServiceFeeDto } from '@/lib/portal/serializers'
import {
  PORTAL_CASE_STATUS_CODES,
  portalCaseStatusDisplayOf,
  type PortalCaseStatusCode,
} from '@/lib/portal/status-map'

/**
 * ตรรกะ pure ของหน้า "เคสของเรา" ในพอร์ทัล (`97` §6.1/§8 · มติ U6/O43–O46) — ตัวกรอง ↔ URL query ↔ query ของ
 * `GET /api/portal/cases` · แถวค่าบริการของ drawer · path รูปทรัพย์ · ไม่มีสูตรเงิน (แค่จัดรูปแบบแสดงผล)
 */

export const PORTAL_CASES_PATH = '/portal/cases'
export const PORTAL_CASES_PAGE_SIZE = 20
/** ความยาวสูงสุดของคำค้น — ตรง `portalCaseListQuerySchema.search` */
export const PORTAL_CASES_SEARCH_MAX = 100

export type PortalCaseStatusFilter = PortalCaseStatusCode | 'all'

export interface PortalCasesFilters {
  status: PortalCaseStatusFilter
  search: string
  page: number
  /** id ของเคสที่เปิด drawer อยู่ (`null` = ปิด) */
  caseId: string | null
}

export const DEFAULT_PORTAL_CASES_FILTERS: PortalCasesFilters = { status: 'all', search: '', page: 1, caseId: null }

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** ตัวเลือกตัวกรองสถานะ — ใช้รหัสฝั่งบริษัท + ป้ายไทยจาก status-map (ไม่มี enum ภายใน) */
export const PORTAL_CASE_STATUS_OPTIONS: readonly { value: PortalCaseStatusFilter; label: string }[] = [
  { value: 'all', label: 'สถานะทั้งหมด' },
  ...PORTAL_CASE_STATUS_CODES.map((code) => ({ value: code, label: portalCaseStatusDisplayOf(code).label })),
]

function isStatusCode(value: string): value is PortalCaseStatusCode {
  return (PORTAL_CASE_STATUS_CODES as readonly string[]).includes(value)
}

/** อ่านค่าจาก URLSearchParams — ค่าที่ไม่ถูกต้องตกเป็นค่าเริ่มต้นเงียบ ๆ (ไม่ยิง 400 จาก URL ที่ผู้ใช้พิมพ์เอง) */
export function parsePortalCasesFilters(params: Pick<URLSearchParams, 'get'>): PortalCasesFilters {
  const status = params.get('status') ?? ''
  const search = (params.get('search') ?? '').trim().slice(0, PORTAL_CASES_SEARCH_MAX)
  const pageRaw = params.get('page') ?? ''
  const page = /^\d{1,6}$/.test(pageRaw) ? Math.max(1, Number.parseInt(pageRaw, 10)) : 1
  const caseRaw = params.get('case') ?? ''
  return {
    status: isStatusCode(status) ? status : 'all',
    search,
    page,
    caseId: UUID_PATTERN.test(caseRaw) ? caseRaw.toLowerCase() : null,
  }
}

/** query ของหน้าเว็บ (`/portal/cases?…`) — ละค่าเริ่มต้นเพื่อให้ URL สั้น · คืน `''` เมื่อไม่มีตัวกรอง */
export function portalCasesPageQuery(filters: PortalCasesFilters): string {
  const params = new URLSearchParams()
  if (filters.status !== 'all') params.set('status', filters.status)
  const search = filters.search.trim()
  if (search !== '') params.set('search', search.slice(0, PORTAL_CASES_SEARCH_MAX))
  if (filters.page > 1) params.set('page', String(filters.page))
  if (filters.caseId !== null) params.set('case', filters.caseId)
  const query = params.toString()
  return query === '' ? '' : `?${query}`
}

/** path ของ `GET /api/portal/cases` ตามตัวกรอง (ไม่รวม `case` ของ drawer) */
export function portalCasesApiPath(filters: PortalCasesFilters, limit = PORTAL_CASES_PAGE_SIZE): string {
  const params = new URLSearchParams()
  if (filters.status !== 'all') params.set('status', filters.status)
  const search = filters.search.trim()
  if (search !== '') params.set('search', search.slice(0, PORTAL_CASES_SEARCH_MAX))
  params.set('page', String(filters.page))
  params.set('limit', String(limit))
  return `/api/portal/cases?${params.toString()}`
}

export function portalCaseDetailApiPath(caseId: string): string {
  return `/api/portal/cases/${encodeURIComponent(caseId)}`
}

/** รูปทรัพย์ลำดับที่ `index` (เริ่ม 0) — stream ผ่าน server ใช้เป็น `<img src>` ได้ตรง ๆ */
export function portalAssetPhotoPath(assetId: string, index: number): string {
  return `/api/portal/assets/${encodeURIComponent(assetId)}/photos/${index}`
}

/** ลำดับรูปที่วนได้ (ลูกศรซ้าย/ขวาใน lightbox) */
export function wrapPhotoIndex(index: number, count: number): number {
  if (count <= 0) return 0
  return ((index % count) + count) % count
}

export function portalCasesLastPage(total: number, limit = PORTAL_CASES_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / limit))
}

/**
 * หน้าที่ขอเกินจำนวนหน้าจริง (เช่นลิงก์เก่า `?page=999` หรือรายการลดลงหลังเปิดค้างไว้) — mytester PT-03
 * มีรายการแต่หน้านี้ว่าง ⇒ คืนหน้าสุดท้ายที่มีข้อมูลให้พากลับไป · ปกติ/ไม่มีรายการเลย ⇒ `null`
 */
export function portalCasesOverflowPage(page: number, limit: number, itemCount: number, total: number): number | null {
  if (itemCount > 0 || total === 0) return null
  const lastPage = portalCasesLastPage(total, limit)
  return page > lastPage ? lastPage : null
}

/** ช่วงแถวที่แสดง เช่น "21–40 จาก 57" — `null` เมื่อไม่มีแถว */
export function portalCasesRange(page: number, limit: number, itemCount: number, total: number): string | null {
  if (itemCount === 0 || total === 0) return null
  const from = (page - 1) * limit + 1
  const to = from + itemCount - 1
  return `${from.toLocaleString('th-TH')}–${to.toLocaleString('th-TH')} จาก ${total.toLocaleString('th-TH')}`
}

export function hasActivePortalCasesFilter(filters: PortalCasesFilters): boolean {
  return filters.status !== 'all' || filters.search.trim() !== ''
}

// ── ค่าบริการ (snapshot ตอนอนุมัติ — `97` §6.1 + v4.1 §6.6) ───────────────────

export interface PortalServiceFeeRow {
  label: string
  value: string
  /** บรรทัดย่อยใต้ตัวเลข (เช่นยอดเดิม + ใบลดหนี้) — ไม่มี = ไม่แสดง */
  detail?: string
  /**
   * ส่วนของ `detail` ทีละท่อน (คั่นด้วย " · ") — จอแคบตัดบรรทัดได้เฉพาะระหว่างท่อน ไม่ตัดกลางเลขเอกสาร
   * (mytester3 I3-03 — "CN-NDP-2569-" / "0012")
   */
  detailParts?: string[]
}

/**
 * ข้อความแทนแถวค่าบริการเมื่อยังไม่มี snapshot — เคส "ไม่รับเคส" ปิดถาวรแล้ว ไม่ได้รออนุมัติ ⇒ ไม่มีค่าบริการ
 * (mytester3 I3-02)
 */
export function portalServiceFeeEmptyText(code: PortalCaseStatusCode): string {
  return code === 'declined' ? 'ไม่มีค่าบริการ (ไม่รับเคส)' : 'ค่าบริการจะถูกกำหนดเมื่อเคสได้รับการอนุมัติ'
}

/**
 * แถวค่าบริการของ drawer — ป้ายไทยทั้งหมด (ไม่ส่ง enum ดิบขึ้นจอ) · `null` = ยังไม่อนุมัติ (ผู้เรียกแสดงข้อความแทน)
 * · เงินเป็น satang จาก API → จัดรูปแบบอย่างเดียว ไม่คำนวณ
 */
export function portalServiceFeeRows(fee: PortalServiceFeeDto | null): PortalServiceFeeRow[] | null {
  if (fee === null) return null
  const rows: PortalServiceFeeRow[] = [{ label: 'รูปแบบค่าบริการ', value: fee.modelLabel }]

  if (fee.baseSatang !== null && fee.model !== 'SUCCESS_FEE') {
    rows.push({ label: 'ค่าบริการคงที่ต่อเคส', value: fmtSatangSymbol(fee.baseSatang) })
  }
  if (fee.ratePct !== null && fee.model !== 'FLAT') {
    const basis = fee.basisLabel === null ? '' : ` ของ${fee.basisLabel}`
    rows.push({ label: 'อัตราค่าบริการเมื่อสำเร็จ', value: `${fmtPercent(fee.ratePct)}${basis}` })
  }
  rows.push({ label: 'เมื่อติดตามไม่สำเร็จ', value: failFeeText(fee) })
  // staging E-073 — บอกว่าเป็นยอดก่อน/รวม VAT ตามโหมดปัจจุบันของบริษัท
  const vat = fee.vatLabel === null ? '' : ` (${fee.vatLabel})`
  if (fee.actualRevenueSatang !== null) {
    // มติชั่วคราว M9 (PT-01) — เกิดรายได้แล้ว ⇒ แสดงยอดจริงแทนยอดประมาณการ
    const actualVat = fee.actualRevenueVatLabel === null ? '' : ` (${fee.actualRevenueVatLabel})`
    const actualRow: PortalServiceFeeRow = { label: 'ค่าบริการ (ยอดจริง)', value: `${fmtSatangSymbol(fee.actualRevenueSatang)}${actualVat}` }
    // มติ PO 12/10/2569 I2-01 — ยอดจริงหักใบลดหนี้ที่ออกแล้ว ⇒ บอกยอดเดิม + เลขใบลดหนี้ทุกใบ
    const parts = actualRevenueCreditNoteDetail(fee)
    if (parts !== null) {
      actualRow.detail = parts.join(' · ')
      actualRow.detailParts = parts
    }
    rows.push(actualRow)
  } else if (fee.closedFail) {
    // มติชั่วคราว M9 — เคสไม่สำเร็จ ⇒ ประมาณการ = ค่าบริการกรณีไม่สำเร็จ (ไม่มี = ไม่เรียกเก็บ)
    rows.push({
      label: 'ค่าบริการโดยประมาณ',
      value: fee.failFeeSatang === null ? 'ไม่เรียกเก็บ' : `${fmtSatangSymbol(fee.failFeeSatang)}${vat}`,
    })
  } else if (fee.projectedRevenueSatang !== null) {
    rows.push({ label: 'ค่าบริการโดยประมาณ', value: `${fmtSatangSymbol(fee.projectedRevenueSatang)}${vat}` })
  }
  return rows
}

/** "ยอดเดิม ฿200.00 · ลดหนี้ CN-… −฿200.00" — ไม่มีใบลดหนี้ ⇒ `null` (มติ PO 12/10/2569 I2-01) */
function actualRevenueCreditNoteDetail(fee: PortalServiceFeeDto): string[] | null {
  if (fee.actualRevenueCreditNotes.length === 0 || fee.actualRevenueOriginalSatang === null) return null
  const notes = fee.actualRevenueCreditNotes.map(
    (note) => `ลดหนี้ ${note.creditNoteNumber} −${fmtSatangSymbol(note.totalSatang)}`,
  )
  return [`ยอดเดิม ${fmtSatangSymbol(fee.actualRevenueOriginalSatang)}`, ...notes]
}

/** มติ U165 — ยอดกรณีไม่สำเร็จแยกจากกรณีสำเร็จ ใช้ได้ทุกโมเดล */
function failFeeText(fee: PortalServiceFeeDto): string {
  return fee.failFeeSatang === null ? 'ไม่เรียกเก็บ' : `เรียกเก็บ ${fmtSatangSymbol(fee.failFeeSatang)}`
}

/** staging E-074 — ป้ายรูปในแกลเลอรีพอร์ทัล: ชื่อมุม (ถ้ามี) ไม่งั้น "รูปที่ N" */
export function portalPhotoLabel(labels: readonly string[], index: number): string {
  return labels[index] ?? `รูปที่ ${index + 1}`
}
