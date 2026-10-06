import { buddhistYear } from '@/lib/format/datetime'

/**
 * เลขรอบวางบิล (มติ PO 05/10/2569 U76) — **pure ล้วน**
 *
 * รูปแบบ `BL-2569-001` — ปี **พ.ศ.** ตามเวลาไทยของวันที่สร้างรอบ (Rule 01) · ลำดับ 3 หลัก ต่อองค์กร รีเซ็ตทุกปี
 * (เกิน 999 ต่อปียาวขึ้นเองตามลำดับจริง — แนวเดียวกับ `LOT-`/`DLV-` ของคลัง)
 *
 * ⚠️ ตัวเดินเลขจริงคือ DB trigger `trg_billing_batches_number` → `next_document_number(org, 'billing_batch', at)`
 *    (มติ PO U102 — migration `20261006190000_document_number_series`) ซึ่งล็อกแถวชุดเลขก่อนเพิ่มตัวนับ
 *    คำนำหน้า/รูปแบบตั้งค่าได้ ⇒ ฟังก์ชันอ่าน/ตรวจรูปแบบด้านล่างใช้ได้กับ **รูปแบบค่าเริ่มต้น** เท่านั้น
 *    ⇒ **ห้าม** ส่ง `batchNumber` ตอนสร้างรอบ และห้ามอ่าน `MAX()` มาบวกเองในโค้ด
 *    ไฟล์นี้มีไว้ **ประกอบ/อ่าน/ตรวจรูปแบบ** ฝั่งแอป (เทสต์ เทียบปี แสดงผล) เท่านั้น
 */

export const BILLING_BATCH_NUMBER_PREFIX = 'BL'
export const BILLING_BATCH_SEQUENCE_PAD = 3

const BILLING_BATCH_NUMBER_PATTERN = /^BL-(\d{4})-(\d{3,})$/

/** ปี พ.ศ. ของเลขรอบตามเวลาไทย — สร้างรอบ 00:30 น. ของ 1 ม.ค. (เวลาไทย) ต้องได้ปีใหม่ */
export function billingBatchNumberYear(createdAt: Date): number {
  const year = buddhistYear(createdAt)
  if (year === null) throw new Error('billingBatchNumberYear: วันที่ที่ส่งเข้ามาไม่ถูกต้อง')
  return year
}

export function formatBillingBatchNumber(beYear: number, sequence: number): string {
  if (!Number.isInteger(beYear) || beYear < 2500 || beYear > 2999) {
    throw new RangeError(`formatBillingBatchNumber: ปีต้องเป็น พ.ศ. (ได้รับ ${beYear})`)
  }
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new RangeError(`formatBillingBatchNumber: ลำดับต้องเป็นจำนวนเต็มบวก (ได้รับ ${sequence})`)
  }
  return `${BILLING_BATCH_NUMBER_PREFIX}-${beYear}-${String(sequence).padStart(BILLING_BATCH_SEQUENCE_PAD, '0')}`
}

export interface ParsedBillingBatchNumber {
  /** ปี พ.ศ. */
  beYear: number
  sequence: number
}

/** อ่านเลขรอบ — ไม่ตรงรูปแบบ/ปีไม่ใช่ พ.ศ. คืน `null` */
export function parseBillingBatchNumber(value: string): ParsedBillingBatchNumber | null {
  const match = BILLING_BATCH_NUMBER_PATTERN.exec(value)
  if (match === null) return null
  const [, year, sequence] = match
  if (year === undefined || sequence === undefined) return null
  const beYear = Number.parseInt(year, 10)
  if (beYear < 2500 || beYear > 2999) return null
  return { beYear, sequence: Number.parseInt(sequence, 10) }
}

export function isBillingBatchNumber(value: string): boolean {
  return parseBillingBatchNumber(value) !== null
}

/** ป้ายอ้างอิงรอบที่ใช้ร่วมทุกหน้าภายใน — `BL-2569-001 · มิถุนายน 2569` */
export function billingBatchRefLabel(batch: { batchNumber: string; period: string }): string {
  return `${batch.batchNumber} · ${batch.period}`
}
