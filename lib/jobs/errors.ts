import { ModuleError, type ErrorMessage } from '@/lib/api/errors'

/**
 * Error code หมวด Background Job (`91` §11) — SSOT อยู่ที่ `docs/24` §6.11
 * ⚠️ ห้ามตั้ง code ใหม่ที่นี่โดยไม่เพิ่มลงไฟล์ 24 ใน commit เดียวกัน (Rule 04)
 *
 * `91` §11 ระบุ code ทั่วไปไว้ 4 ตัว (`REQUIRED_MISSING`/`DUPLICATE_RECORD`/`PERMISSION_DENIED`/
 * `INVALID_STATUS`) + `JOB_DUPLICATE` — ที่เติมเข้า `24` พร้อม commit นี้ (v4.13) มี 2 ตัว:
 *  · `JOB_NOT_FOUND` — 404 ของตัว job เอง (id ไม่มีจริง/อยู่นอกองค์กร — ตอบเหมือนกันเพื่อไม่ leak)
 *  · `JOB_INVALID_STATUS` — รูปแบบ prefix ตาม `24` §7 ของ `INVALID_STATUS` ใน `91` §11/§14.1
 *    (สั่ง retry งานที่ไม่ได้ล้มเหลว · dev trigger ส่ง job_type นอกรายการ §6.1)
 *
 * **`JOB_DUPLICATE` จงใจไม่อยู่ที่นี่**: `91` §11 กำหนดพฤติกรรมว่า "คืน job เดิมที่มีอยู่แล้ว
 * ไม่สร้างใหม่" ⇒ เป็นผลลัพธ์**สำเร็จ** ไม่ใช่ error ที่ต้อง reject · จะทำเป็น warning ก็ไม่ได้
 * เพราะ Rule 04 ล็อกรายชื่อ code แบบ "เตือนไม่ block" ไว้ 6 ตัว (เพิ่มต้องมีมติ PO)
 * ⇒ `POST /api/jobs` ตอบ 200 พร้อม `duplicate: true` แทน (ดู `lib/jobs/engine.ts`)
 */

export const JOB_ERROR_CODES = ['JOB_NOT_FOUND', 'JOB_INVALID_STATUS'] as const

export type JobErrorCode = (typeof JOB_ERROR_CODES)[number]

const HTTP_STATUS: Record<JobErrorCode, number> = {
  JOB_NOT_FOUND: 404,
  JOB_INVALID_STATUS: 400,
}

const MESSAGES: Record<JobErrorCode, ErrorMessage> = {
  JOB_NOT_FOUND: {
    title: 'ไม่พบงานเบื้องหลังนี้',
    message: 'ไม่พบงานเบื้องหลังรายการนี้ หรือคุณไม่มีสิทธิ์เข้าถึง',
  },
  JOB_INVALID_STATUS: {
    title: 'สั่งงานนี้ไม่ได้ในสถานะปัจจุบัน',
    message: 'สั่งทำงานใหม่ได้เฉพาะงานที่ล้มเหลวหรือถูกยกเลิกแล้วเท่านั้น (`91` §6.2)',
  },
}

export function jobErrorStatus(code: JobErrorCode): number {
  return HTTP_STATUS[code]
}

export function jobErrorMessage(code: JobErrorCode): ErrorMessage {
  return MESSAGES[code]
}

export class JobError extends ModuleError<JobErrorCode> {
  constructor(code: JobErrorCode, options?: { detail?: string; context?: Record<string, unknown> }) {
    super(code, MESSAGES[code], HTTP_STATUS[code], options)
    this.name = 'JobError'
  }
}

export function isJobError(error: unknown): error is JobError {
  return error instanceof JobError
}
