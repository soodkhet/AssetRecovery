import { ROW_KEY, type ReportColumn, type ReportData, type ReportRow } from '@/lib/reports/payload'

/**
 * **O5 — สรุปคลังสินค้า** (`96` §6-O5) — ชั้น **pure ล้วน ไม่มี I/O**
 *
 * ### กติกาที่ห้ามหลุด
 * - 3 ช่องแรก (รอรับเข้า / ในคลัง / รอส่งมอบ) เป็น **ยอดคงเหลือ ณ ปัจจุบัน** ไม่ผูกกับช่วงเวลาที่เลือก
 *   — สถานะของเครื่องเป็นค่าปัจจุบันเสมอ (`44` §6.3) การกรองด้วยช่วงเวลาจะได้ยอดที่ไม่มีความหมาย
 * - "ส่งมอบแล้ว" นับจาก **ล็อตที่ยืนยันส่งมอบในช่วงที่เลือก** (`handover_lots.confirmed_at`) เพราะ
 *   `confirmed` คือจุดที่ทรัพย์เปลี่ยนมือจริงตาม `44` §11 (จุดเดียวกับที่ปลดล็อก Revenue — `19` §6.1)
 * - เครื่องที่ถูกปฏิเสธตอนรับเข้า (`intake_rejected`) ไม่อยู่ในคลัง ⇒ ไม่นับในช่องใด
 */

export interface WarehouseCompanyEntry {
  companyId: string
  companyName: string
  pendingIntake: number
  inCustody: number
  handoverPending: number
  /** เครื่องที่อยู่ในล็อตซึ่งยืนยันส่งมอบ**ในช่วงที่เลือก** */
  handedOverInRange: number
}

const COLUMNS: readonly ReportColumn[] = [
  { key: 'company', header: 'บริษัทไฟแนนซ์', type: 'text', width: 26 },
  { key: 'pendingIntake', header: 'รอรับเข้า', type: 'number', tone: 'warning' },
  { key: 'inCustody', header: 'ในคลัง', type: 'number' },
  { key: 'handoverPending', header: 'รอส่งมอบ', type: 'number' },
  { key: 'handedOverInRange', header: 'ส่งมอบแล้ว (ช่วงที่เลือก)', type: 'number' },
]

function sumOf(entries: readonly WarehouseCompanyEntry[], pick: (entry: WarehouseCompanyEntry) => number): number {
  return entries.reduce((total, entry) => total + pick(entry), 0)
}

export function buildWarehouseSummaryReport(input: {
  companies: readonly WarehouseCompanyEntry[]
  /** ป้ายช่วงเวลา (พ.ศ.) ของคอลัมน์ "ส่งมอบแล้ว" — มาจาก `range.label` */
  rangeLabel: string
}): ReportData {
  const { companies, rangeLabel } = input

  const active = companies.filter(
    (entry) => entry.pendingIntake + entry.inCustody + entry.handoverPending + entry.handedOverInRange > 0,
  )
  const sorted = [...active].sort(
    (a, b) =>
      b.pendingIntake + b.inCustody + b.handoverPending - (a.pendingIntake + a.inCustody + a.handoverPending) ||
      a.companyName.localeCompare(b.companyName, 'th'),
  )

  const rows: ReportRow[] = sorted.map((entry) => ({
    [ROW_KEY]: entry.companyId,
    company: entry.companyName,
    pendingIntake: entry.pendingIntake,
    inCustody: entry.inCustody,
    handoverPending: entry.handoverPending,
    handedOverInRange: entry.handedOverInRange,
  }))

  const pendingIntake = sumOf(active, (entry) => entry.pendingIntake)
  const inCustody = sumOf(active, (entry) => entry.inCustody)
  const handoverPending = sumOf(active, (entry) => entry.handoverPending)
  const handedOver = sumOf(active, (entry) => entry.handedOverInRange)

  return {
    columns: COLUMNS,
    rows,
    kpis: [
      { key: 'pendingIntake', label: 'รอรับเข้าคลัง', value: pendingIntake, type: 'number', higherIsBetter: false },
      { key: 'inCustody', label: 'อยู่ในคลัง', value: inCustody, type: 'number' },
      { key: 'handoverPending', label: 'รอส่งมอบ', value: handoverPending, type: 'number' },
      {
        key: 'handedOver',
        label: 'ส่งมอบแล้ว',
        value: handedOver,
        type: 'number',
        hint: rangeLabel,
      },
    ],
    totalRow: {
      company: 'รวมทั้งหมด',
      pendingIntake,
      inCustody,
      handoverPending,
      handedOverInRange: handedOver,
    },
    note:
      'ช่อง รอรับเข้า/ในคลัง/รอส่งมอบ เป็นยอดคงเหลือ ณ ปัจจุบัน (ไม่ขึ้นกับช่วงเวลาที่เลือก) · ' +
      `ช่อง "ส่งมอบแล้ว" นับเครื่องในล็อตที่ยืนยันส่งมอบภายใน${rangeLabel} · ` +
      'เครื่องที่ถูกปฏิเสธตอนรับเข้าไม่ถูกนับในช่องใด',
  }
}
