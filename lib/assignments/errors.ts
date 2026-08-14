import { ModuleError, type ErrorMessage } from '@/lib/api/errors'

/**
 * Error code หมวดมอบหมายงาน (ไฟล์ 40 §12) — SSOT อยู่ที่ `docs/40-case-assignment-routing.md` §12
 * (+ `24` §6.1 สำหรับ code กลางที่โมดูลอื่นใช้ร่วม เช่น `TEAM_NOT_FOUND`)
 *
 * ⚠️ Rule 04: ห้ามตั้ง code ใหม่ที่นี่โดยไม่เพิ่มลง `40` §12 + `lib/api/error-catalog.ts` ในคอมมิตเดียวกัน
 * code ที่เติมเข้า `40` §12 พร้อมงาน Phase 2.6: `ASSIGNMENT_NOT_FOUND`, `ASSIGNMENT_INVALID_STATUS`
 *
 * `PERMISSION_DENIED` (§12 แถวที่ 5) ใช้ `AuthError` ตัวเดิม — ไม่ประกาศซ้ำที่นี่
 *
 * **pure ล้วน** — ห้าม import อะไรที่แตะ Prisma (ฝั่ง client เรียกตัว assert ชุดเดียวกัน)
 */

export const ASSIGNMENT_ERROR_CODES = [
  'ASSIGNMENT_TEAM_MISMATCH',
  'ASSIGNMENT_ALREADY_EXISTS',
  'ASSIGNMENT_REASON_REQUIRED',
  'ASSIGNMENT_NOT_FOUND',
  'ASSIGNMENT_INVALID_STATUS',
  'REASSIGNMENT_ALREADY_PENDING',
  'REASSIGNMENT_ALREADY_TIMED_OUT',
  'DECLINE_REASON_REQUIRED',
  'CASE_NOT_FOUND',
  'TEAM_NOT_FOUND',
] as const

export type AssignmentErrorCode = (typeof ASSIGNMENT_ERROR_CODES)[number]

/** 404 = ไม่พบเป้าหมาย (ไม่ leak ว่ามี record นี้ในทีม/องค์กรอื่นไหม) · 400 = ผิดกติกาการมอบหมาย */
const HTTP_STATUS: Record<AssignmentErrorCode, number> = {
  ASSIGNMENT_TEAM_MISMATCH: 400,
  ASSIGNMENT_ALREADY_EXISTS: 400,
  ASSIGNMENT_REASON_REQUIRED: 400,
  ASSIGNMENT_NOT_FOUND: 404,
  ASSIGNMENT_INVALID_STATUS: 400,
  REASSIGNMENT_ALREADY_PENDING: 400,
  REASSIGNMENT_ALREADY_TIMED_OUT: 400,
  DECLINE_REASON_REQUIRED: 400,
  CASE_NOT_FOUND: 404,
  TEAM_NOT_FOUND: 404,
}

const MESSAGES: Record<AssignmentErrorCode, ErrorMessage> = {
  ASSIGNMENT_TEAM_MISMATCH: {
    title: 'พนักงานไม่ได้อยู่ในทีมของเคสนี้',
    message: 'เลือกได้เฉพาะพนักงานที่เป็นสมาชิกทีมที่ผูกกับเคสนี้เท่านั้น (`40` §11)',
  },
  ASSIGNMENT_ALREADY_EXISTS: {
    title: 'เคสนี้มีผู้รับผิดชอบอยู่แล้ว',
    message: 'ต้องใช้ "เปลี่ยนผู้รับผิดชอบ" แทนการมอบหมายใหม่ (`40` §12)',
  },
  ASSIGNMENT_REASON_REQUIRED: {
    title: 'ต้องระบุเหตุผล',
    message: 'การเปลี่ยนผู้รับผิดชอบต้องระบุเหตุผลทุกครั้ง ไม่ว่าพนักงานจะกดรับงานแล้วหรือยัง (`40` §12)',
  },
  ASSIGNMENT_NOT_FOUND: {
    title: 'ยังไม่มีการมอบหมายสำหรับเคสนี้',
    message: 'ไม่พบการมอบหมายที่ยังใช้งานอยู่ของเคสนี้ — ต้องมอบหมายก่อนจึงจะเปลี่ยน/รับงานได้ (`40` §10)',
  },
  ASSIGNMENT_INVALID_STATUS: {
    title: 'สถานะการมอบหมายไม่รองรับการกระทำนี้',
    message: 'ตรวจสอบสถานะล่าสุดของการมอบหมายแล้วลองใหม่ (`40` §10)',
  },
  REASSIGNMENT_ALREADY_PENDING: {
    title: 'มีคำขอเปลี่ยนผู้รับผิดชอบค้างอยู่',
    message: 'ต้องรอให้คำขอเดิมได้ข้อสรุป (ยินยอม/ไม่ยินยอม/หมดเวลา) ก่อนส่งคำขอใหม่ (`40` §12)',
  },
  REASSIGNMENT_ALREADY_TIMED_OUT: {
    title: 'คำขอนี้หมดเวลาไปแล้ว',
    message: 'ระบบเปลี่ยนผู้รับผิดชอบอัตโนมัติไปแล้วเมื่อครบกำหนด — ไม่รับการตอบที่มาช้า (`40` §12)',
  },
  DECLINE_REASON_REQUIRED: {
    title: 'ต้องระบุเหตุผลที่ไม่ยินยอม',
    message: 'การปฏิเสธคำขอเปลี่ยนผู้รับผิดชอบต้องระบุเหตุผลเสมอ (`40` §12)',
  },
  CASE_NOT_FOUND: {
    title: 'ไม่พบเคส',
    message: 'ไม่พบเคสที่ระบุ หรือเคสนี้อยู่นอกขอบเขตข้อมูลของคุณ',
  },
  TEAM_NOT_FOUND: {
    title: 'ไม่พบทีม',
    message: 'ไม่พบทีมที่ระบุ หรือทีมนี้อยู่นอกขอบเขตข้อมูลของคุณ (`09` §7)',
  },
}

export function assignmentErrorStatus(code: AssignmentErrorCode): number {
  return HTTP_STATUS[code]
}

export function assignmentErrorMessage(code: AssignmentErrorCode): ErrorMessage {
  return MESSAGES[code]
}

export class AssignmentError extends ModuleError<AssignmentErrorCode> {
  constructor(code: AssignmentErrorCode, options?: { detail?: string; context?: Record<string, unknown> }) {
    super(code, MESSAGES[code], HTTP_STATUS[code], options)
    this.name = 'AssignmentError'
  }
}
