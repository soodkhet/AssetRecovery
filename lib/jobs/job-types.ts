/**
 * ทะเบียน job_type ของระบบ (`91` §6.1) — **pure ล้วน** ใช้ร่วม FE/BE
 *
 * `91` §6.1 ระบุ 5 ตัว (`export_pack`, `bank_file`, `wht_summary`, `reassign_timeout`,
 * `advance_overdue`) พร้อมหมายเหตุว่า "รายการนี้อาจเพิ่มในอนาคตตาม module ใหม่" — ระหว่าง Phase 2–5
 * มีอีก 2 ตัวเกิดขึ้นจริงจากมติ/สเปคของโมดูล:
 *  · `fuel_distance_retry` — มติ PO 14/08/2569 (D10) ใช้อยู่แล้วตั้งแต่ Phase 2.9
 *  · `wht_filing_reminder` — `33` §6.2/§8 · `90` §6.3 แถว 8 (Phase 5.2)
 *  · `report_export` — E13 (`02_OPEN_DECISIONS`) · `96` §11 (Phase 6.1) — รายงานเกิน 5,000 แถว
 *
 * ทั้งสองตัวรันผ่านตัวรันงานเดียวกัน แต่ **ไม่อยู่ในรายการที่ dev trigger เรียกได้**
 * เพราะ `91` §14.1 ล็อกไว้ว่า "รับ job_type ตามรายการใน §6.1 เท่านั้น" (ดู `DEV_TRIGGER_JOB_TYPES`)
 */

/** ทุก job_type ที่ตัวรันงานรู้จัก — ค่าใน `jobs.job_type` (`02` §10 เก็บเป็น TEXT) */
export const JOB_TYPES = [
  'export_pack',
  'bank_file',
  'wht_summary',
  'reassign_timeout',
  'advance_overdue',
  'wht_filing_reminder',
  'fuel_distance_retry',
  'report_export',
] as const

export type JobTypeCode = (typeof JOB_TYPES)[number]

/**
 * ตารางเวลาของงานที่ระบบตั้งเอง
 * - `daily` = วันละครั้งตามวันไทย (คีย์กันซ้ำใช้วันที่ไทย ไม่ใช่ UTC — Rule 01)
 * - `interval` = ทุก N นาที (คีย์กันซ้ำใช้ช่องเวลาที่ปัดลง)
 * - `null` = สั่งจากผู้ใช้เท่านั้น (`export_pack` / `bank_file` — ไม่มีรอบเวลา)
 */
export type JobSchedule = { readonly kind: 'daily' } | { readonly kind: 'interval'; readonly minutes: number }

export interface JobTypeSpec {
  readonly code: JobTypeCode
  readonly label: string
  readonly description: string
  readonly source: string
  /** อยู่ในรายการ §6.1 ของ `91` (5 ตัว) ⇒ dev trigger เรียกได้ */
  readonly inSpecCatalog: boolean
  readonly schedule: JobSchedule | null
}

export const JOB_TYPE_SPECS: Readonly<Record<JobTypeCode, JobTypeSpec>> = {
  export_pack: {
    code: 'export_pack',
    label: 'ส่งออกชุดข้อมูลบัญชี (Accounting Pack)',
    description: 'ประกอบไฟล์ทั้งชุดของรอบบัญชีแล้วขึ้นเวอร์ชันใหม่ — ห้ามเขียนทับของเดิม',
    source: '`91` §6.1 · `37`',
    inSpecCatalog: true,
    schedule: null,
  },
  bank_file: {
    code: 'bank_file',
    label: 'สร้างไฟล์โอนเงินของรอบจ่าย',
    description: 'สร้างไฟล์โอนเงินตามรูปแบบธนาคารที่ตั้งไว้ + SHA-256 ทุกเวอร์ชัน',
    source: '`91` §6.1 · `17` §6.3',
    inSpecCatalog: true,
    schedule: null,
  },
  wht_summary: {
    code: 'wht_summary',
    label: 'คำนวณสรุปยื่น ภ.ง.ด.3/53 ใหม่',
    description: 'รวมยอดจากหนังสือรับรองที่ยังมีผลของงวด แล้วเขียนทับสรุป (idempotent)',
    source: '`91` §6.1 · `33` §9',
    inSpecCatalog: true,
    schedule: { kind: 'daily' },
  },
  reassign_timeout: {
    code: 'reassign_timeout',
    label: 'ปิดคำขอเปลี่ยนผู้รับผิดชอบที่หมดเวลา',
    description: 'คำขอที่ไม่มีใครตอบจนเลยกำหนด → มอบหมายให้คนที่ผู้จัดการเลือกไว้',
    source: '`91` §6.1 · `40` §8',
    inSpecCatalog: true,
    schedule: { kind: 'interval', minutes: 10 },
  },
  advance_overdue: {
    code: 'advance_overdue',
    label: 'มาร์คเงินทดรองจ่ายที่เลยกำหนดเคลียร์',
    description: 'สแกนรายการ `approved` ที่เลย `due_clear_date` → `overdue` (ทางเดียวที่สถานะนี้เกิดได้)',
    source: '`91` §6.1 · `15` §9.1',
    inSpecCatalog: true,
    schedule: { kind: 'daily' },
  },
  wht_filing_reminder: {
    code: 'wht_filing_reminder',
    label: 'เตือนกำหนดยื่น ภ.ง.ด.3/53',
    description: 'เตือนทีมบัญชีก่อนถึงกำหนดนำส่ง และเตือนต่อเมื่อเลยกำหนด (มีโทษปรับจริง)',
    source: '`33` §6.2/§8 · `90` §6.3',
    inSpecCatalog: false,
    schedule: { kind: 'daily' },
  },
  report_export: {
    code: 'report_export',
    label: 'ส่งออกรายงานขนาดใหญ่',
    description: 'สร้างไฟล์ Excel/PDF ของรายงานที่เกิน 5,000 แถว แล้วเก็บไว้ให้ผู้สั่งดาวน์โหลด',
    source: 'E13 (`02_OPEN_DECISIONS`) · `96` §11',
    inSpecCatalog: false,
    // สั่งจากปุ่ม Export ของหน้ารายงานเท่านั้น — ไม่มีรอบเวลา
    schedule: null,
  },

  fuel_distance_retry: {
    code: 'fuel_distance_retry',
    label: 'คำนวณระยะทางค่าน้ำมันย้อนหลัง',
    description: 'คำนวณระยะทางที่ตอนปิดงานคำนวณไม่ได้ แล้วสร้างรายการเบิกค่าน้ำมันให้ครบ (D10)',
    source: 'มติ PO 14/08/2569 (D10) · `41` §10',
    inSpecCatalog: false,
    // ตัวกวาดคิวของตัวเอง (`SWEEPER_JOB_TYPES` ใน `lib/jobs/registry.ts`) — ตัวตั้งเวลาเรียก handler
    // ตรง ๆ ทุกรอบ ไม่ต้องตั้ง job ครอบอีกชั้น (งานจริงถูกตั้งไว้ตอนปิดเคสอยู่แล้ว)
    schedule: null,
  },
}

