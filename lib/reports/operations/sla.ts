/**
 * เวลาปิดงาน (TAT) และเกณฑ์ SLA ของรายงานหมวด O (`96` §6-O2/O4 · §13) — **pure ล้วน ไม่มี I/O**
 *
 * ### กติกาที่ห้ามหลุด
 * - **TAT = `closed_at - created_at` เป็น calendar days รวมวันหยุด** (`96` §13 O2) — ห้ามตัดวันหยุด
 *   ห้ามนับเป็นวันทำการ · นับเวลาจริงเป็นมิลลิวินาทีแล้วแปลงหน่วยครั้งเดียว (ข้ามเดือน/ปีจึงถูกเสมอ)
 * - **เกณฑ์ SLA มาจากค่าตั้งขององค์กร** (`assignment_policy_settings.sla_alert_hours` — D18)
 *   ห้าม hardcode ตัวเลขในรายงาน
 * - "เกิน SLA" ใช้เงื่อนไขของ `96` §6-O4 ตรงตัว: `created_at + slaAlertHours < now`
 *   ⇒ **ครบพอดียังไม่เกิน** (แนวเดียวกับ F5 ที่ due วันนี้ยังไม่ overdue)
 */

const MS_PER_HOUR = 3_600_000
const HOURS_PER_DAY = 24

/** ชั่วโมงที่ผ่านไประหว่างสองจุดเวลา (ทศนิยมเต็มความละเอียด — ผู้เรียกเป็นคนปัด) */
export function elapsedHours(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / MS_PER_HOUR
}

/** ชั่วโมง → วัน (ทศนิยม 1 ตำแหน่ง) — หน่วยที่ผู้อ่านรายงานเห็นในคอลัมน์ TAT */
export function hoursToDays(hours: number): number {
  return Math.round((hours / HOURS_PER_DAY) * 10) / 10
}

/** เคสนี้ปิดภายใน SLA หรือไม่ — ครบพอดี (`=`) ถือว่ายังอยู่ในเกณฑ์ */
export function isWithinSla(tatHours: number, slaAlertHours: number): boolean {
  return tatHours <= slaAlertHours
}

/**
 * จำนวนวันที่ **เกิน** เกณฑ์ SLA ณ เวลาอ้างอิง — ยังไม่เกินคืน `null`
 * (`null` ⇒ ผู้เรียกตัดแถวนั้นออกจากรายงาน O4 ไม่ใช่แสดง 0 วัน)
 */
export function slaOverdueDays(createdAt: Date, asOf: Date, slaAlertHours: number): number | null {
  const over = elapsedHours(createdAt, asOf) - slaAlertHours
  if (over <= 0) return null
  return hoursToDays(over)
}
