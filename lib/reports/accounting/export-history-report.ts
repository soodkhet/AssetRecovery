import { EXPORT_STATUS_LABEL, exportVersionLabel } from '@/lib/exports/pack'
import type { ExportRecordStatus } from '@/lib/generated/prisma/enums'
import { ROW_KEY, type ReportColumn, type ReportData, type ReportRow } from '@/lib/reports/payload'
import { comparePeriodKeys } from '@/lib/reports/accounting/period-window'

/**
 * **A3 — สถานะส่งออกชุดข้อมูลบัญชี (Export History)** (`96` §6-A3) — ชั้น **pure ล้วน ไม่มี I/O**
 *
 * ### กติกาที่ห้ามหลุด
 * - **แสดงทุกเวอร์ชัน** ของทุกงวด (`37` §6.2 — export ห้ามเขียนทับ ต้องขึ้น version ใหม่เสมอ)
 *   ⇒ รายงานที่โชว์เฉพาะเวอร์ชันล่าสุดจะซ่อนประวัติการส่งซ้ำซึ่งเป็นสิ่งที่สำนักงานบัญชีต้องตรวจ
 * - **งวดที่ยังไม่เคย export ต้องมีแถวของตัวเอง** — "ไม่มีแถว" กับ "ยังไม่ได้ส่ง" คนละเรื่อง
 *   (ค่าของงวดแบบนี้เป็น `null` ทั้งแถว ห้ามใส่ 0 แทนความว่าง — สัญญาของ `ReportData`)
 * - จำนวนไฟล์นับเฉพาะไฟล์หลัก 01–08 (`37` §6.1) ไม่รวมหน้าปก/ไฟล์ .zip · **เอกสารแนบยังไม่รวมใน
 *   ชุด export รอบนี้** (`37` §7.1) ⇒ ค่าเป็น `null` (ไม่มีข้อมูล) ไม่ใช่ 0 (มีข้อมูลว่าเป็นศูนย์)
 */

/** 1 แถว = 1 เวอร์ชันของการ export · `recordId = null` ⇒ งวดที่ยังไม่เคย export เลย */
export interface ExportHistoryEntry {
  recordId: string | null
  periodId: string
  periodLabel: string
  yearBe: number
  month: number
  version: number | null
  status: ExportRecordStatus | null
  /** เวลาที่ส่งให้สำนักงานบัญชี (`sent_at`) — ยังไม่ส่ง = `null` */
  sentAt: Date | null
  sentByName: string | null
  /** จำนวนไฟล์หลัก 01–08 ในชุด */
  fileCount: number | null
}

const COLUMNS: readonly ReportColumn[] = [
  { key: 'period', header: 'รอบบัญชี', type: 'text', width: 22 },
  { key: 'version', header: 'เวอร์ชัน', type: 'text', width: 12 },
  { key: 'sentAt', header: 'ส่งเมื่อ', type: 'datetime' },
  { key: 'sentBy', header: 'ส่งโดย', type: 'text', width: 22 },
  { key: 'statusLabel', header: 'สถานะ', type: 'text', width: 26 },
  { key: 'fileCount', header: 'จำนวนไฟล์', type: 'number' },
  { key: 'attachmentCount', header: 'เอกสารแนบ', type: 'number' },
]

/** ป้ายสถานะของแถว — งวดที่ยังไม่เคย export ไม่มีสถานะในสคีมา จึงใช้ข้อความกำกับแทน */
export function exportHistoryStatusLabel(status: ExportRecordStatus | null): string {
  return status === null ? 'ยังไม่ส่งออก' : EXPORT_STATUS_LABEL[status]
}

export function buildExportHistoryReport(input: { entries: readonly ExportHistoryEntry[] }): ReportData {
  // งวดใหม่อยู่บนสุด (ประวัติอ่านจากล่าสุดย้อนหลัง) · ภายในงวดเดียวกันเรียงเวอร์ชันมากไปน้อย
  const sorted = [...input.entries].sort(
    (a, b) => comparePeriodKeys(b, a) || (b.version ?? 0) - (a.version ?? 0),
  )

  const rows: ReportRow[] = sorted.map((entry) => ({
    [ROW_KEY]: entry.recordId ?? entry.periodId,
    period: entry.periodLabel,
    version: entry.version === null ? null : exportVersionLabel(entry.version),
    sentAt: entry.sentAt === null ? null : entry.sentAt.toISOString(),
    sentBy: entry.sentByName,
    statusLabel: exportHistoryStatusLabel(entry.status),
    fileCount: entry.fileCount,
    // เอกสารแนบยังไม่รวมในชุด (`37` §7.1) — ค่าว่างเสมอจนกว่าจะมีการตัดสินใจเพิ่มไฟล์แนบเข้าชุด
    attachmentCount: null,
  }))

  const periodIds = new Set(sorted.map((entry) => entry.periodId))
  const exportedPeriods = new Set(sorted.filter((entry) => entry.recordId !== null).map((entry) => entry.periodId))
  const sentPeriods = new Set(
    sorted.filter((entry) => entry.status === 'sent' || entry.status === 'accepted').map((entry) => entry.periodId),
  )
  const acceptedPeriods = new Set(
    sorted.filter((entry) => entry.status === 'accepted').map((entry) => entry.periodId),
  )
  const notExported = periodIds.size - exportedPeriods.size

  return {
    columns: COLUMNS,
    rows,
    kpis: [
      {
        key: 'periods',
        label: 'รอบบัญชีในช่วงที่เลือก',
        value: periodIds.size,
        type: 'number',
        hint: `${sorted.filter((entry) => entry.recordId !== null).length.toLocaleString('th-TH')} เวอร์ชันที่สร้างไว้`,
      },
      { key: 'sent', label: 'ส่งสำนักงานบัญชีแล้ว', value: sentPeriods.size, type: 'number' },
      { key: 'accepted', label: 'สำนักงานบัญชีตอบรับแล้ว', value: acceptedPeriods.size, type: 'number' },
      { key: 'notExported', label: 'ยังไม่ส่งออก', value: notExported, type: 'number', higherIsBetter: false },
    ],
    totalRow: null,
    note:
      'แสดงทุกเวอร์ชันของแต่ละงวด — การส่งออกซ้ำจะขึ้นเวอร์ชันใหม่เสมอ ไม่ทับของเดิม (ไฟล์ 37) · ' +
      'จำนวนไฟล์นับเฉพาะไฟล์ข้อมูล 01–08 ไม่รวมหน้าปกและไฟล์ .zip · ' +
      'เอกสารแนบ (ใบเสร็จ/หลักฐาน) ยังไม่รวมอยู่ในชุดส่งออกรอบนี้ จึงแสดงเป็นค่าว่าง',
  }
}
