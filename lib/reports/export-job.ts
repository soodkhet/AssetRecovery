import type { SessionUser } from '@/lib/auth/types'
import { findReport } from '@/lib/reports/catalog'
import { ReportError } from '@/lib/reports/errors'
import { REPORT_EXPORT_FORMATS, type ReportExportFormat } from '@/lib/reports/export'
import {
  buildReportExportFile,
  reportExportStoragePath,
  uploadReportExport,
} from '@/lib/reports/export-file'
import { resolveReportRange, type ReportRangeInput, type ReportRangePreset } from '@/lib/reports/range'
import { REPORT_RANGE_PRESETS } from '@/lib/reports/range'
import { runReport } from '@/lib/reports/run'

/**
 * งานเบื้องหลัง `report_export` (E13 · `91` §6.1) — ใช้เมื่อรายงานเกิน 5,000 แถว
 *
 * ### กติกา
 * - **รันแทนคน ไม่ใช่ข้ามสิทธิ์** (DEC-002): ตัวรันงานโหลด `SessionUser` ของ `jobs.created_by`
 *   มาให้ แล้ว `runReport()` ตรวจ `assertReportAccess()` + scope ทีมของคนคนนั้นตามปกติ
 * - **idempotent** (`91` §17): งานเดียวกันรันซ้ำได้ผลเท่าเดิม — รายงานอ่านอย่างเดียว และ path
 *   ของไฟล์ผูกกับ job id (รันซ้ำ job เดิม = เขียนไฟล์ชื่อเดิม ซึ่ง `upsert: false` จะปฏิเสธ
 *   ⇒ ถือว่ามีไฟล์อยู่แล้ว งานสำเร็จโดยไม่สร้างซ้ำ)
 * - ไม่มี notification เมื่อเสร็จ: `90` §6.3 ไม่มีแถวของงานเบื้องหลัง (เหตุผลเดียวกับที่ 5.3
 *   ไม่เพิ่ม event `job.status.changed`) — ผู้ใช้ติดตามสถานะที่หน้า Job Log แล้วกดดาวน์โหลด
 */

export interface ReportExportJobPayload {
  readonly reportId: string
  readonly format: ReportExportFormat
  readonly preset: ReportRangePreset
  /** ขอบเขตที่คำนวณไว้ตอนกดปุ่ม (`YYYY-MM-DD`) — งานอาจรันข้ามวัน ห้ามคิดช่วงใหม่จาก preset */
  readonly from: string
  readonly to: string
  /** ป้าย พ.ศ. ที่ผู้ใช้เห็นตอนกดปุ่ม — ไม่มีก็คำนวณใหม่จากช่วง */
  readonly label?: string
  readonly params?: Readonly<Record<string, string>>
}

export interface ReportExportJobResult extends Record<string, unknown> {
  reportCode: string
  fileName: string
  storagePath: string
  contentType: string
  rowCount: number
  sizeBytes: number
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function stringParams(value: unknown): Record<string, string> {
  const entries = Object.entries(asRecord(value)).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  )
  return Object.fromEntries(entries)
}

/** อ่าน payload ของ job (JSON ดิบจากฐาน) — ค่าที่ไม่ถูกต้องต้องดังทันที ห้ามเดาแทนผู้สั่ง */
export function parseReportExportPayload(payload: unknown): ReportExportJobPayload {
  const raw = asRecord(payload)
  const reportId = raw['reportId']
  const format = raw['format']
  const preset = raw['preset']

  if (typeof reportId !== 'string' || findReport(reportId) === null) {
    throw new Error(`payload ของงาน report_export ต้องมี "reportId" ที่อยู่ในทะเบียนรายงาน (ได้ ${String(reportId)})`)
  }
  if (typeof format !== 'string' || !REPORT_EXPORT_FORMATS.includes(format as ReportExportFormat)) {
    throw new Error(`payload ของงาน report_export ต้องมี "format" เป็น ${REPORT_EXPORT_FORMATS.join('/')}`)
  }
  if (typeof preset !== 'string' || !REPORT_RANGE_PRESETS.includes(preset as ReportRangePreset)) {
    throw new Error(`payload ของงาน report_export ต้องมี "preset" ที่ถูกต้อง (ได้ ${String(preset)})`)
  }
  const from = raw['from']
  const to = raw['to']
  if (typeof from !== 'string' || typeof to !== 'string') {
    throw new Error('payload ของงาน report_export ต้องมี "from"/"to" เป็นวันที่ที่คำนวณไว้แล้ว')
  }

  return {
    reportId,
    format: format as ReportExportFormat,
    preset: preset as ReportRangePreset,
    from,
    to,
    ...(typeof raw['label'] === 'string' ? { label: raw['label'] } : {}),
    params: stringParams(raw['params']),
  }
}

export async function runReportExportJob(input: {
  actor: SessionUser
  jobId: string
  payload: unknown
  now: Date
}): Promise<ReportExportJobResult> {
  const parsed = parseReportExportPayload(input.payload)
  const report = findReport(parsed.reportId)
  if (report === null) throw new ReportError('REPORT_NOT_FOUND', { detail: `report=${parsed.reportId}` })

  // ใช้ขอบเขตที่ถูกคำนวณไว้ตอนกดปุ่มเสมอ (ผ่านตัว resolve เพื่อ validate รูปแบบวันที่)
  // แล้วคง `preset` เดิมไว้ ⇒ คีย์แคชตรงกับที่หน้าจอใช้ ไฟล์จึงตรงกับ UI ทุกแถว (`96` §13)
  const rangeInput: ReportRangeInput = { preset: 'custom', from: parsed.from, to: parsed.to }
  const exact = resolveReportRange(rangeInput, input.now)
  const range = {
    preset: parsed.preset,
    startDate: exact.startDate,
    endDate: exact.endDate,
    label: parsed.label ?? exact.label,
  }

  const payload = await runReport(input.actor, report, {
    range,
    refresh: false,
    params: parsed.params ?? {},
    now: input.now,
  })

  const file = await buildReportExportFile({
    payload,
    format: parsed.format,
    generatedAt: input.now,
    generatedByName: input.actor.fullName,
  })
  const storagePath = reportExportStoragePath({
    organizationId: input.actor.organizationId,
    jobId: input.jobId,
    fileName: file.fileName,
  })
  await uploadReportExport({ path: storagePath, bytes: file.bytes, contentType: file.contentType })

  return {
    reportCode: report.code,
    fileName: file.fileName,
    storagePath,
    contentType: file.contentType,
    rowCount: payload.rows.length,
    sizeBytes: file.bytes.byteLength,
  }
}
