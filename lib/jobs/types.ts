import type { JobViewStatus } from '@/lib/jobs/job-state'

/**
 * DTO ของหน้า Job Log (`91` §8/§14) — ค่าเวลาเป็น ISO UTC เสมอ (แปลงเป็น พ.ศ./Asia-Bangkok ที่ FE)
 */

/** ไฟล์ผลลัพธ์ของงาน — versioned + hash เสมอ ห้ามเขียนทับ (`91` §10 · `02` §13) */
export interface JobOutputDto {
  label: string
  /** endpoint ดาวน์โหลดของโมดูลเจ้าของไฟล์ (ตรวจสิทธิ์ของตัวเองอีกชั้นตอนกด — DEC-002) */
  href: string
  fileName: string | null
  /** SHA-256 ของไฟล์เวอร์ชันนี้ */
  fileHash: string | null
  version: number | null
}

export interface JobListItemDto {
  id: string
  jobType: string
  jobTypeLabel: string
  status: JobViewStatus
  retryCount: number
  maxRetries: number
  createdAt: string
  scheduledAt: string | null
  startedAt: string | null
  completedAt: string | null
  errorMessage: string | null
  /** ผู้สั่งงาน — `null` = ตัวตั้งเวลาของระบบ (`02` §10) */
  createdById: string | null
  createdByName: string | null
}

export interface JobDetailDto extends JobListItemDto {
  payload: unknown
  result: unknown
  output: JobOutputDto | null
}

export interface JobListDto {
  items: JobListItemDto[]
  total: number
  offset: number
  limit: number
  hasMore: boolean
}

/** ผลของการสร้าง job — `duplicate: true` = คีย์กันซ้ำตรงกับงานเดิม จึงคืนงานเดิม (`91` §11) */
export interface JobCreateResultDto {
  job: JobDetailDto
  duplicate: boolean
}

/** สรุปหนึ่งรอบของตัวรันงาน (`GET /api/cron/jobs`) */
export interface JobRunSummaryDto {
  enqueued: number
  duplicated: number
  picked: number
  completed: number
  retryScheduled: number
  deadLettered: number
  skipped: number
}
