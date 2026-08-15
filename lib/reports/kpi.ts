/**
 * KPI card + การเปรียบเทียบกับงวดก่อน (`96` §11 — "KPI cards มีเปรียบเทียบกับเดือนก่อน (MoM %)
 * แสดงเป็น ↑↓ badge") — **pure ล้วน ไม่มี I/O**
 *
 * ### กติกา
 * - **ห้ามหารศูนย์** (Rule 01): งวดก่อนเป็น 0 ⇒ `changePct = null` แล้ว UI แสดง "N/A"
 *   — ไม่ใช่ 0% และไม่ใช่ 100% (ทั้งสองค่าโกหกผู้อ่านรายงาน)
 * - ฐานเปรียบเทียบใช้ **ค่าสัมบูรณ์** ของงวดก่อน ⇒ ตัวเลขติดลบ (เช่นกำไรขั้นต้นติดลบ)
 *   ที่ "แย่ลง" ต้องได้ทิศทางลง ไม่ใช่ขึ้น
 * - ปัดทศนิยม 1 ตำแหน่งตอนคำนวณครั้งเดียว (E5) — ผู้เรียกห้ามปัดซ้ำ
 * - ค่าเงินที่ส่งเข้ามาเป็น **satang** เสมอ (Rule 01) — ฟังก์ชันนี้ไม่แปลงหน่วย เพราะเป็นอัตราส่วน
 */

export type MoMDirection = 'up' | 'down' | 'flat'

export interface MoMComparison {
  current: number
  previous: number
  /** เปอร์เซ็นต์การเปลี่ยนแปลง (ทศนิยม 1 ตำแหน่ง) — `null` = เทียบไม่ได้ (งวดก่อนเป็น 0) */
  changePct: number | null
  direction: MoMDirection
}

const PCT_PRECISION = 10

function roundPct(value: number): number {
  return Math.round(value * PCT_PRECISION) / PCT_PRECISION
}

export function momComparison(current: number, previous: number): MoMComparison {
  const delta = current - previous
  const direction: MoMDirection = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
  if (previous === 0) return { current, previous, changePct: null, direction }
  return { current, previous, changePct: roundPct((delta / Math.abs(previous)) * 100), direction }
}

/** ป้ายบน badge — ค่าที่เทียบไม่ได้แสดง "N/A" (เหมือน margin ที่ revenue = 0) */
export function momLabel(comparison: MoMComparison): string {
  if (comparison.changePct === null) return 'N/A'
  const arrow = comparison.direction === 'up' ? '↑' : comparison.direction === 'down' ? '↓' : '—'
  return `${arrow} ${Math.abs(comparison.changePct).toFixed(1)}%`
}

/**
 * สีของ badge — **ขึ้นกับว่าค่าที่มากขึ้นดีหรือไม่ดี** ไม่ใช่ทิศทางอย่างเดียว
 * (รายได้เพิ่ม = เขียว · เคสเกิน SLA เพิ่ม = แดง) ⇒ ผู้เรียกต้องระบุ `higherIsBetter` เสมอ
 */
export function momToneClass(comparison: MoMComparison, higherIsBetter: boolean): string {
  if (comparison.changePct === null || comparison.direction === 'flat') return 'text-slate-500'
  const good = comparison.direction === 'up' ? higherIsBetter : !higherIsBetter
  return good ? 'text-emerald-600' : 'text-red-600'
}

/** อัตราส่วนเป็นเปอร์เซ็นต์ (ทศนิยม 1 ตำแหน่ง) — ตัวหารเป็น 0 คืน `null` ไม่ใช่ 0 */
export function ratioPct(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null
  return roundPct((numerator / denominator) * 100)
}
