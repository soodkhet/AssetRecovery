import { buddhistYear } from '@/lib/format/datetime'

/**
 * เลขล็อต/เลขใบส่งมอบ (`44` §6.2 · §10 "Lot Number Immutable") — **pure ล้วน**
 *
 * รูปแบบ `LOT-2569-001` / `DLV-2569-001` — ปี **พ.ศ. เท่านั้น** (Rule 01) และลำดับรีเซ็ตทุกปี
 *
 * ⚠️ ตัวเดินเลขจริงคือ SQL function `next_handover_number(prefix, be_year)` (migration `20260814183000`)
 *    ซึ่งใช้ PostgreSQL sequence 1 ตัวต่อ (prefix, ปี) — **ห้าม** อ่าน `MAX()` มาบวกเองในโค้ด
 *    (`nextval()` ไม่ถูก rollback ⇒ ทรานแซกชันล้มแล้วเลขก็ไม่ถูกใช้ซ้ำ ตรงกับกติกา "ไม่ recycle")
 *    ไฟล์นี้มีหน้าที่แค่ **ให้ค่านำเข้า** (prefix/ปี) กับ **อ่าน/ตรวจรูปแบบ** ฝั่งแอปเท่านั้น
 */

export const LOT_PREFIX = 'LOT'
export const DELIVERY_DOC_PREFIX = 'DLV'

export const HANDOVER_PREFIXES = [LOT_PREFIX, DELIVERY_DOC_PREFIX] as const
export type HandoverPrefix = (typeof HANDOVER_PREFIXES)[number]

/** ลำดับในเลขเอกสารเติมศูนย์ให้ครบ 3 หลัก (เกิน 999 ต่อปีจะยาวขึ้นเองตามลำดับจริง) */
export const HANDOVER_SEQUENCE_PAD = 3

const HANDOVER_NUMBER_PATTERN = /^(LOT|DLV)-(\d{4})-(\d{3,})$/

/**
 * ปี พ.ศ. ของเลขเอกสารตามเวลาไทย — เอกสารที่ออกตอน 06:00 ของ 1 ม.ค. ต้องได้ปีใหม่
 * (ถ้าใช้ UTC จะยังเป็นปีเก่าอยู่ 7 ชั่วโมง) จึงต้องผ่าน `buddhistYear()` ที่แปลง Asia/Bangkok ให้แล้ว
 */
export function handoverNumberYear(at: Date): number {
  const year = buddhistYear(at)
  if (year === null) throw new Error('handoverNumberYear: วันที่ที่ส่งเข้ามาไม่ถูกต้อง')
  return year
}

export function formatHandoverNumber(prefix: HandoverPrefix, beYear: number, sequence: number): string {
  return `${prefix}-${beYear}-${String(sequence).padStart(HANDOVER_SEQUENCE_PAD, '0')}`
}

export interface ParsedHandoverNumber {
  prefix: HandoverPrefix
  /** ปี พ.ศ. */
  beYear: number
  sequence: number
}

/** อ่านเลขเอกสาร — ไม่ตรงรูปแบบคืน `null` (ใช้ตอน import/ตรวจข้อมูลเก่า ไม่ใช้ตัดสินสิทธิ์) */
export function parseHandoverNumber(value: string): ParsedHandoverNumber | null {
  const match = HANDOVER_NUMBER_PATTERN.exec(value)
  if (match === null) return null
  const [, prefix, year, sequence] = match
  if (prefix === undefined || year === undefined || sequence === undefined) return null
  const beYear = Number.parseInt(year, 10)
  // ปีต้องเป็น พ.ศ. เสมอ — ค.ศ. หลุดเข้ามา = เลขเอกสารผิดทั้งชุด (ยามชั้น DB อยู่ใน SQL function ด้วย)
  if (beYear < 2500 || beYear > 2999) return null
  return { prefix: prefix as HandoverPrefix, beYear, sequence: Number.parseInt(sequence, 10) }
}

export function isHandoverNumber(value: string): boolean {
  return parseHandoverNumber(value) !== null
}
