import type { CustomerWhtStatus } from '@/lib/generated/prisma/enums'
import type { StatusBadgeGroup } from '@/lib/ui/status-badge'

/**
 * 50 ทวิ ที่ลูกค้า (บริษัทไฟแนนซ์) หักเรา — มติ PO 05/10/2569 U40 "แบบเต็ม" — **pure ล้วน** ใช้ร่วม FE/BE
 *
 * ### กติกาที่ห้ามหลุด
 * - รายการ `pending` ("รอ 50 ทวิ จากลูกค้า") **เกิดอัตโนมัติ**ตอนจับคู่เงินรับที่ถูกหักภาษีเท่านั้น
 *   (ไม่มี endpoint สร้างมือ) — ยอดคือ `cash_receipts.wht_withheld_by_customer_satang` ณ ตอนจับคู่ (snapshot)
 * - `pending → received` ทางเดียว (กรอกเลขที่/วันที่/ยอดในหนังสือ + แนบไฟล์) · `received` แก้ต่อไม่ได้
 * - ยอดในหนังสือไม่ตรงยอดที่ถูกหัก ⇒ **เตือนใน `warnings` ไม่บล็อก** (ไม่ใช่ error code — รายชื่อ warning-only
 *   code ทั้งระบบไม่เปลี่ยน) · เก็บผลเทียบลง audit
 * - ระบบ**เก็บข้อมูล + ติดตาม + ส่งออก**เท่านั้น — เครดิตภาษีใช้ตอนยื่นภาษีเงินได้นิติบุคคลโดยสำนักงานบัญชี
 *   (Hybrid Accounting Boundary — ไม่ลง GL เอง)
 */

/** capability — ธุรการ/การเงิน/บัญชี จัดการ (ธุรการช่วยตามหนังสือได้ตามคำผู้ใช้) · บริหาร ดู */
export const MANAGE_CUSTOMER_WHT = 'manage_customer_wht'

export const CUSTOMER_WHT_STATUS_LABEL: Readonly<Record<CustomerWhtStatus, string>> = {
  pending: 'รอ 50 ทวิ จากลูกค้า',
  received: 'ได้รับแล้ว',
}

export const CUSTOMER_WHT_STATUS_GROUP: Readonly<Record<CustomerWhtStatus, StatusBadgeGroup>> = {
  pending: 'pending',
  received: 'success',
}

export const CUSTOMER_WHT_TRANSITIONS: Readonly<Record<CustomerWhtStatus, readonly CustomerWhtStatus[]>> = {
  pending: ['received'],
  received: [],
}

export function canReceiveCustomerWht(status: CustomerWhtStatus): boolean {
  return CUSTOMER_WHT_TRANSITIONS[status].includes('received')
}

// ── อายุค้างรับ ─────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000

/** จำนวนวันตั้งแต่วันรับเงิน (date-only UTC) ถึงวันนี้ตามปฏิทินไทย — ไม่ติดลบ */
export function customerWhtAgeDays(withheldDate: Date, now: Date = new Date()): number {
  // วันนี้ตามเวลาไทย (UTC+7) แปลงเป็น date-only UTC ให้เทียบกับคอลัมน์ DATE ได้ตรงวัน
  const bangkok = new Date(now.getTime() + 7 * 3_600_000)
  const today = Date.UTC(bangkok.getUTCFullYear(), bangkok.getUTCMonth(), bangkok.getUTCDate())
  const start = Date.UTC(withheldDate.getUTCFullYear(), withheldDate.getUTCMonth(), withheldDate.getUTCDate())
  return Math.max(0, Math.round((today - start) / DAY_MS))
}

export const CUSTOMER_WHT_AGE_BUCKETS = ['0_30', '31_60', '61_90', 'over_90'] as const
export type CustomerWhtAgeBucket = (typeof CUSTOMER_WHT_AGE_BUCKETS)[number]

export const CUSTOMER_WHT_AGE_BUCKET_LABEL: Readonly<Record<CustomerWhtAgeBucket, string>> = {
  '0_30': 'ไม่เกิน 30 วัน',
  '31_60': '31–60 วัน',
  '61_90': '61–90 วัน',
  over_90: 'เกิน 90 วัน',
}

export function customerWhtAgeBucket(ageDays: number): CustomerWhtAgeBucket {
  if (ageDays <= 30) return '0_30'
  if (ageDays <= 60) return '31_60'
  if (ageDays <= 90) return '61_90'
  return 'over_90'
}

/**
 * ช่วงวันที่รับเงิน (date-only UTC) ที่ตรงกับช่วงอายุ — ใช้กรองที่ DB
 * `gte`/`lte` = ขอบของ `withheld_date` (ค่าที่ไม่ใส่ = ไม่จำกัดฝั่งนั้น)
 */
export function withheldDateRangeOf(bucket: CustomerWhtAgeBucket, now: Date = new Date()): { gte?: Date; lte?: Date } {
  const bangkok = new Date(now.getTime() + 7 * 3_600_000)
  const today = Date.UTC(bangkok.getUTCFullYear(), bangkok.getUTCMonth(), bangkok.getUTCDate())
  const daysAgo = (days: number): Date => new Date(today - days * DAY_MS)
  switch (bucket) {
    case '0_30':
      return { gte: daysAgo(30) }
    case '31_60':
      return { gte: daysAgo(60), lte: daysAgo(31) }
    case '61_90':
      return { gte: daysAgo(90), lte: daysAgo(61) }
    case 'over_90':
      return { lte: daysAgo(91) }
  }
}

// ── เทียบยอดในหนังสือ (เตือน ไม่บล็อก) ────────────────────────────────────────

/** ข้อความเตือนเมื่อยอดภาษีในหนังสือไม่ตรงยอดที่ลูกค้าหักไว้ตอนโอน — `null` = ตรงกัน */
export function customerWhtAmountWarning(input: {
  withheldSatang: number
  certificateWhtSatang: number
  formatSatang: (satang: number) => string
}): string | null {
  if (input.withheldSatang === input.certificateWhtSatang) return null
  return (
    `ยอดภาษีในหนังสือ (${input.formatSatang(input.certificateWhtSatang)}) ไม่ตรงกับยอดที่ลูกค้าหักไว้ตอนโอน ` +
    `(${input.formatSatang(input.withheldSatang)}) — บันทึกแล้ว โปรดตรวจกับลูกค้าหรือแจ้งสำนักงานบัญชี`
  )
}
