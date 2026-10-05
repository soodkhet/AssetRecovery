import type { CaseStatus } from '@/lib/generated/prisma/enums'
import { toBangkokParts } from '@/lib/format/datetime'

/**
 * นโยบายระยะเก็บเอกสารลูกหนี้ (PDPA — มติ PO 06/10/2569 U97 · `13` §6.16 · `90` §6.2) — **pure ล้วน ไม่มี I/O**
 *
 * - ค่าตั้งระดับองค์กร: จำนวนปีหลังปิดเคส (ค่าเริ่มต้น 5 · 1–20) — เก็บที่ `data_retention_settings`
 * - job `purge_debtor_documents` (รายวัน) ลบ**เฉพาะไฟล์**เอกสารลูกหนี้ที่เป็นข้อมูลส่วนบุคคล
 *   (ช่องตาม `PERSONAL_DATA_CASE_SLOTS` ของ `lib/uploads/personal-data.ts`) ของเคสที่จบไปนานกว่า N ปี
 * - เคสที่ "จบ" = `closed_success` / `closed_fail` (นับจาก `closed_at` — เวลาปิดงานครั้งแรก) และ `rejected`
 *   (ไม่รับเคส — สถานะจบ · นับจาก `reviewed_at`) · ระบบไม่มีสถานะ `cancelled` ของเคส (`02` §3 `case_status`)
 * - **ไม่แตะเอกสารบัญชี** (ใบกำกับ/50 ทวิ/Export Pack/ใบเสร็จ) — อยู่คนละตาราง/คนละ path และไม่อยู่ในตัวจำแนก
 */

export const DEFAULT_DEBTOR_DOCUMENT_RETENTION_YEARS = 5
export const MIN_DEBTOR_DOCUMENT_RETENTION_YEARS = 1
export const MAX_DEBTOR_DOCUMENT_RETENTION_YEARS = 20

export interface DataRetentionValues {
  debtorDocumentRetentionYears: number
}

/** สถานะเคสที่ถือว่าจบแล้วและนับระยะเก็บได้ */
export const RETENTION_CLOSED_CASE_STATUSES: readonly CaseStatus[] = ['closed_success', 'closed_fail', 'rejected']

export function isValidRetentionYears(years: number): boolean {
  return (
    Number.isInteger(years) &&
    years >= MIN_DEBTOR_DOCUMENT_RETENTION_YEARS &&
    years <= MAX_DEBTOR_DOCUMENT_RETENTION_YEARS
  )
}

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000

/**
 * จุดตัดของการลบ — เคสที่จบ **ก่อน** instant นี้ครบระยะเก็บแล้ว
 *
 * = เที่ยงคืนเวลาไทยของ "วันนี้ (ตามปฏิทินไทย) ย้อนหลัง N ปี" ⇒ เคสที่จบวันที่ D ถูกลบตั้งแต่วันถัดจากวันครบรอบ
 * D + N ปี (วันครบรอบพอดียังเก็บอยู่) · 29 ก.พ. ย้อนไปปีที่ไม่มีวันนั้น ⇒ 1 มี.ค. (ตามการเลื่อนของ `Date.UTC`)
 */
export function retentionCutoff(now: Date, years: number): Date {
  if (!isValidRetentionYears(years)) throw new RangeError(retentionYearsRangeMessage())
  const parts = toBangkokParts(now)
  if (parts === null) throw new RangeError('เวลาอ้างอิงไม่ถูกต้อง')
  const { year, month, day } = parts
  return new Date(Date.UTC(year - years, month - 1, day) - BANGKOK_OFFSET_MS)
}

/** เวลาที่ใช้นับระยะเก็บของเคส — `null` = ยังไม่จบ/ไม่มีเวลาอ้างอิง (ไม่ลบ) */
export function caseRetentionAnchor(row: {
  status: CaseStatus
  closedAt: Date | null
  reviewedAt: Date | null
}): Date | null {
  if (row.status === 'closed_success' || row.status === 'closed_fail') return row.closedAt
  if (row.status === 'rejected') return row.reviewedAt
  return null
}

/** เคสนี้ครบระยะเก็บเอกสารลูกหนี้แล้วหรือยัง */
export function isDebtorDocumentPurgeDue(
  row: { status: CaseStatus; closedAt: Date | null; reviewedAt: Date | null },
  now: Date,
  years: number,
): boolean {
  const anchor = caseRetentionAnchor(row)
  return anchor !== null && anchor.getTime() < retentionCutoff(now, years).getTime()
}

export function retentionYearsRangeMessage(): string {
  return `ระยะเก็บต้องเป็นจำนวนเต็ม ${MIN_DEBTOR_DOCUMENT_RETENTION_YEARS}–${MAX_DEBTOR_DOCUMENT_RETENTION_YEARS} ปี`
}

/** payload ที่ลง audit — ชื่อคอลัมน์ snake_case ตามตารางจริง */
export function toDataRetentionAuditPayload(values: DataRetentionValues): Record<string, number> {
  return { debtor_document_retention_years: values.debtorDocumentRetentionYears }
}

/** ข้อความบนหน้าเคสเมื่อไฟล์ถูกลบแล้ว (วันที่เป็น พ.ศ. — ผู้เรียกส่งข้อความวันที่ที่ format แล้ว) */
export function debtorDocumentsPurgedText(purgedDateLabel: string): string {
  return `เอกสารถูกลบตามนโยบายเก็บข้อมูลเมื่อ ${purgedDateLabel}`
}

/** เหตุผลมาตรฐานของ audit การลบโดย job — ระบุ job id ให้ trace ได้ (actor = ระบบ) */
export function debtorDocumentPurgeReason(jobId: string, years: number): string {
  return `[job:${jobId}] ลบไฟล์เอกสารลูกหนี้ตามนโยบายระยะเก็บข้อมูล ${years} ปีหลังปิดเคส`
}
