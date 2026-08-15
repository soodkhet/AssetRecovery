import { sumSatang } from '@/lib/finance/satang'
import { ROW_KEY, type ReportColumn, type ReportData, type ReportRow } from '@/lib/reports/payload'
import { hoursToDays, slaOverdueDays } from '@/lib/reports/operations/sla'

/**
 * **O4 — เคสค้างเกิน SLA** (`96` §6-O4) — ชั้น **pure ล้วน ไม่มี I/O**
 *
 * ### กติกาที่ห้ามหลุด
 * - เงื่อนไขของสเปคตรงตัว: **`created_at + slaAlertHours < now`** ⇒ ครบพอดี "ยังไม่เกิน"
 *   (ตัวกรองสุดท้ายอยู่ที่นี่ เพื่อให้ขอบเวลาถูกกำหนดโดยโมดูล pure ที่มีเทสต์ ไม่ใช่โดย SQL)
 * - นับเฉพาะ **เคสที่ยังไม่ปิด** — เคสที่ปิดแล้วไปอยู่รายงาน O2 (TAT/SLA ของงานที่จบแล้ว)
 * - "ประมาณการรายได้" = `cases.projected_revenue_satang` ซึ่งเป็น **ประมาณการ best-case ไม่ใช่รายได้จริง**
 *   (`38` §6.5) · เงินเป็น **satang** เสมอ (Rule 01) · ไม่มีค่า = `null` ห้ามใส่ 0 แทน "ไม่รู้"
 */

export interface SlaBreachCaseEntry {
  caseId: string
  caseRef: string
  companyName: string
  agentName: string | null
  teamName: string | null
  /** วันที่รับเคสเข้าระบบ (`cases.created_at`) — จุดเริ่มนับ SLA ตาม `96` §6-O4 */
  receivedAt: Date
  statusLabel: string
  projectedRevenueSatang: number | null
}

const COLUMNS: readonly ReportColumn[] = [
  { key: 'caseRef', header: 'เลขที่สัญญา', type: 'text', width: 20 },
  { key: 'company', header: 'บริษัทไฟแนนซ์', type: 'text', width: 22 },
  { key: 'agent', header: 'พนักงาน', type: 'text', width: 20 },
  { key: 'team', header: 'ทีม', type: 'text', width: 18 },
  { key: 'status', header: 'สถานะเคส', type: 'text', width: 16 },
  { key: 'receivedAt', header: 'วันที่รับเคส', type: 'date' },
  { key: 'overdueDays', header: 'เกิน SLA (วัน)', type: 'number', tone: 'danger' },
  { key: 'projectedRevenueSatang', header: 'ประมาณการรายได้', type: 'money' },
]

export function buildSlaBreachReport(input: {
  cases: readonly SlaBreachCaseEntry[]
  slaAlertHours: number
  /** เวลาอ้างอิงที่ใช้ตัดสินว่า "เกิน" — ผู้เรียกส่งเวลาปัจจุบันของคำขอเข้ามา (ทดสอบได้) */
  asOf: Date
}): ReportData {
  const { cases, slaAlertHours, asOf } = input

  const breached = cases
    .map((item) => ({ item, overdueDays: slaOverdueDays(item.receivedAt, asOf, slaAlertHours) }))
    .filter((entry): entry is { item: SlaBreachCaseEntry; overdueDays: number } => entry.overdueDays !== null)
    .sort((a, b) => b.overdueDays - a.overdueDays || a.item.caseRef.localeCompare(b.item.caseRef))

  const rows: ReportRow[] = breached.map(({ item, overdueDays }) => ({
    [ROW_KEY]: item.caseId,
    caseRef: item.caseRef,
    company: item.companyName,
    agent: item.agentName,
    team: item.teamName,
    status: item.statusLabel,
    receivedAt: item.receivedAt.toISOString(),
    overdueDays,
    projectedRevenueSatang: item.projectedRevenueSatang,
  }))

  const projectedTotal = sumSatang(
    breached.map(({ item }) => item.projectedRevenueSatang ?? 0),
    'ประมาณการรายได้ของเคสที่เกิน SLA',
  )
  const worst = breached[0]?.overdueDays ?? null

  return {
    columns: COLUMNS,
    rows,
    kpis: [
      {
        key: 'breachCount',
        label: 'เคสเกิน SLA',
        value: breached.length,
        type: 'number',
        hint: `เกณฑ์ ${slaAlertHours.toLocaleString('th-TH')} ชั่วโมง (${hoursToDays(slaAlertHours)} วัน)`,
        higherIsBetter: false,
      },
      {
        key: 'projectedRevenue',
        label: 'ประมาณการรายได้ที่ค้าง',
        value: projectedTotal,
        type: 'money',
        hint: 'ยอดประมาณการ best-case ของเคสที่ยังไม่ปิด (ไฟล์ 38 §6.5)',
      },
      {
        key: 'worstOverdue',
        label: 'ค้างนานที่สุด (วัน)',
        value: worst,
        type: 'number',
        higherIsBetter: false,
      },
    ],
    totalRow:
      breached.length === 0
        ? null
        : {
            caseRef: 'รวมทั้งหมด',
            company: null,
            agent: null,
            team: null,
            status: null,
            receivedAt: null,
            overdueDays: null,
            projectedRevenueSatang: projectedTotal,
          },
    note:
      `เกิน SLA เมื่อ "วันที่รับเคส + ${slaAlertHours.toLocaleString('th-TH')} ชั่วโมง" ผ่านไปแล้ว — ครบพอดียังไม่นับว่าเกิน · ` +
      'นับเฉพาะเคสที่ยังไม่ปิด (เคสที่ปิดแล้วดูรายงาน O2) · ประมาณการรายได้เป็นยอด best-case ไม่ใช่รายได้จริง',
  }
}
