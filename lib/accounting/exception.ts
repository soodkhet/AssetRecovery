import { AccountingError } from '@/lib/accounting/errors'
import type { ExceptionLevel, ExceptionStatus } from '@/lib/generated/prisma/enums'
import { compareExceptionLevel } from '@/lib/reports/dashboard'

/**
 * กติกาของข้อยกเว้น (ไฟล์ 34) — **pure ล้วน ไม่มี I/O** ใช้ร่วม FE/BE
 *
 * ### 3 มาตรการ "กันหายเงียบ" ที่ยืนยันกับ Product Owner แล้ว (`34` §6.3)
 * 1. `authorized` ต้องแสดง **แยกหมวดจาก `resolved` เสมอ** ⇒ `summarizeExceptions()` คืนคนละช่อง
 *    ไม่มีฟังก์ชันไหนในไฟล์นี้รวมสองสถานะเข้าด้วยกัน
 * 2. **ไม่สืบทอดข้ามรอบ** — `exceptions.period_id` ผูกกับรอบเดียว การตรวจพบปัญหาเดิมซ้ำในรอบใหม่
 *    ต้องเป็น record ใหม่ (ชั้น DB สร้างใหม่เสมอ ไม่มีเส้นทางย้าย period ของ record เดิม)
 * 3. `authorized` **ปลดบล็อกเฉพาะรอบเดียวกับที่ authorize** ⇒ `blockingCriticalOf()` รับเฉพาะแถว
 *    ของรอบนั้นและไม่เคยดูสถานะของรอบอื่น
 *
 * ### สิ่งที่ **ไม่ได้** อยู่ที่นี่ (ห้ามเขียนซ้ำ)
 * - ป้ายระดับ/ลำดับความเร่งด่วน/ลิงก์กลับต้นทาง → `lib/reports/dashboard.ts` (3.8)
 * - นโยบายล็อกรอบ → `lib/settings/period-lock.ts` (`13` §6.11)
 */

/** capability (`25` §7.5) — บัญชี manage · การเงิน view */
export const MANAGE_EXCEPTIONS = 'manage_exceptions'
/** 🔒 ล็อกกับผู้บริหาร (`25` §7.5 "✅ only") */
export const AUTHORIZE_EXCEPTION = 'authorize_exception'

/** ผู้ที่เห็นรายการข้อยกเว้นได้ (บัญชี manage · การเงิน view · ผู้บริหารผ่าน capability ของตัวเอง) */
export const EXCEPTION_READ_CAPABILITIES = [MANAGE_EXCEPTIONS, AUTHORIZE_EXCEPTION] as const

// ── State machine (`23` §6.12) ──────────────────────────────────────────────

/** `open → resolved` (แก้ต้นทางจริง) · `open → authorized` (ผู้บริหารรับความเสี่ยงเฉพาะรอบนี้) */
export const EXCEPTION_TRANSITIONS: Readonly<Record<ExceptionStatus, readonly ExceptionStatus[]>> = {
  open: ['resolved', 'authorized'],
  resolved: [],
  authorized: [],
}

export function canTransitionException(from: ExceptionStatus, to: ExceptionStatus): boolean {
  return EXCEPTION_TRANSITIONS[from].includes(to)
}

export function assertExceptionTransition(from: ExceptionStatus, to: ExceptionStatus): void {
  if (!canTransitionException(from, to)) {
    throw new AccountingError('EXCEPTION_INVALID_STATUS', { detail: `status=${from} → ${to}` })
  }
}

/** แก้รายละเอียด (level/title/description/module) ได้เฉพาะขณะยัง `open` (`34` §14) */
export function assertExceptionEditable(status: ExceptionStatus): void {
  if (status !== 'open') {
    throw new AccountingError('EXCEPTION_INVALID_STATUS', { detail: `edit ขณะ status=${status}` })
  }
}

/** เหตุผลของการอนุมัติยกเว้นบังคับเสมอ (`34` §11 · §10) — ช่องว่างล้วนถือว่าไม่กรอก */
export function assertAuthorizeNote(note: string): string {
  const trimmed = note.trim()
  if (trimmed.length === 0) throw new AccountingError('AUTHORIZED_EXCEPTION_REASON_REQUIRED')
  return trimmed
}

// ── สรุปยอด (มาตรการกันหายเงียบข้อ 1) ────────────────────────────────────────

export interface ExceptionRow {
  level: ExceptionLevel
  status: ExceptionStatus
}

export interface ExceptionStatusCounts {
  critical: number
  warning: number
  info: number
  total: number
}

/**
 * นับแยก 3 สถานะเสมอ — **ห้ามรวม `authorized` เข้ากับ `resolved`** (`34` §6.3 · §15)
 * `blockingCritical` = critical ที่ยัง `open` เท่านั้น (ตัวที่บล็อกปิดงวด/Export)
 */
