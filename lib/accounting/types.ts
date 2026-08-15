import type { ReadinessResult } from '@/lib/accounting/period'
import type { QuestionStatus, QuestionSummary } from '@/lib/accounting/question'
import type { AccountingPeriodStatus, ExceptionLevel, ExceptionStatus } from '@/lib/generated/prisma/enums'

/**
 * DTO ของรอบบัญชี (ไฟล์ 30 §7–§8) + ข้อยกเว้น (ไฟล์ 34 §7–§8) — ใช้ร่วม FE/BE
 * instant เป็น ISO UTC (หน้าจอแปลง Asia/Bangkok + พ.ศ. เอง — Rule 01)
 */

export interface ExceptionDto {
  id: string
  periodId: string
  /** "มิถุนายน 2569" — ป้ายรอบที่ exception นี้สังกัด (ไม่สืบทอดข้ามรอบ — `34` §6.3) */
  periodLabel: string
  level: ExceptionLevel
  status: ExceptionStatus
  statusLabel: string
  title: string
  description: string
  sourceModule: string
  sourceModuleLabel: string
  /** ลิงก์กลับต้นทาง — `null` = ยังไม่มีหน้าจริงของโมดูลนั้น (`14` §8) */
  sourceLink: string | null
  sourceRef: string | null
  resolvedByName: string | null
  resolvedAt: string | null
  resolutionNote: string | null
  authorizedByName: string | null
  authorizedAt: string | null
  authorizeNote: string | null
  createdAt: string
  createdByName: string
}

/** นับแยกหมวดเสมอ — `authorized` ห้ามปนกับ `resolved` (`34` §6.3 ข้อ 1) */
export interface ExceptionListDto {
  items: ExceptionDto[]
  summary: {
    open: { critical: number; warning: number; info: number; total: number }
    authorized: { critical: number; warning: number; info: number; total: number }
    resolved: { critical: number; warning: number; info: number; total: number }
    blockingCritical: number
  }
}

export interface AccountingPeriodDto {
  id: string
  periodLabel: string
  yearBe: number
  month: number
  status: AccountingPeriodStatus
  statusLabel: string
  /** derived จากตาราง `exceptions` ทุกครั้ง (`30` §7.1 — ไม่มีคอลัมน์ใน DB) */
  criticalCount: number
  warningCount: number
  /** ผลตรวจความพร้อมครั้งล่าสุดที่บันทึกไว้ (ไม่ใช่ผลสด — ผลสดเรียก `/readiness`) */
  exportReady: boolean
  lastReadinessCheckedAt: string | null
  /** วัน Export ล่าสุด (`30` §7.1 `exported_at`) — มาจาก `export_records` ไฟล์ 37 */
  exportedAt: string | null
  sentAt: string | null
  sentByName: string | null
  lockedAt: string | null
  lockedByName: string | null
  /** นโยบายแก้ไขของสถานะนี้ (`13` §6.11) — FE ใช้แสดงคำอธิบายใต้ badge */
  directEditLabel: string
}

/** ข้อซักถามจากสำนักงานบัญชี (`36` §6.1/§7) */
export interface AccountantQuestionDto {
  id: string
  periodId: string
  periodLabel: string
  questionText: string
  answerText: string | null
  /** `36` §6.1 — `is_resolved=false` → `open` · `true` → `answered` */
  isResolved: boolean
  status: QuestionStatus
  statusLabel: string
  answeredByName: string | null
  answeredAt: string | null
  createdByName: string
  createdAt: string
}

export interface AccountantQuestionListDto {
  items: AccountantQuestionDto[]
  summary: QuestionSummary
}

export interface PeriodReadinessDto extends ReadinessResult {
  periodId: string
  periodLabel: string
  status: AccountingPeriodStatus
}
