import { sumSatang } from '@/lib/finance/satang'
import { ROW_KEY, type ReportColumn, type ReportData, type ReportRow } from '@/lib/reports/payload'

/**
 * **F4 — สรุปค่าตอบแทน** (`96` §6-F4) — ชั้น **pure ล้วน ไม่มี I/O**
 *
 * ### กติกาที่ห้ามหลุด
 * - **ยอดทุกช่องเป็น snapshot ของ `payout_batch_items`** (`92` §7.1) — บวกตามที่บันทึกไว้ตอนสร้าง
 *   รอบจ่ายเท่านั้น **ห้ามคำนวณ `net = gross - wht` ใหม่** (อัตรา WHT ที่ใช้จริงถูก snapshot ไว้แล้ว
 *   และรายการที่ต่ำกว่าเกณฑ์ 1,000 บาทไม่ถูกหัก — คำนวณใหม่ = ตัวเลขเพี้ยนจากที่โอนจริง)
 * - **รายการเงินทดรองจ่ายไม่ใช่ค่าตอบแทน** — รอบจ่ายมีแหล่งที่มา 2 แบบ (A4: expense / advance)
 *   ผู้เรียกต้องส่งเฉพาะรายการที่มาจาก `expenses` เข้ามา (ตัวสรุปนี้ไม่รู้จักที่มา)
 * - จำนวนคน/จำนวนเคส นับ **แบบไม่ซ้ำ** — พนักงานคนเดียวมีหลายรายการในรอบเดียวได้
 */

export const COMPENSATION_GROUP_BYS = ['team', 'employee'] as const
export type CompensationGroupBy = (typeof COMPENSATION_GROUP_BYS)[number]

export const COMPENSATION_GROUP_BY_LABEL: Readonly<Record<CompensationGroupBy, string>> = {
  team: 'รายทีม',
  employee: 'รายพนักงาน',
}

export const TEAM_SIDE_LABEL: Readonly<Record<string, string>> = {
  inhouse: 'Inhouse',
  outsource: 'Outsource',
}

/** ค่าตอบแทน 1 รายการในรอบจ่าย (ยอดเป็น snapshot — ห้ามแก้ก่อนส่งเข้ามา) */
export interface CompensationItemEntry {
  payeeId: string
  payeeName: string
  teamId: string | null
  teamName: string | null
  teamSide: string | null
  /** ชนิดของรายการเบิกต้นทาง (`expenses.expense_type`) — `null` = หารายการต้นทางไม่เจอ */
  expenseType: string | null
  /** เคสต้นทาง — `null` = รายการเบิกที่ไม่ผูกเคส (manual claim / ที่พัก) */
  caseId: string | null
  grossSatang: number
  whtSatang: number
  netSatang: number
}

const UNASSIGNED_TEAM_KEY = '__no_team__'
const UNASSIGNED_TEAM_LABEL = 'ไม่สังกัดทีม'

/** ชนิดรายการที่แยกช่องให้ในตารางรายพนักงาน (`96` §6-F4) — ชนิดอื่นรวมอยู่ช่อง "อื่น ๆ" */
const BREAKDOWN_TYPES = ['commission', 'fuel', 'allowance'] as const
type BreakdownType = (typeof BREAKDOWN_TYPES)[number]

function isBreakdownType(value: string | null): value is BreakdownType {
  return value !== null && (BREAKDOWN_TYPES as readonly string[]).includes(value)
}

interface Bucket {
  key: string
  label: string
  teamSide: string | null
  teamName: string | null
  payees: Set<string>
  cases: Set<string>
  grossSatang: number
  whtSatang: number
  netSatang: number
  byType: Record<BreakdownType, number>
  otherSatang: number
}

function newBucket(key: string, label: string): Bucket {
  return {
    key,
    label,
    teamSide: null,
    teamName: null,
    payees: new Set(),
    cases: new Set(),
    grossSatang: 0,
    whtSatang: 0,
    netSatang: 0,
    byType: { commission: 0, fuel: 0, allowance: 0 },
    otherSatang: 0,
  }
}

function groupItems(items: readonly CompensationItemEntry[], groupBy: CompensationGroupBy): Bucket[] {
  const buckets = new Map<string, Bucket>()

  for (const item of items) {
    const key = groupBy === 'team' ? (item.teamId ?? UNASSIGNED_TEAM_KEY) : item.payeeId
    const label =
      groupBy === 'team' ? (item.teamName ?? UNASSIGNED_TEAM_LABEL) : item.payeeName

    let bucket = buckets.get(key)
    if (bucket === undefined) {
      bucket = newBucket(key, label)
      buckets.set(key, bucket)
    }
    bucket.teamSide ??= item.teamSide
    bucket.teamName ??= item.teamName

    bucket.payees.add(item.payeeId)
    if (item.caseId !== null) bucket.cases.add(item.caseId)
    bucket.grossSatang += item.grossSatang
    bucket.whtSatang += item.whtSatang
    bucket.netSatang += item.netSatang
    if (isBreakdownType(item.expenseType)) bucket.byType[item.expenseType] += item.grossSatang
    else bucket.otherSatang += item.grossSatang
  }

  return [...buckets.values()].sort(
    (a, b) => b.grossSatang - a.grossSatang || a.label.localeCompare(b.label, 'th'),
  )
}