export interface ExceptionSummary {
  open: ExceptionStatusCounts
  authorized: ExceptionStatusCounts
  resolved: ExceptionStatusCounts
  /** derived — `30` §7.1 ห้ามสร้างคอลัมน์ใน `accounting_periods` */
  criticalCount: number
  warningCount: number
  blockingCritical: number
}

function emptyCounts(): ExceptionStatusCounts {
  return { critical: 0, warning: 0, info: 0, total: 0 }
}

/** แถวที่นับมาแล้วจาก `groupBy` (level × status × จำนวน) — ใช้ตอนสรุปหลายรอบพร้อมกัน */
export interface ExceptionCountInput extends ExceptionRow {
  count: number
}

export function summarizeExceptionCounts(rows: readonly ExceptionCountInput[]): ExceptionSummary {
  const summary: ExceptionSummary = {
    open: emptyCounts(),
    authorized: emptyCounts(),
    resolved: emptyCounts(),
    criticalCount: 0,
    warningCount: 0,
    blockingCritical: 0,
  }
  for (const row of rows) {
    const bucket = summary[row.status]
    bucket[row.level] += row.count
    bucket.total += row.count
    if (row.level === 'critical') summary.criticalCount += row.count
    if (row.level === 'warning') summary.warningCount += row.count
    if (row.level === 'critical' && row.status === 'open') summary.blockingCritical += row.count
  }
  return summary
}

export function summarizeExceptions(rows: readonly ExceptionRow[]): ExceptionSummary {
  return summarizeExceptionCounts(rows.map((row) => ({ ...row, count: 1 })))
}

// ── ตัวบล็อกปิดงวด / Export (`34` §6.1 · §11) ───────────────────────────────

export interface BlockingException {
  id: string
  level: ExceptionLevel
  status: ExceptionStatus
  title: string
  sourceModule: string
}

/**
 * critical ที่ยัง `open` **ของรอบที่ส่งเข้ามาเท่านั้น** — ผู้เรียกต้องกรองด้วย `period_id` มาก่อน
 * (`authorized` ของรอบก่อนหน้าไม่มีทางหลุดเข้ามาปลดบล็อกรอบนี้ — มาตรการกันหายเงียบข้อ 3)
 */
export function blockingCriticalOf<T extends BlockingException>(rows: readonly T[]): T[] {
  return rows
    .filter((row) => row.level === 'critical' && row.status === 'open')
    .sort((a, b) => compareExceptionLevel(a.level, b.level) || a.title.localeCompare(b.title, 'th'))
}

/** ยามของ Export Accounting Pack (`34` §11 · ไฟล์ 37 — Phase 4.6 เรียกตัวนี้ ห้ามเขียนกติกาซ้ำ) */
export function assertExportNotBlocked(rows: readonly BlockingException[]): void {
  const blocking = blockingCriticalOf(rows)
  if (blocking.length === 0) return
  throw new AccountingError('EXPORT_BLOCKED_CRITICAL', {
    detail: `critical open ${blocking.length} รายการ`,
    context: {
      blockingExceptions: blocking.map((row) => ({ id: row.id, title: row.title, sourceModule: row.sourceModule })),
    },
  })
}

// ── ป้ายสถานะ (`34` §8 — badge 3 สี) ────────────────────────────────────────

export const EXCEPTION_STATUS_LABEL: Readonly<Record<ExceptionStatus, string>> = {
  open: 'ยังไม่จัดการ',
  authorized: 'ผ่านแบบมีข้อยกเว้น',
  resolved: 'แก้ไขแล้ว',
}

export function exceptionStatusLabel(status: ExceptionStatus): string {
  return EXCEPTION_STATUS_LABEL[status]
}

// ── ปุ่มบนแถวข้อยกเว้น (`34` §8) ─────────────────────────────────────────────

/** สิทธิ์ที่หน้าจอถืออยู่ — บัญชีจัดการรายการ · ผู้บริหารอนุมัติยกเว้น (`34` §12) */
export interface ExceptionCapabilityFlags {
  /** `manage:manage_exceptions` (สายบัญชี) */
  canManage: boolean
  /** `manage:authorize_exception` (ผู้บริหาร — 🔒 "✅ only") */
  canAuthorize: boolean
}

export interface ExceptionActions {
  canEdit: boolean
  canResolve: boolean
  canAuthorize: boolean
}

/**
 * สถานะ + สิทธิ์ → ปุ่มที่ขึ้นบนแถว — **หน้าจอห้าม `if` สถานะเอง**
 * แก้รายละเอียดได้เฉพาะ `open` (`34` §14) · เปลี่ยนสถานะยึด `EXCEPTION_TRANSITIONS` ตัวเดียวกับ API
 */
export function exceptionActionsFor(status: ExceptionStatus, caps: ExceptionCapabilityFlags): ExceptionActions {
  return {
    canEdit: caps.canManage && status === 'open',
    canResolve: caps.canManage && canTransitionException(status, 'resolved'),
    canAuthorize: caps.canAuthorize && canTransitionException(status, 'authorized'),
  }
}
