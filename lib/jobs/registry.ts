import { resolveExpiredReassignments } from '@/lib/assignments/timeout-job'
import { runAdvanceOverdueJob } from '@/lib/advances/overdue-job'
import type { SessionUser } from '@/lib/auth/types'
import { loadSessionUser } from '@/lib/auth/session'
import { createExportPack } from '@/lib/exports/queries'
import { runFuelDistanceRetryJob } from '@/lib/field/fuel-distance-job'
import type { JobRow } from '@/lib/jobs/engine'
import type { JobTypeCode } from '@/lib/jobs/job-types'
import { generatePaymentFile } from '@/lib/payout/queries'
import { prisma } from '@/lib/prisma'
import { runReportExportJob } from '@/lib/reports/export-job'
import { runWhtFilingReminderJob } from '@/lib/wht/filing-reminder-job'
import { runWhtSummaryJob } from '@/lib/wht/summary-job'

/**
 * ทะเบียน handler ของ job แต่ละชนิด (`91` §6.1) — **ไม่มี business logic ในไฟล์นี้**
 *
 * ทุกตัวเป็น handler ที่โมดูลเจ้าของเขียนไว้แล้วตั้งแต่ Phase 2–5 · ที่นี่แค่ต่อสายเข้ากับตัวรันงาน
 * กลางเพื่อให้มี "ทางเดินเดียว" ของงานเบื้องหลังทั้งระบบ (สถานะ/retry/dead letter/Job Log)
 *
 * | job_type | handler | ที่มา |
 * |---|---|---|
 * | `reassign_timeout` | `resolveExpiredReassignments()` | Phase 2.6 (`40` §8) |
 * | `advance_overdue` | `runAdvanceOverdueJob()` | Phase 3.3 (`15` §9.1) |
 * | `wht_filing_reminder` | `runWhtFilingReminderJob()` | Phase 5.2 (`33` §6.2) |
 * | `wht_summary` | `runWhtSummaryJob()` | Phase 4.5 (`33` §9) — ห่อ `refreshFilingSummary()` เดิม |
 * | `export_pack` | `createExportPack()` | Phase 4.6 (`37` §6.2) |
 * | `bank_file` | `generatePaymentFile()` | Phase 3.4 (`17` §6.3) |
 * | `report_export` | `runReportExportJob()` | Phase 6.1 (E13 · `96` §11) |
 *
 * `fuel_distance_retry` **ไม่อยู่ในทะเบียนนี้** — handler เดิม (`runFuelDistanceRetryJob()`) เป็น
 * ตัวกวาดคิว: มันไปหยิบ job ของตัวเองจากตาราง `jobs` แล้วจัดการสถานะ/retry เองครบตั้งแต่ Phase 2.9
 * ⇒ ถ้าเอามาเสียบเป็น handler รายตัวจะกลายเป็นสองชั้นที่ claim ทับกัน · ตัวรันงานกลางจึง **ข้าม**
 * job_type กลุ่มนี้ (`SWEEPER_JOB_TYPES`) แล้วเรียกตัวกวาดคิวตรง ๆ หนึ่งครั้งต่อรอบแทน
 */

/** ผลลัพธ์ที่ handler คืน — ต้อง serialize เป็น JSON ได้ (ลง `jobs.result`) */
export type JobHandlerResult = Record<string, unknown>

export interface JobHandlerContext {
  job: JobRow
  now: Date
}

export type JobHandler = (context: JobHandlerContext) => Promise<JobHandlerResult>

/** job_type ที่ดูแลคิวของตัวเอง — ตัวรันงานกลางไม่หยิบไปรันรายตัว (ดูหมายเหตุหัวไฟล์) */
export const SWEEPER_JOB_TYPES: readonly JobTypeCode[] = ['fuel_distance_retry']

function payloadOf(job: JobRow): Record<string, unknown> {
  return job.payload !== null && typeof job.payload === 'object' && !Array.isArray(job.payload)
    ? (job.payload as Record<string, unknown>)
    : {}
}

function requiredString(job: JobRow, key: string): string {
  const value = payloadOf(job)[key]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`payload ของงาน ${job.jobType} ต้องมี "${key}" เป็นข้อความ`)
  }
  return value
}

/**
 * งานที่ทำแทนคน (export/bank file) ต้องรู้ว่าใครสั่ง — สิทธิ์และ scope ของคนคนนั้นถูกใช้จริง
 * ในตัว service ปลายทาง (DEC-002 — ห้ามข้ามชั้นสิทธิ์เพียงเพราะเรียกจาก job)
 */