const TEAM_COLUMNS: readonly ReportColumn[] = [
  { key: 'group', header: 'ทีม', type: 'text', width: 26 },
  { key: 'teamSide', header: 'ประเภท', type: 'text', width: 12 },
  { key: 'memberCount', header: 'จำนวนคน', type: 'number' },
  { key: 'grossSatang', header: 'Gross รวม', type: 'money' },
  { key: 'whtSatang', header: 'WHT รวม', type: 'money' },
  { key: 'netSatang', header: 'Net รวม', type: 'money' },
  { key: 'caseCount', header: 'จำนวนเคสที่ปิด', type: 'number' },
]

const EMPLOYEE_COLUMNS: readonly ReportColumn[] = [
  { key: 'group', header: 'ชื่อพนักงาน', type: 'text', width: 26 },
  { key: 'teamName', header: 'ทีม', type: 'text', width: 20 },
  { key: 'caseCount', header: 'จำนวนเคส', type: 'number' },
  { key: 'commissionSatang', header: 'ค่าคอมมิชชั่น', type: 'money' },
  { key: 'fuelSatang', header: 'ค่าน้ำมัน', type: 'money' },
  { key: 'allowanceSatang', header: 'เบี้ยเลี้ยง', type: 'money' },
  { key: 'otherSatang', header: 'อื่น ๆ', type: 'money' },
  { key: 'grossSatang', header: 'รวม Gross', type: 'money' },
  { key: 'whtSatang', header: 'WHT', type: 'money' },
  { key: 'netSatang', header: 'Net', type: 'money' },
]

function teamSideLabel(side: string | null): string | null {
  return side === null ? null : (TEAM_SIDE_LABEL[side] ?? side)
}

export function buildCompensationReport(input: {
  groupBy: CompensationGroupBy
  items: readonly CompensationItemEntry[]
}): ReportData {
  const { groupBy, items } = input
  const buckets = groupItems(items, groupBy)

  const teamRow = (bucket: Bucket): ReportRow => ({
    [ROW_KEY]: bucket.key,
    group: bucket.label,
    teamSide: teamSideLabel(bucket.teamSide),
    memberCount: bucket.payees.size,
    grossSatang: bucket.grossSatang,
    whtSatang: bucket.whtSatang,
    netSatang: bucket.netSatang,
    caseCount: bucket.cases.size,
  })

  const employeeRow = (bucket: Bucket): ReportRow => ({
    [ROW_KEY]: bucket.key,
    group: bucket.label,
    teamName: bucket.teamName ?? UNASSIGNED_TEAM_LABEL,
    caseCount: bucket.cases.size,
    commissionSatang: bucket.byType.commission,
    fuelSatang: bucket.byType.fuel,
    allowanceSatang: bucket.byType.allowance,
    otherSatang: bucket.otherSatang,
    grossSatang: bucket.grossSatang,
    whtSatang: bucket.whtSatang,
    netSatang: bucket.netSatang,
  })

  const rows: ReportRow[] = buckets.map((bucket) => (groupBy === 'team' ? teamRow(bucket) : employeeRow(bucket)))

  const totalGross = sumSatang(items.map((item) => item.grossSatang), 'ค่าตอบแทนรวม')
  const totalWht = sumSatang(items.map((item) => item.whtSatang), 'ภาษีหัก ณ ที่จ่ายรวม')
  const totalNet = sumSatang(items.map((item) => item.netSatang), 'ยอดจ่ายสุทธิรวม')
  const payeeCount = new Set(items.map((item) => item.payeeId)).size
  const caseCount = new Set(items.filter((item) => item.caseId !== null).map((item) => item.caseId)).size

  return {
    columns: groupBy === 'team' ? TEAM_COLUMNS : EMPLOYEE_COLUMNS,
    rows,
    kpis: [
      {
        key: 'gross',
        label: 'ค่าตอบแทนรวม',
        value: totalGross,
        type: 'money',
        hint: `${payeeCount.toLocaleString('th-TH')} คน · ${caseCount.toLocaleString('th-TH')} เคส`,
      },
      { key: 'wht', label: 'ภาษีหัก ณ ที่จ่ายรวม', value: totalWht, type: 'money', higherIsBetter: false },
      { key: 'net', label: 'Net จ่ายจริง', value: totalNet, type: 'money' },
    ],
    totalRow:
      groupBy === 'team'
        ? {
            group: 'รวมทั้งหมด',
            teamSide: null,
            memberCount: payeeCount,
            grossSatang: totalGross,
            whtSatang: totalWht,
            netSatang: totalNet,
            caseCount,
          }
        : {
            group: 'รวมทั้งหมด',
            teamName: null,
            caseCount,
            commissionSatang: sumSatang(buckets.map((bucket) => bucket.byType.commission), 'ค่าคอมมิชชั่นรวม'),
            fuelSatang: sumSatang(buckets.map((bucket) => bucket.byType.fuel), 'ค่าน้ำมันรวม'),
            allowanceSatang: sumSatang(buckets.map((bucket) => bucket.byType.allowance), 'เบี้ยเลี้ยงรวม'),
            otherSatang: sumSatang(buckets.map((bucket) => bucket.otherSatang), 'ค่าตอบแทนอื่นรวม'),
            grossSatang: totalGross,
            whtSatang: totalWht,
            netSatang: totalNet,
          },
    note:
      'ยอดทุกช่องเป็นค่าที่บันทึกไว้ในรายการของรอบจ่าย (snapshot ตอนสร้างรอบ) — ไม่ได้คำนวณ WHT ใหม่ย้อนหลัง · ' +
      'ไม่รวมรายการเงินทดรองจ่ายที่จ่ายผ่านรอบเดียวกัน · รายการปรับปรุงระดับรอบจ่าย (ไฟล์ 20) ไม่ถูกกระจายลงรายทีม/รายคน',
  }
}
