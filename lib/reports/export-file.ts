import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { renderReportPdf } from '@/components/pdf/report-doc'
import {
  REPORT_EXPORT_CONTENT_TYPE,
  reportExportFileName,
  type ReportExportFormat,
} from '@/lib/reports/export'
import type { ReportPayload } from '@/lib/reports/payload'
import { buildReportWorkbook } from '@/lib/reports/report-excel'

/**
 * ประกอบไฟล์ export จริง + ที่เก็บไฟล์ของงานเบื้องหลัง (E13)
 *
 * - **ไฟล์ทำสด (≤5,000 แถว)** ส่งกลับทาง response ตรง ๆ ไม่แตะ Storage
 * - **ไฟล์จากงานเบื้องหลัง** เก็บที่ Supabase Storage bucket private `report-exports`
 *   แล้วดาวน์โหลดผ่าน endpoint ของเราเอง (ต้องผ่านยามสิทธิ์ทุกครั้ง ไม่แจก signed URL)
 * - รายงานเป็น**ข้อมูลอ่านอย่างเดียวที่คำนวณใหม่ได้เสมอ** ⇒ ไม่ต้องทำ versioned/immutable
 *   แบบชุดส่งบัญชีของ `37` (Rule 09 บังคับกับ Export/Evidence ที่เป็นหลักฐานส่งออกนอกองค์กร)
 *   แต่ยังใช้ `upsert: false` + path ที่มี job id ⇒ ไฟล์ของงานหนึ่งไม่มีวันถูกทับด้วยอีกงาน
 */

export const REPORT_EXPORT_BUCKET = 'report-exports'

/** อายุไฟล์ที่เก็บไว้ให้ดาวน์โหลด — ไฟล์เก่ากว่านี้ให้สั่ง export ใหม่ (คำนวณใหม่ได้เสมอ) */
export const REPORT_EXPORT_RETENTION_DAYS = 7

export class ReportExportStorageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReportExportStorageError'
  }
}

export interface ReportExportFile {
  readonly fileName: string
  readonly contentType: string
  readonly bytes: Uint8Array
}

/**
 * สร้างไฟล์จาก payload **ตัวเดียวกับที่หน้าจอแสดง** (`96` §13) — ห้าม query ข้อมูลซ้ำในชั้นนี้
 * (runtime = nodejs เท่านั้น: ทั้ง SheetJS และ `@react-pdf/renderer` ทำงานฝั่ง server)
 */
export async function buildReportExportFile(options: {
  payload: ReportPayload
  format: ReportExportFormat
  generatedAt: Date
  generatedByName: string
}): Promise<ReportExportFile> {
  const fileName = reportExportFileName({
    code: options.payload.report.code,
    title: options.payload.report.title,
    at: options.generatedAt,
    format: options.format,
  })
  const contentType = REPORT_EXPORT_CONTENT_TYPE[options.format]

  if (options.format === 'xlsx') {
    return { fileName, contentType, bytes: buildReportWorkbook(options.payload, options.generatedAt) }
  }

  const pdf = await renderReportPdf({
    payload: options.payload,
    generatedAt: options.generatedAt,
    generatedByName: options.generatedByName,
  })
  return { fileName, contentType, bytes: new Uint8Array(pdf) }
}

/** path ของไฟล์ในถัง — ขึ้นต้นด้วย `organization_id` เสมอ (multi-tenant) + job id กันชนกัน */
export function reportExportStoragePath(input: {
  organizationId: string
  jobId: string
  fileName: string
}): string {
  return `${input.organizationId}/${input.jobId}/${input.fileName}`
}

export async function uploadReportExport(input: {
  path: string
  bytes: Uint8Array
  contentType: string
}): Promise<void> {
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.storage.from(REPORT_EXPORT_BUCKET).upload(input.path, input.bytes, {
    contentType: input.contentType,
    upsert: false,
  })
  if (error !== null) {
    throw new ReportExportStorageError(
      `อัปโหลดไฟล์รายงานไม่สำเร็จ — ${error.message} ` +
        `(ตรวจว่าสร้าง bucket "${REPORT_EXPORT_BUCKET}" แบบ private ไว้แล้วหรือยัง)`,
    )
  }
}

export async function downloadReportExport(path: string): Promise<Uint8Array> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.storage.from(REPORT_EXPORT_BUCKET).download(path)
  if (error !== null || data === null) {
    throw new ReportExportStorageError(`อ่านไฟล์รายงานไม่สำเร็จ — ${error?.message ?? 'ไม่พบไฟล์'}`)
  }
  return new Uint8Array(await data.arrayBuffer())
}
