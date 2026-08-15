/**
 * เกณฑ์ SLA ของงานติดตามทรัพย์ (`13` §6.14 · `40` §6.4 · `96` §6-O2/O4) — **pure ล้วน ไม่มี I/O**
 *
 * ### ที่มา (มติ PO 15/08/2569 — D18)
 * `96` §6-O2/O4 อ้าง `slaAlertHours` "ใน Finance Settings (ไฟล์ 03)" แต่ไฟล์ `03` ไม่เคยนิยามค่านี้
 * (§18 เขียนเองว่าตัวเลข SLA ยังไม่ตกลง) และ `02` ไม่มีคอลัมน์รองรับ ⇒ PO เคาะให้เก็บ **ระดับองค์กร**
 * ที่ `assignment_policy_settings.sla_alert_hours` ค่าเริ่มต้น **72 ชั่วโมง (3 วัน)**
 *
 * ### ขอบเขตการใช้งาน
 * ค่านี้ใช้กับ **รายงาน O2/O4 เท่านั้น** (อ่านอย่างเดียว) — ไม่บล็อกการทำงานใด ไม่ auto-reassign
 * ไม่มีค่าปรับ (คำถาม "เกิดอะไรขึ้นเมื่อ breach" ยังค้างที่ `DECISIONS-NEEDED.md` §3.2)
 * นับจาก `cases.created_at` ตาม `96` §6-O4 — ไม่ใช่วันที่มอบหมายหรือวันที่รับงาน
 */

import { DEFAULT_SLA_ALERT_HOURS } from '@/lib/assignments/policy'

export { DEFAULT_SLA_ALERT_HOURS }

/** 1 ชั่วโมงขั้นต่ำ — 0 ทำให้ทุกเคสเกิน SLA ทันทีที่สร้าง (ตรงกับ CHECK ระดับ DB) */
export const MIN_SLA_ALERT_HOURS = 1
/** 1 ปี — เกินกว่านี้ไม่ใช่เกณฑ์ SLA แล้ว (กันพิมพ์ผิดจนรายงานว่างเปล่าถาวร) */
export const MAX_SLA_ALERT_HOURS = 8_760

export const HOURS_PER_DAY = 24

export interface SlaPolicyValues {
  slaAlertHours: number
}

/** ป้ายที่ผู้ใช้เห็น เช่น `72 ชั่วโมง (3 วัน)` — เศษวันแสดงทศนิยม 1 ตำแหน่ง */
export function describeSlaThreshold(hours: number): string {
  const days = hours / HOURS_PER_DAY
  const dayText = Number.isInteger(days) ? String(days) : days.toFixed(1)
  return `${hours.toLocaleString('th-TH')} ชั่วโมง (${dayText} วัน)`
}

/** payload ที่ลง audit — ตัดฟิลด์อื่นของตารางออก เพราะ endpoint นี้แก้ค่าเดียว */
export function toSlaPolicyAuditPayload(values: SlaPolicyValues): Record<string, number> {
  return { sla_alert_hours: values.slaAlertHours }
}
