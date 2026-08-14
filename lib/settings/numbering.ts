import type { InvoiceNumberingMode } from '@/lib/generated/prisma/enums'
import { buddhistYear } from '@/lib/format/datetime'

/**
 * รูปแบบเลขที่ใบกำกับภาษี (`13` §6.12 · `31` §6.2) — **pure ล้วน ใช้ร่วม FE/BE**
 *
 * กติกา:
 *  · `continuous` = เดินเลขต่อเนื่องไม่รีเซ็ต · `yearly_reset` = รีเซ็ตเป็น 1 ทุกปีปฏิทิน พร้อมแทรกปีในเลข
 *  · ปีที่ใช้ในเลขเอกสารเป็น **พ.ศ. เสมอ** (Rule 01 — `LOT-YYYY-XXX` ใช้ พ.ศ. เช่นกัน)
 *  · `last_number` (`organizations.tax_invoice_seq`) ระบบเดินให้เอง **ห้ามแก้มือ** (`NUMBERING_SEQ_NOT_EDITABLE`)
 *  · ตัวเดินเลขจริงต้อง atomic ระดับแถว (`reserveNextInvoiceNumber()` ใน `lib/settings/queries.ts`)
 *    ไม่งั้นเลขซ้ำ/ข้ามภายใต้ concurrency ซึ่งผิดกฎหมาย (`INVOICE_NUMBER_GAP` — `24` §6.8)
 */

export const MIN_DIGIT_LENGTH = 3
export const MAX_DIGIT_LENGTH = 10

export interface NumberingFormat {
  mode: InvoiceNumberingMode
  /** ข้อความนำหน้า เช่น "INV" (ตัวคั่น `-` ระบบใส่ให้ ไม่ต้องพิมพ์มาเอง) */
  prefix: string
  digitLength: number
}

export interface NumberingState extends NumberingFormat {
  /** เลขล่าสุดที่ออกไปแล้ว (0 = ยังไม่เคยออก) */
  lastNumber: number
  /** ปี พ.ศ. ที่รีเซ็ตล่าสุด — ใช้เฉพาะ `yearly_reset` */
  lastResetYear: number | null
}

/** ปี พ.ศ. ตามเวลาไทยของวันที่ที่ออกเอกสาร (Rule 01 — ห้ามใช้ ค.ศ. บนเลขเอกสาร) */
export function documentYear(issuedAt: Date): number {
  const year = buddhistYear(issuedAt)
  if (year === null) throw new Error('documentYear: วันที่ออกเอกสารไม่ถูกต้อง')
  return year
}

/** ประกอบเลขที่เอกสารจาก running number — `INV-0001` / `INV-2569-0001` */
export function formatInvoiceNumber(format: NumberingFormat, sequence: number, issuedAt: Date): string {
  const running = String(sequence).padStart(format.digitLength, '0')
  const parts = [format.prefix.trim()].filter((part) => part.length > 0)
  if (format.mode === 'yearly_reset') parts.push(String(documentYear(issuedAt)))
  parts.push(running)
  return parts.join('-')
}

/**
 * เลขลำดับถัดไปที่ควรได้ — โหมด `yearly_reset` เริ่มใหม่ที่ 1 เมื่อข้ามปี พ.ศ.
 * (ตรรกะเดียวกับ SQL atomic ใน `reserveNextInvoiceNumber()` — เทสต์เทียบสองทางไว้)
 */
export function nextSequence(state: NumberingState, issuedAt: Date): number {
  if (state.mode === 'yearly_reset' && state.lastResetYear !== documentYear(issuedAt)) return 1
  return state.lastNumber + 1
}

/** ปีที่ต้องบันทึกเป็น `last_reset_year` หลังออกเลข — โหมดต่อเนื่องไม่แตะค่าเดิม */
export function nextResetYear(state: NumberingState, issuedAt: Date): number | null {
  return state.mode === 'yearly_reset' ? documentYear(issuedAt) : state.lastResetYear
}

/** ตัวอย่างเลขถัดไป — แสดงบนฟอร์มตั้งค่าให้เห็นผลก่อนบันทึก (`13` §7) */
export function previewNextNumber(state: NumberingState, issuedAt: Date): string {
  return formatInvoiceNumber(state, nextSequence(state, issuedAt), issuedAt)
}

/**
 * เปลี่ยนรูปแบบหลังออกเอกสารไปแล้ว = **เตือน ไม่ block** (`13` §6.12 "เลือกครั้งแรกแล้วไม่ควรเปลี่ยน")
 * คืนข้อความเตือนให้ใส่ใน `warning` ของ envelope — `null` = ไม่มีอะไรต้องเตือน
 */
export function numberingChangeWarning(
  before: NumberingFormat,
  after: NumberingFormat,
  issuedInvoiceCount: number,
): string | null {
  if (issuedInvoiceCount === 0) return null
  const changed =
    before.mode !== after.mode || before.prefix !== after.prefix || before.digitLength !== after.digitLength
  if (!changed) return null
  return `องค์กรนี้ออกใบกำกับภาษีไปแล้ว ${issuedInvoiceCount} ใบ — การเปลี่ยนรูปแบบเลขที่กระทบความต่อเนื่องของเลขเอกสารตามกฎหมาย (\`13\` §6.12)`
}
