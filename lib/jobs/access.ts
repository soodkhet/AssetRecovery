import { hasCapability, type CapabilityHolder } from '@/lib/auth/permission'
import { EXPORT_ACCOUNTING_PACK } from '@/lib/exports/pack'
import type { JobTypeCode } from '@/lib/jobs/job-types'
import { GENERATE_PAYMENT_FILE } from '@/lib/payout/payout'

/**
 * capability ของงานเบื้องหลัง (`91` §12) — แยกไฟล์เพราะทั้ง route (server) และหน้าจอ (client)
 * ต้องใช้ code เดียวกันโดยไม่ลาก Prisma เข้าไปฝั่ง client
 *
 * - `view`   = ดูหน้า Job Log + รายละเอียดงาน
 * - `manage` = สั่งงานใหม่ (`POST /api/jobs`, dev trigger) — "Trigger job" ของ §12
 * - **retry ล็อก Superadmin เท่านั้น** (§12 "Retry job: Superadmin/Owner") — ตรวจแยกจาก
 *   access_level ที่ `assertJobRetryAllowed()` เพราะ role อื่นที่ได้ `manage` ก็ยัง retry ไม่ได้
 */
export const MANAGE_JOBS = 'manage_jobs'

/**
 * capability **ของงานที่ job ไปทำแทนคน** (DEC-002 — สิทธิ์ต้องถูกตรวจที่ API layer ของ *action จริง*)
 *
 * `export_pack` / `bank_file` เรียก `createExportPack()` / `generatePaymentFile()` ในนามผู้สั่งงาน
 * แต่สอง service นั้นบังคับสิทธิ์ไว้ที่ route เจ้าของเท่านั้น (ตัวมันเองคุมแค่ scope องค์กร)
 * ⇒ ถ้าไม่ตรวจตรงนี้ role ที่ได้ `manage_jobs` จะสร้างไฟล์โอนเงิน/ชุดบัญชีได้โดยไม่มีสิทธิ์นั้น
 * (ทางลัดข้ามชั้นสิทธิ์) · job_type ที่ไม่อยู่ในตาราง = ไม่ต้องมี capability เพิ่มจาก `manage_jobs`
 */
export const JOB_REQUIRED_CAPABILITY: Partial<Readonly<Record<JobTypeCode, string>>> = {
  export_pack: EXPORT_ACCOUNTING_PACK,
  bank_file: GENERATE_PAYMENT_FILE,
}

/** capability ที่ต้องมีเพิ่ม (ระดับ `manage`) ก่อนสั่งงานชนิดนี้ — `null` = ไม่ต้องมีเพิ่ม */
export function jobRequiredCapability(jobType: JobTypeCode): string | null {
  return JOB_REQUIRED_CAPABILITY[jobType] ?? null
}

/** สั่งงานชนิดนี้ได้ไหม — ใช้ทั้งฝั่ง server (บังคับจริง) และ FE (ซ่อนปุ่ม) */
export function canTriggerJobType(user: CapabilityHolder, jobType: JobTypeCode): boolean {
  if (!hasCapability(user, 'manage', MANAGE_JOBS)) return false
  const required = jobRequiredCapability(jobType)
  return required === null || hasCapability(user, 'manage', required)
}
