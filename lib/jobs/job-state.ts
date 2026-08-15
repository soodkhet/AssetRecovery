import type { JobStatus } from '@/lib/generated/prisma/enums'
import type { StatusBadgeGroup } from '@/lib/ui/status-badge'

/**
 * State machine ของ Background Job (`91` §6.2) — **pure ล้วน** ใช้ร่วม FE/BE
 *
 * ```
 * pending → running → completed
 *                   ↘ failed → (retry_count < max) → pending  ← ตัวรันงานหยิบใหม่ตาม backoff
 *                            → (retry_count ≥ max) → dead_letter (ต้อง Superadmin สั่ง retry เอง)
 * ```
 *
 * ⚠️ `dead_letter` **ไม่ใช่ค่าใน enum `job_status`** (`02` §3 มี 5 ค่า: pending/running/completed/
 * failed/cancelled) — เป็นสถานะเชิงแนวคิดที่ derive จาก `failed` + `retry_count >= max_retries`
 * ตามที่ `91` §6.2 กำกับไว้ ⇒ ห้ามสร้าง enum ใหม่ (Rule 04)
 */

/** สถานะที่ผู้ใช้เห็นบนหน้า Job Log = enum ของ `02` §3 + `dead_letter` ที่ derive มา */
export type JobViewStatus = JobStatus | 'dead_letter'

/** เพดาน retry อัตโนมัติเริ่มต้น — ตรงกับ default ของคอลัมน์ `jobs.max_retries` (`02` §10) */
export const JOB_MAX_RETRIES_DEFAULT = 3

/** เท่าที่ต้องรู้เพื่อคิดสถานะ/รอบ retry — รับได้ทั้งแถวจาก Prisma และ DTO ฝั่ง FE */
export interface JobAttemptState {
  status: JobStatus
  retryCount: number
  maxRetries: number
}

/** `failed` ที่หมดโควตา retry แล้ว = dead letter (`91` §6.2) — หยุดเอง ไม่ retry ต่ออัตโนมัติ */
export function isDeadLetter(job: JobAttemptState): boolean {
  return job.status === 'failed' && job.retryCount >= job.maxRetries
}

export function jobViewStatus(job: JobAttemptState): JobViewStatus {
  return isDeadLetter(job) ? 'dead_letter' : job.status
}

export const JOB_STATUS_LABEL: Readonly<Record<JobViewStatus, string>> = {
  pending: 'รอคิว',
  running: 'กำลังทำงาน',
  completed: 'สำเร็จ',
  failed: 'ล้มเหลว (รอ retry)',
  dead_letter: 'ล้มเหลวถาวร',
  cancelled: 'ยกเลิก',
}

/** สีป้ายสถานะ — เลือกจาก 10 กลุ่มกลางของ `04` §8.1 เท่านั้น (ห้ามสีนอกระบบ) */
export const JOB_STATUS_GROUP: Readonly<Record<JobViewStatus, StatusBadgeGroup>> = {
  pending: 'pending',
  running: 'sent',
  completed: 'success',
  failed: 'warning',
  dead_letter: 'critical',
  cancelled: 'neutral',
}

/**
 * ถอยเวลา (backoff) ก่อนหยิบงานที่ล้มเหลวมาทำใหม่ — 1 / 5 / 15 / 60 นาที แล้วคงที่ที่ 60
 * `attempt` = จำนวนครั้งที่ล้มไปแล้ว (1 = ล้มครั้งแรก)
 */
export function retryBackoffMinutes(attempt: number): number {
  if (attempt <= 1) return 1
  if (attempt === 2) return 5
  if (attempt === 3) return 15
  return 60
}

export interface NextAttempt {
  /** สถานะถัดไปที่ต้องเขียนลง DB */
  status: Extract<JobStatus, 'pending' | 'failed'>
  retryCount: number
  /** เวลาที่ตัวรันงานหยิบได้เร็วที่สุด — `null` = ไม่ retry แล้ว (dead letter) */
  scheduledAt: Date | null
  deadLetter: boolean
}

/**
 * งานล้มเหลวหนึ่งครั้งแล้วต้องทำอย่างไรต่อ (`91` §6.2)
 * - ยังไม่ครบเพดาน → กลับเข้าคิว `pending` พร้อมเวลา backoff
 * - ครบเพดาน → `failed` ค้างไว้เป็น dead letter รอ Superadmin สั่ง retry เอง
 */
export function nextAttemptAfterFailure(job: JobAttemptState, now: Date): NextAttempt {
  const retryCount = job.retryCount + 1
  if (retryCount >= job.maxRetries) {
    return { status: 'failed', retryCount, scheduledAt: null, deadLetter: true }
  }
  const delayMs = retryBackoffMinutes(retryCount) * 60_000
  return { status: 'pending', retryCount, scheduledAt: new Date(now.getTime() + delayMs), deadLetter: false }
}

/**
 * สั่ง retry ด้วยมือได้เมื่อไหร่ (`91` §14 — Superadmin เท่านั้น)
 * `failed` (รวม dead letter) และ `cancelled` เท่านั้น — งานที่ยังค้างคิว/กำลังทำ/สำเร็จแล้ว สั่งซ้ำไม่ได้
 */
export function canManualRetry(job: JobAttemptState): boolean {
  return job.status === 'failed' || job.status === 'cancelled'
}
