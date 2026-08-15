import { successRate } from '@/lib/assignments/success-rate'
import { momComparison } from '@/lib/reports/kpi'
import { ROW_KEY, type ReportColumn, type ReportData, type ReportRow } from '@/lib/reports/payload'

/**
 * **O3 — ปริมาณงานรายพนักงาน** (`96` §6-O3) — ชั้น **pure ล้วน ไม่มี I/O**
 *
 * ### กติกาที่ห้ามหลุด
 * - ต้นทางคือ **`case_assignments`** (`96` §7) ⇒ "เคสรับทั้งหมด" คือเคสที่พนักงานคนนั้นได้รับมอบหมาย
 *   ในช่วงที่เลือก **นับเคสไม่ซ้ำ** (1 เคสอาจถูกมอบหมายซ้ำหลายรอบ/หลาย tracking round)
 * - **% ความสำเร็จใช้ `successRate()`** (`40` §6.2 — สำเร็จ ÷ ที่ได้รับมอบหมาย) ห้ามเขียนสูตรซ้ำ
 *   ⚠️ นิยามต่างจาก O1 โดยตั้งใจ: O1 วัด "คุณภาพผลลัพธ์ของเคสที่ปิดแล้ว" ส่วน O3 วัด "ภาระงานของคน"
 *   ตัวหารจึงเป็นงานที่รับมาทั้งหมดรวมงานที่ยังค้าง (`40` §6.2 บังคับไว้แบบนั้น)
 * - งานที่ถูกโอนออกไปแล้ว (`reassigned_away`) **ไม่ใช่ภาระของคนเดิม** ⇒ ผู้เรียกกรองออกก่อนส่งเข้ามา
 */

export interface WorkloadEntry {
  agentId: string
  agentName: string
  teamName: string | null
  caseId: string
  /** สถานะของงานที่มอบหมาย — ปิดแล้ว 2 แบบ หรือยังค้างอยู่ */
  result: 'closed_success' | 'closed_fail' | 'open'
}

interface Bucket {
  key: string
  agentName: string
  teamName: string | null
  cases: Set<string>
  successCases: Set<string>
  failCases: Set<string>
}

const COLUMNS: readonly ReportColumn[] = [
  { key: 'agent', header: 'พนักงาน', type: 'text', width: 26 },
  { key: 'team', header: 'ทีม', type: 'text', width: 20 },
  { key: 'caseCount', header: 'เคสรับทั้งหมด', type: 'number' },
  { key: 'successCount', header: 'ปิดสำเร็จ', type: 'number' },
  { key: 'failCount', header: 'ปิดไม่สำเร็จ', type: 'number' },
  { key: 'openCount', header: 'ค้างอยู่', type: 'number', tone: 'warning' },
  { key: 'successPct', header: '% ความสำเร็จ', type: 'percent' },
]

function groupEntries(entries: readonly WorkloadEntry[]): Bucket[] {
  const buckets = new Map<string, Bucket>()
  for (const entry of entries) {
    let bucket = buckets.get(entry.agentId)
    if (bucket === undefined) {
      bucket = {
        key: entry.agentId,
        agentName: entry.agentName,
        teamName: entry.teamName,
        cases: new Set(),
        successCases: new Set(),
        failCases: new Set(),
      }
      buckets.set(entry.agentId, bucket)
    }
    bucket.cases.add(entry.caseId)
    if (entry.result === 'closed_success') bucket.successCases.add(entry.caseId)
    if (entry.result === 'closed_fail') bucket.failCases.add(entry.caseId)
  }
  return [...buckets.values()]
}

export function buildWorkloadReport(input: {
  entries: readonly WorkloadEntry[]
  /** ช่วงก่อนหน้าที่ยาวเท่ากัน — ใช้เฉพาะ badge MoM ของ KPI (ตารางไม่มีคอลัมน์ MoM ตาม `96` §6-O3) */
  previousEntries: readonly WorkloadEntry[]
}): ReportData {
  const { entries, previousEntries } = input

  const buckets = groupEntries(entries).sort(
    (a, b) => b.cases.size - a.cases.size || a.agentName.localeCompare(b.agentName, 'th'),
  )

  const rows: ReportRow[] = buckets.map((bucket) => {
    const caseCount = bucket.cases.size
    const successCount = bucket.successCases.size
    const failCount = bucket.failCases.size
    return {
      [ROW_KEY]: bucket.key,
      agent: bucket.agentName,
      team: bucket.teamName,
      caseCount,
      successCount,
      failCount,
      openCount: caseCount - successCount - failCount,
      successPct: successRate({ successCount, assignedCount: caseCount }),
    }
  })

  const totalCases = new Set(entries.map((entry) => entry.caseId)).size
  const totalSuccess = new Set(
    entries.filter((entry) => entry.result === 'closed_success').map((entry) => entry.caseId),
  ).size
  const totalFail = new Set(
    entries.filter((entry) => entry.result === 'closed_fail').map((entry) => entry.caseId),
  ).size
  const totalOpen = totalCases - totalSuccess - totalFail
  const agentCount = buckets.length
  const previousCases = new Set(previousEntries.map((entry) => entry.caseId)).size

  return {
    columns: COLUMNS,
    rows,
    kpis: [
      {
        key: 'caseCount',
        label: 'เคสที่มอบหมายในช่วงนี้',
        value: totalCases,
        type: 'number',
        hint: `พนักงาน ${agentCount.toLocaleString('th-TH')} คน`,
        mom: momComparison(totalCases, previousCases),
      },
      {
        key: 'openCount',
        label: 'ค้างอยู่',
        value: totalOpen,
        type: 'number',
        hint: `ปิดแล้ว ${(totalSuccess + totalFail).toLocaleString('th-TH')} เคส`,
        higherIsBetter: false,
      },
      {
        key: 'successPct',
        label: '% ความสำเร็จรวม',
        value: successRate({ successCount: totalSuccess, assignedCount: totalCases }),
        type: 'percent',
        hint: `สำเร็จ ${totalSuccess.toLocaleString('th-TH')} จากงานที่รับ ${totalCases.toLocaleString('th-TH')} เคส`,
      },
    ],
    totalRow: {
      agent: 'รวมทั้งหมด',
      team: null,
      caseCount: totalCases,
      successCount: totalSuccess,
      failCount: totalFail,
      openCount: totalOpen,
      successPct: successRate({ successCount: totalSuccess, assignedCount: totalCases }),
    },
    note:
      'นับจากงานที่มอบหมายในช่วงที่เลือก (เคสไม่ซ้ำ) — งานที่ถูกโอนให้คนอื่นไปแล้วไม่นับเป็นภาระของคนเดิม · ' +
      '% ความสำเร็จ = เคสที่ปิดสำเร็จ ÷ เคสที่ได้รับมอบหมายทั้งหมด (ไฟล์ 40 §6.2) ⇒ ต่างจากรายงาน O1 ที่หารด้วยเคสที่ปิดแล้วเท่านั้น',
  }
}
