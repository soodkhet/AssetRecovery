import { ratioPct } from '@/lib/reports/kpi'
import { ROW_KEY, type ReportColumn, type ReportData, type ReportRow } from '@/lib/reports/payload'
import { hoursToDays, isWithinSla } from '@/lib/reports/operations/sla'

/**
 * **O2 — ประสิทธิภาพทีม / SLA** (`96` §6-O2) — ชั้น **pure ล้วน ไม่มี I/O**
 *
 * ### กติกาที่ห้ามหลุด
 * - **TAT = `closed_at - created_at` เป็น calendar days รวมวันหยุด** (`96` §13 O2 · §14 "TAT ข้ามเดือน")
 *   — ผู้เรียกส่ง `tatHours` ที่คิดจากเวลาจริงมาแล้ว (ดู `lib/reports/operations/sla.ts`)
 * - **เกณฑ์ SLA มาจากค่าตั้งขององค์กร** (`sla_alert_hours` — D18) ห้าม hardcode
 * - ขอบเขต = **เคสที่ปิดในช่วงที่เลือก** เท่านั้น (เคสที่ยังไม่ปิดไม่มี TAT ⇒ อยู่ในรายงาน O4 แทน)
 * - ทีมที่ไม่มีเคสปิดเลยในช่วงนั้นจะไม่มีแถว — ห้ามใส่แถว 0 วันซึ่งอ่านเหมือน "ปิดงานทันที"
 */

export interface TeamPerformanceEntry {
  /** `null` = เคสยังไม่ถูกมอบหมายให้ทีมใด (จัดกลุ่มเป็น "ไม่ระบุทีม") */
  teamId: string | null
  teamName: string | null
  caseId: string
  /** ชั่วโมงระหว่างรับเคสเข้าระบบ → ปิดงาน (calendar time) */
  tatHours: number
}

const UNASSIGNED_KEY = '__unassigned__'
const UNASSIGNED_LABEL = 'ไม่ระบุทีม'

interface Bucket {
  key: string
  label: string
  tatHours: number[]
  withinSla: number
  overSla: number
}

const COLUMNS: readonly ReportColumn[] = [
  { key: 'team', header: 'ทีม', type: 'text', width: 26 },
  { key: 'caseCount', header: 'เคสที่ปิดในช่วงนี้', type: 'number' },
  { key: 'avgTatDays', header: 'TAT เฉลี่ย (วัน)', type: 'number' },
  { key: 'minTatDays', header: 'เร็วสุด (วัน)', type: 'number' },
  { key: 'maxTatDays', header: 'ช้าสุด (วัน)', type: 'number' },
  { key: 'withinSla', header: 'ภายใน SLA', type: 'number' },
  { key: 'overSla', header: 'เกิน SLA', type: 'number', tone: 'warning' },
  { key: 'withinSlaPct', header: '% ภายใน SLA', type: 'percent' },
]

/** ค่าเฉลี่ยของรายการว่าง = `null` (ห้ามหารศูนย์ — Rule 01) */
function averageHours(values: readonly number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function toDays(hours: number | null): number | null {
  return hours === null ? null : hoursToDays(hours)
}

export function buildTeamPerformanceReport(input: {
  entries: readonly TeamPerformanceEntry[]
  slaAlertHours: number
}): ReportData {
  const { entries, slaAlertHours } = input

  const buckets = new Map<string, Bucket>()
  for (const entry of entries) {
    const key = entry.teamId ?? UNASSIGNED_KEY
    let bucket = buckets.get(key)
    if (bucket === undefined) {
      bucket = { key, label: entry.teamName ?? UNASSIGNED_LABEL, tatHours: [], withinSla: 0, overSla: 0 }
      buckets.set(key, bucket)
    }
    bucket.tatHours.push(entry.tatHours)
    if (isWithinSla(entry.tatHours, slaAlertHours)) bucket.withinSla += 1
    else bucket.overSla += 1
  }

  const sorted = [...buckets.values()].sort(
    (a, b) => (averageHours(a.tatHours) ?? 0) - (averageHours(b.tatHours) ?? 0) || a.label.localeCompare(b.label, 'th'),
  )

  const rows: ReportRow[] = sorted.map((bucket) => ({
    [ROW_KEY]: bucket.key,
    team: bucket.label,
    caseCount: bucket.tatHours.length,
    avgTatDays: toDays(averageHours(bucket.tatHours)),
    minTatDays: toDays(bucket.tatHours.length === 0 ? null : Math.min(...bucket.tatHours)),
    maxTatDays: toDays(bucket.tatHours.length === 0 ? null : Math.max(...bucket.tatHours)),
    withinSla: bucket.withinSla,
    overSla: bucket.overSla,
    withinSlaPct: ratioPct(bucket.withinSla, bucket.tatHours.length),
  }))

  const allHours = entries.map((entry) => entry.tatHours)
  const withinSla = entries.filter((entry) => isWithinSla(entry.tatHours, slaAlertHours)).length
  const overSla = entries.length - withinSla
  const avgAll = averageHours(allHours)

  return {
    columns: COLUMNS,
    rows,
    kpis: [
      {
        key: 'avgTat',
        label: 'TAT เฉลี่ย (วัน)',
        value: toDays(avgAll),
        type: 'number',
        hint: `จากเคสที่ปิดในช่วงนี้ ${entries.length.toLocaleString('th-TH')} เคส`,
        higherIsBetter: false,
      },
      {
        key: 'withinSlaPct',
        label: '% ปิดภายใน SLA',
        value: ratioPct(withinSla, entries.length),
        type: 'percent',
        hint: `เกณฑ์ ${slaAlertHours.toLocaleString('th-TH')} ชั่วโมง (${hoursToDays(slaAlertHours)} วัน)`,
      },
      {
        key: 'overSla',
        label: 'เคสที่ปิดเกิน SLA',
        value: overSla,
        type: 'number',
        higherIsBetter: false,
      },
    ],
    totalRow: {
      team: 'รวมทั้งหมด',
      caseCount: entries.length,
      avgTatDays: toDays(avgAll),
      minTatDays: toDays(allHours.length === 0 ? null : Math.min(...allHours)),
      maxTatDays: toDays(allHours.length === 0 ? null : Math.max(...allHours)),
      withinSla,
      overSla,
      withinSlaPct: ratioPct(withinSla, entries.length),
    },
    note:
      `TAT = เวลาจากวันที่รับเคสเข้าระบบถึงวันปิดงาน นับเป็นวันตามปฏิทินรวมวันหยุด · ` +
      `เกณฑ์ SLA ${slaAlertHours.toLocaleString('th-TH')} ชั่วโมง (ตั้งค่าที่ ตั้งค่าบัญชี/การเงิน → เกณฑ์ SLA งานติดตาม) · ` +
      'นับเฉพาะเคสที่ปิดแล้วในช่วงที่เลือก — เคสที่ยังค้างอยู่ดูรายงาน O4',
  }
}