export function isKnownJobType(code: string): code is JobTypeCode {
  return Object.hasOwn(JOB_TYPE_SPECS, code)
}

/** ชื่อไทยของ job_type — ค่าที่ไม่รู้จัก (job เก่าในฐาน) คืน code ดิบ ไม่โยน error */
export function jobTypeLabel(code: string): string {
  return isKnownJobType(code) ? JOB_TYPE_SPECS[code].label : code
}

/**
 * job_type ที่ `POST /api/dev/trigger-job` รับได้ — **5 ตัวของ `91` §6.1 เท่านั้น**
 * (§14.1 + C8 ใน `docs/02_OPEN_DECISIONS.md`: dev trigger ต้องครบ 5 ตัวรวม `advance_overdue`)
 */
export const DEV_TRIGGER_JOB_TYPES: readonly JobTypeCode[] = JOB_TYPES.filter(
  (code) => JOB_TYPE_SPECS[code].inSpecCatalog,
)

/** job_type ที่ตัวตั้งเวลา (Vercel Cron/QStash) ตั้งคิวให้เองทุกครั้งที่ถูกเรียก */
export const SCHEDULED_JOB_TYPES: readonly JobTypeCode[] = JOB_TYPES.filter(
  (code) => JOB_TYPE_SPECS[code].schedule !== null,
)

const MS_PER_MINUTE = 60_000

/**
 * "ช่องเวลา" ที่ใช้เป็นกุญแจกันซ้ำของงานตามตารางเวลา — cron ยิงซ้ำในช่องเดิมต้องได้ job ตัวเดิม
 * (idempotency ตาม `91` §17 · `01` §11) ⇒ pure เพื่อทดสอบได้โดยไม่ต้องมี DB
 *
 * - `daily`    → วันที่**ตามปฏิทินไทย** `YYYY-MM-DD` (งานรายวันต้องเกิดวันละครั้งตามวันไทย ไม่ใช่ UTC)
 * - `interval` → เวลา UTC ที่ปัดลงเป็นช่วง N นาที `YYYY-MM-DDTHH:mm`
 */
export function jobScheduleBucket(schedule: JobSchedule, now: Date): string {
  if (schedule.kind === 'daily') {
    const bangkok = new Date(now.getTime() + 7 * 60 * MS_PER_MINUTE)
    return bangkok.toISOString().slice(0, 10)
  }
  const slot = Math.floor(now.getTime() / (schedule.minutes * MS_PER_MINUTE)) * schedule.minutes * MS_PER_MINUTE
  return new Date(slot).toISOString().slice(0, 16)
}

/** กุญแจกันซ้ำของงานที่ตัวตั้งเวลาสั่ง — ช่องเวลาเดียวกัน = job ตัวเดิมเสมอ */
export function scheduledIdempotencyKey(code: JobTypeCode, now: Date): string | null {
  const { schedule } = JOB_TYPE_SPECS[code]
  if (schedule === null) return null
  return `cron:${code}:${jobScheduleBucket(schedule, now)}`
}