async function actorOf(job: JobRow): Promise<SessionUser> {
  if (job.createdBy === null) {
    throw new Error(`งาน ${job.jobType} ต้องมีผู้สั่งงาน (jobs.created_by) — งานนี้ถูกสร้างโดยระบบ`)
  }
  const user = await prisma.user.findUnique({
    where: { id: job.createdBy },
    select: { supabaseUid: true },
  })
  if (user?.supabaseUid == null) {
    throw new Error(`ผู้สั่งงาน ${job.createdBy} ยังไม่ได้ผูกบัญชีเข้าสู่ระบบ — รันงานแทนไม่ได้`)
  }
  const actor = await loadSessionUser(user.supabaseUid)
  if (actor === null) throw new Error(`โหลดสิทธิ์ของผู้สั่งงาน ${job.createdBy} ไม่สำเร็จ`)
  return actor
}

/** งานเบื้องหลังไม่มี request จริง ⇒ ไม่มี IP/User-Agent (audit ยังครบ 9 fields — ค่าเป็น NULL) */
const JOB_REQUEST_META = { ipAddress: null, userAgent: null }

export const JOB_HANDLERS: Partial<Readonly<Record<JobTypeCode, JobHandler>>> = {
  reassign_timeout: async ({ job, now }) => {
    const result = await resolveExpiredReassignments({
      now,
      jobId: job.id,
      ...(job.organizationId === null ? {} : { organizationId: job.organizationId }),
    })
    return { ...result }
  },

  advance_overdue: async ({ job, now }) => {
    const result = await runAdvanceOverdueJob({
      now,
      jobId: job.id,
      ...(job.organizationId === null ? {} : { organizationId: job.organizationId }),
    })
    return { ...result }
  },

  wht_filing_reminder: async ({ job, now }) => {
    const result = await runWhtFilingReminderJob({
      now,
      ...(job.organizationId === null ? {} : { organizationId: job.organizationId }),
    })
    return { ...result }
  },

  wht_summary: async ({ job, now }) => {
    const periodId = payloadOf(job)['periodId']
    const result = await runWhtSummaryJob({
      now,
      jobId: job.id,
      ...(job.organizationId === null ? {} : { organizationId: job.organizationId }),
      ...(typeof periodId === 'string' ? { periodId } : {}),
    })
    return { ...result }
  },

  export_pack: async ({ job }) => {
    const actor = await actorOf(job)
    const record = await createExportPack(
      { actor, meta: JOB_REQUEST_META },
      { periodId: requiredString(job, 'periodId') },
    )
    return {
      exportRecordId: record.id,
      version: record.version,
      fileHash: record.fileHash,
      fileName: record.zipFileName,
      periodLabel: record.periodLabel,
    }
  },

  report_export: async ({ job, now }) => {
    const actor = await actorOf(job)
    return runReportExportJob({ actor, jobId: job.id, payload: job.payload, now })
  },

  bank_file: async ({ job, now }) => {
    const actor = await actorOf(job)
    const payload = payloadOf(job)
    const outcome = await generatePaymentFile(
      { actor, meta: JOB_REQUEST_META },
      requiredString(job, 'batchId'),
      {
        bankAccountId: requiredString(job, 'bankAccountId'),
        bankFileFormatId: requiredString(job, 'bankFileFormatId'),
        // สร้างซ้ำรอบเดิมต้องยืนยันมาในคำสั่ง (`17` §11 `DUPLICATE_PAYMENT_FILE`) — job ไม่ยืนยันแทนคน
        confirmDuplicate: payload['confirmDuplicate'] === true,
        reason: requiredString(job, 'reason'),
      },
      now,
    )
    return {
      batchId: outcome.result.batch.id,
      generated: outcome.result.generated,
      fileName: outcome.result.fileName,
      fileHash: outcome.result.fileHash,
      rowCount: outcome.result.rowCount,
      ...(outcome.warning === undefined ? {} : { warning: outcome.warning.code }),
    }
  },
}

export interface SweeperResult {
  fuelDistance: Awaited<ReturnType<typeof runFuelDistanceRetryJob>>
}

/**
 * เรียกตัวกวาดคิวที่ดูแลสถานะ job ของตัวเอง — หนึ่งครั้งต่อรอบของตัวตั้งเวลา
 * (`fuel_distance_retry` ตามมติ PO 14/08/2569 D10)
 */
export async function runSweeperJobs(options: { now?: Date; organizationId?: string } = {}): Promise<SweeperResult> {
  return {
    fuelDistance: await runFuelDistanceRetryJob({
      ...(options.now === undefined ? {} : { now: options.now }),
      ...(options.organizationId === undefined ? {} : { organizationId: options.organizationId }),
    }),
  }
}
