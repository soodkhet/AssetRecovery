import type { RequestMeta } from '@/lib/auth/request-meta'
import type { SessionUser } from '@/lib/auth/types'
import { enqueueJob } from '@/lib/jobs/engine'
import { jobTypeLabel } from '@/lib/jobs/job-types'
import type { ReportDefinition } from '@/lib/reports/catalog'
import {
  shouldRunExportInBackground,
  type ReportExportFormat,
} from '@/lib/reports/export'
import { buildReportExportFile, type ReportExportFile } from '@/lib/reports/export-file'
import type { ReportPayload } from '@/lib/reports/payload'
import { reportRangeKey, type ReportRange } from '@/lib/reports/range'
import { runReport } from '@/lib/reports/run'

/**
 * ปุ่ม Export ของหน้ารายงาน (`96` §11 · E13) — ตัดสินใจ "ทำสด" หรือ "ส่งเข้างานเบื้องหลัง"
 *
 * ### ทำไมต้องรันรายงานก่อนถึงจะรู้ว่าจะทำสดได้ไหม
 * เกณฑ์ของ E13 คือ **จำนวนแถว** ⇒ ต้องมีผลลัพธ์ก่อน · ไม่แพงเพราะผลลัพธ์มาจากแคชชุดเดียวกับ
 * ที่หน้าจอเพิ่งแสดง (`96` §8) และคีย์แคชเหมือนกันเป๊ะ ⇒ ไฟล์ที่ได้ตรงกับ UI ทุกแถวโดยโครงสร้าง
 *
 * ### สิทธิ์
 * `runReport()` เรียก `assertReportAccess()` ให้แล้ว ⇒ export ไม่ใช่ทางลัดข้ามสิทธิ์
 * และงานเบื้องหลังถูกรัน **ในนามผู้สั่ง** อีกชั้น (`lib/reports/export-job.ts`)
 *
 * ### กันสั่งซ้ำ
 * คีย์กันซ้ำผูกกับ (องค์กร, ผู้สั่ง, รายงาน, ช่วง, พารามิเตอร์, รูปแบบไฟล์, **เวลาที่ข้อมูลถูกคำนวณ**)
 * ⇒ กดปุ่มรัว ๆ ได้งานเดิม แต่พอข้อมูลถูกคำนวณใหม่ (แคชหมดอายุ/กดรีเฟรช) จะได้งานใหม่จริง ๆ
 */

export type ReportExportOutcome =
  | { readonly mode: 'sync'; readonly payload: ReportPayload; readonly file: ReportExportFile }
  | {
      readonly mode: 'job'
      readonly payload: ReportPayload
      readonly jobId: string
      readonly duplicate: boolean
      readonly rowCount: number
    }

export interface ReportExportRequest {
  readonly range: ReportRange
  readonly format: ReportExportFormat
  readonly params?: Readonly<Record<string, string>>
  readonly now?: Date
}

function idempotencyKeyOf(input: {
  user: SessionUser
  report: ReportDefinition
  range: ReportRange
  params: Readonly<Record<string, string>>
  format: ReportExportFormat
  computedAt: string
}): string {
  const params = Object.entries(input.params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('&')
  return [
    'report-export',
    input.user.id,
    input.report.id,
    reportRangeKey(input.range),
    params,
    input.format,
    input.computedAt,
  ].join(':')
}

export async function exportReport(
  ctx: { actor: SessionUser; meta: RequestMeta },
  report: ReportDefinition,
  request: ReportExportRequest,
): Promise<ReportExportOutcome> {
  const now = request.now ?? new Date()
  const params = request.params ?? {}
  const payload = await runReport(ctx.actor, report, { range: request.range, refresh: false, params, now })

  if (!shouldRunExportInBackground(payload.rows.length)) {
    const file = await buildReportExportFile({
      payload,
      format: request.format,
      generatedAt: now,
      generatedByName: ctx.actor.fullName,
    })
    return { mode: 'sync', payload, file }
  }

  const { job, duplicate } = await enqueueJob({
    organizationId: ctx.actor.organizationId,
    jobType: 'report_export',
    payload: {
      reportId: report.id,
      format: request.format,
      // เก็บขอบเขต **ที่คำนวณแล้ว** ลงไปด้วยเสมอ — งานอาจถูกรันข้ามวัน ถ้าเก็บแค่ preset
      // ("เดือนนี้") ไฟล์ที่ได้จะเป็นคนละช่วงกับที่ผู้ใช้เห็นตอนกดปุ่ม
      preset: request.range.preset,
      from: payload.range.from,
      to: payload.range.to,
      label: payload.range.label,
      params,
    },
    idempotencyKey: idempotencyKeyOf({
      user: ctx.actor,
      report,
      range: request.range,
      params,
      format: request.format,
      computedAt: payload.cache.computedAt,
    }),
    createdBy: ctx.actor.id,
    actorRole: ctx.actor.roleName,
    reason:
      `สั่งงานเบื้องหลัง "${jobTypeLabel('report_export')}" — ${report.code} ${report.title} ` +
      `ช่วง ${payload.range.label} (${payload.rows.length} แถว เกินเพดานทำสด)`,
  })

  return { mode: 'job', payload, jobId: job.id, duplicate, rowCount: payload.rows.length }
}
