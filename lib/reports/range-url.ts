import { REPORT_RANGE_PRESETS, type ReportRangePreset } from '@/lib/reports/range'

/**
 * ช่วงเวลาของหน้ารายงาน ↔ query string (`?preset=&from=&to=`) — pure ล้วน (mytester J-03)
 *
 * เดิมช่วงเวลาอยู่ใน state ของหน้าอย่างเดียว ⇒ รีเฟรช/ย้อนกลับแล้วกลับเป็นค่าเริ่มต้น และแชร์ลิงก์ช่วงที่เลือกไม่ได้
 * ชื่อ key เดียวกับ query ของ `GET /api/reports/:id` · ค่า preset เท่าค่าเริ่มต้นของหน้า = ไม่ใส่ใน URL (URL สั้น)
 * `from`/`to` ใช้เฉพาะ `custom` และรับเฉพาะรูป `YYYY-MM-DD` (ค่าของ `<input type="date">`) — ผิดรูป = ว่าง
 * (ยามจริงยังเป็น `resolveReportRange()` ฝั่ง backend)
 */

export interface ReportRangeParams {
  preset: ReportRangePreset
  from: string
  to: string
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function pickDate(value: string | null): string {
  return value !== null && ISO_DATE.test(value) ? value : ''
}

function isPreset(value: string | null): value is ReportRangePreset {
  return value !== null && (REPORT_RANGE_PRESETS as readonly string[]).includes(value)
}

/** อ่านช่วงเวลาจาก query — preset ไม่รู้จัก = `fallback` */
export function reportRangeFromParams(params: URLSearchParams, fallback: ReportRangePreset): ReportRangeParams {
  const raw = params.get('preset')
  const preset = isPreset(raw) ? raw : fallback
  if (preset !== 'custom') return { preset, from: '', to: '' }
  return {
    preset,
    from: pickDate(params.get('from')),
    to: pickDate(params.get('to')),
  }
}

/** ค่าที่ต้องเขียนลง URL (`null` = ลบ key) — ใช้กับ `replaceUrlParams()` */
export function reportRangeUrlUpdates(
  range: ReportRangeParams,
  fallback: ReportRangePreset,
): Readonly<Record<'preset' | 'from' | 'to', string | null>> {
  const custom = range.preset === 'custom'
  return {
    preset: range.preset === fallback ? null : range.preset,
    from: custom && range.from !== '' ? range.from : null,
    to: custom && range.to !== '' ? range.to : null,
  }
}

/** สองช่วงเท่ากันไหม — ใช้กัน set state ซ้ำตอน URL วนกลับมาเป็นค่าเดิม */
export function sameReportRange(a: ReportRangeParams, b: ReportRangeParams): boolean {
  return a.preset === b.preset && a.from === b.from && a.to === b.to
}
