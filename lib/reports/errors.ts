import { ModuleError, type ErrorMessage } from '@/lib/api/errors'

/**
 * Error code ของรายงาน (ไฟล์ 14/21/96) — เพิ่ม code ใหม่ที่นี่ได้เฉพาะที่มีใน `docs/24` แล้ว (Rule 04)
 *
 * ไฟล์ 21 §11 และ 14 §11 ระบุตรงกันว่ารายงานเป็น read-only view "ไม่มี validation"
 * ⇒ drill-down ที่ชี้ไปยังมิติที่ไม่มีข้อมูลในช่วงเวลานั้นใช้ code เดิมของ `24` §6.1
 * (`COMPANY_NOT_FOUND` / `TEAM_NOT_FOUND`)
 *
 * ไฟล์ `96` §12 เพิ่มมาอีก 4 กรณีสำหรับเมนูรายงาน — **ประกาศเป็น code จริงแค่ตัวเดียว**:
 * - `REPORT_DATE_INVALID` → ปฏิเสธคำขอจริง (400) ⇒ อยู่ในทะเบียน (`24` §6.12)
 * - `REPORT_PERMISSION_DENIED` → ใช้ `PERMISSION_DENIED` ของ `24` §6.9 ที่ `requirePermission()`
 *   โยนอยู่แล้ว ไม่ประกาศ code ซ้ำ (แนวเดียวกับที่ `32` ใช้ `COST_CENTER_NOT_FOUND` ของ `13`)
 * - `REPORT_NO_DATA` / `REPORT_CACHE_STALE` → **ไม่ใช่ error**: ทั้งคู่คือสถานะของผลลัพธ์ที่สำเร็จ
 *   (empty state / ป้าย "ข้อมูล ณ เวลา…" + ปุ่มรีเฟรช) ส่งผ่านฟิลด์ใน payload
 *   (`rows: []`, `cache.stale`) — ประกาศเป็น code จะทำให้รายชื่อ "เตือนไม่บล็อก" ที่ Rule 04
 *   ล็อกไว้ 6 ตัวเพิ่มโดยไม่มีมติ PO (เหตุผลเดียวกับ `JOB_DUPLICATE` ใน `24` v4.13)
 */

export const REPORT_ERROR_CODES = [
  'COMPANY_NOT_FOUND',
  'TEAM_NOT_FOUND',
  'REPORT_DATE_INVALID',
  'REPORT_NOT_FOUND',
] as const

export type ReportErrorCode = (typeof REPORT_ERROR_CODES)[number]

const HTTP_STATUS: Record<ReportErrorCode, number> = {
  COMPANY_NOT_FOUND: 404,
  TEAM_NOT_FOUND: 404,
  REPORT_DATE_INVALID: 400,
  REPORT_NOT_FOUND: 404,
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
  REPORT_DATE_INVALID: {
    title: 'ช่วงวันที่ไม่ถูกต้อง',
    message: 'ตรวจสอบวันเริ่มต้นและวันสิ้นสุดอีกครั้ง — วันเริ่มต้นต้องไม่อยู่หลังวันสิ้นสุด',
  },
  REPORT_NOT_FOUND: {
    title: 'ไม่พบรายงานนี้',
    message: 'รายงานที่เรียกไม่มีอยู่ในระบบ — กลับไปเลือกจากหน้ารายงานอีกครั้ง',
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
