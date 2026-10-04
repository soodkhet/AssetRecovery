import { toInputDate } from '@/lib/format/datetime'
import { portalBillingStatusDisplay, type PortalBillingStatusCode } from '@/lib/portal/status-map'

/**
 * ตัวช่วยหน้า "วางบิล" / "ใบกำกับภาษี" / กราฟภาพรวมของพอร์ทัล — **pure ล้วน** (Portal-P9 · `97` §6.2/§6.3)
 *
 * - ไม่มีสูตรเงินใหม่: ยอดค้างต่อรอบมาจาก API (`arOutstandingSatang()` ฝั่ง server — `22` §6.11)
 *   ที่นี่แค่รวมยอดค้างของรอบที่ API ส่งมา (integer satang) เพื่อแสดงการ์ดสรุป
 * - วันที่เทียบแบบ `YYYY-MM-DD` ตามเวลาไทย (ไม่ใช่ UTC)
 */

// ── รอบวางบิล ────────────────────────────────────────────────────────────────

export interface PortalBillingRowLike {
  outstandingSatang: number
  /** `YYYY-MM-DD` */
  dueDate: string
  statusDisplay: { code: PortalBillingStatusCode }
}

export type PortalBillingFilter = 'all' | PortalBillingStatusCode

export const PORTAL_BILLING_FILTER_CODES: readonly PortalBillingStatusCode[] = ['sent', 'partially_paid', 'paid']

export interface PortalBillingFilterOption {
  value: PortalBillingFilter
  label: string
}

/** ตัวเลือกกรองสถานะ — ป้ายมาจาก status-map กลาง (คำเดียวกับ badge) */
export function portalBillingFilterOptions(): PortalBillingFilterOption[] {
  return [
    { value: 'all', label: 'สถานะทั้งหมด' },
    ...PORTAL_BILLING_FILTER_CODES.map((code) => ({
      value: code,
      label: portalBillingStatusDisplay(code)?.label ?? code,
    })),
  ]
}

export function isPortalBillingFilter(value: string): value is PortalBillingFilter {
  return value === 'all' || (PORTAL_BILLING_FILTER_CODES as readonly string[]).includes(value)
}

export function filterPortalBillingRows<T extends PortalBillingRowLike>(rows: readonly T[], filter: PortalBillingFilter): T[] {
  return filter === 'all' ? [...rows] : rows.filter((row) => row.statusDisplay.code === filter)
}

/** วันนี้ตามเวลาไทยแบบ `YYYY-MM-DD` */
export function bangkokToday(now: Date = new Date()): string {
  return toInputDate(now)
}

/** ยังค้างชำระและเลยวันครบกำหนดแล้ว (วันครบกำหนดเองยังไม่นับว่าเลย) */
export function isPortalBillingOverdue(row: PortalBillingRowLike, today: string): boolean {
  return row.outstandingSatang > 0 && row.dueDate < today
}

export interface PortalBillingSummary {
  /** รวมยอดค้างของทุกรอบที่แสดง (satang) */
  outstandingSatang: number
  batchCount: number
  /** รอบที่ยังมียอดค้าง */
  openCount: number
  /** รอบที่ค้างและเลยกำหนดแล้ว */
  overdueCount: number
  overdueSatang: number
}

export function portalBillingSummary(rows: readonly PortalBillingRowLike[], today: string): PortalBillingSummary {
  let outstandingSatang = 0
  let openCount = 0
  let overdueCount = 0
  let overdueSatang = 0
  for (const row of rows) {
    if (row.outstandingSatang <= 0) continue
    outstandingSatang += row.outstandingSatang
    openCount += 1
    if (isPortalBillingOverdue(row, today)) {
      overdueCount += 1
      overdueSatang += row.outstandingSatang
    }
  }
  return { outstandingSatang, batchCount: rows.length, openCount, overdueCount, overdueSatang }
}

// ── ใบกำกับภาษี / ไฟล์ดาวน์โหลด ─────────────────────────────────────────────

/**
 * ชื่อไฟล์จาก `content-disposition` (คู่กับ `attachmentHeader()` — `filename*` RFC 5987 ก่อน แล้วค่อย `filename`)
 */
export function attachmentFileName(disposition: string | null | undefined, fallback: string): string {
  const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  if (encoded !== undefined) {
    try {
      return decodeURIComponent(encoded)
    } catch {
      // ชื่อเข้ารหัสเพี้ยน → ลองแบบ ASCII ต่อ
    }
  }
  const plain = disposition?.match(/filename="([^"]+)"/i)?.[1]
  return plain ?? fallback
}

/** URL ดาวน์โหลด PDF ใบกำกับของพอร์ทัล */
export function portalTaxInvoiceDownloadUrl(id: string): string {
  return `/api/portal/tax-invoices/${encodeURIComponent(id)}/download`
}

// ── ป้ายเดือนแบบสั้นของกราฟ (จอแคบป้ายยาวซ้อนกัน) ───────────────────────────

const THAI_MONTH_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'] as const

/** `YYYY-MM-DD` (วันแรกของเดือน) → "พ.ค. 69" (พ.ศ. 2 หลัก) · รูปแบบไม่ถูก → `fallback` */
export function portalShortMonthLabel(monthIso: string, fallback: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(monthIso)
  if (match === null) return fallback
  const year = Number(match[1])
  const month = THAI_MONTH_SHORT[Number(match[2]) - 1]
  if (month === undefined) return fallback
  return `${month} ${String((year + 543) % 100).padStart(2, '0')}`
}
