import { ModuleError, type ErrorMessage } from '@/lib/api/errors'

/**
 * Error code ของรายงาน (ไฟล์ 14/21) — **ไม่มี code ใหม่ของตัวเอง** (Rule 04)
 *
 * ไฟล์ 21 §11 และ 14 §11 ระบุตรงกันว่ารายงานเป็น read-only view "ไม่มี validation"
 * ⇒ ที่เหลือมีแค่กรณีเดียว: drill-down ชี้ไปยังมิติที่ไม่มีข้อมูลในช่วงเวลานั้น
 * ซึ่งใช้ code ที่มีอยู่แล้วใน `24` §6.1 (`COMPANY_NOT_FOUND` / `TEAM_NOT_FOUND`)
 * ห้ามตั้งชื่อใหม่ที่นี่โดยไม่แก้ `docs/24` ในคอมมิตเดียวกัน
 */

export const REPORT_ERROR_CODES = ['COMPANY_NOT_FOUND', 'TEAM_NOT_FOUND'] as const

export type ReportErrorCode = (typeof REPORT_ERROR_CODES)[number]

const HTTP_STATUS: Record<ReportErrorCode, number> = {
  COMPANY_NOT_FOUND: 404,
  TEAM_NOT_FOUND: 404,
}

const MESSAGES: Record<ReportErrorCode, ErrorMessage> = {
  COMPANY_NOT_FOUND: {
    title: 'ไม่พบข้อมูลของบริษัทนี้ในรายงาน',
    message: 'บริษัทที่เลือกไม่มีรายได้หรือต้นทุนในช่วงเวลานี้ — ลองเปลี่ยนช่วงเวลาแล้วดูใหม่',
  },
  TEAM_NOT_FOUND: {
    title: 'ไม่พบข้อมูลของทีมนี้ในรายงาน',
    message: 'ทีมที่เลือกไม่มีรายได้หรือต้นทุนในช่วงเวลานี้ — ลองเปลี่ยนช่วงเวลาแล้วดูใหม่',
  },
}

export function reportErrorStatus(code: ReportErrorCode): number {
  return HTTP_STATUS[code]
}

export function reportErrorMessage(code: ReportErrorCode): ErrorMessage {
  return MESSAGES[code]
}

export class ReportError extends ModuleError<ReportErrorCode> {
  constructor(code: ReportErrorCode, options?: { detail?: string; context?: Record<string, unknown> }) {
    super(code, MESSAGES[code], HTTP_STATUS[code], options)
    this.name = 'ReportError'
  }
}

export function isReportError(error: unknown): error is ReportError {
  return error instanceof ReportError
}
