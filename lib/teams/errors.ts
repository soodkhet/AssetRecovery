import { ModuleError, type ErrorMessage } from '@/lib/api/errors'

/**
 * Error code หมวดทีม (ไฟล์ 09) — SSOT อยู่ที่ `docs/24-finance-validation-rules.md` §6.1
 * ⚠️ ห้ามตั้ง code ใหม่ที่นี่โดยไม่เพิ่มลงไฟล์ 24 ใน commit เดียวกัน (Rule 04)
 */

export const TEAM_ERROR_CODES = [
  'TEAM_NOT_FOUND',
  'DUPLICATE_TEAM_NAME',
  'TEAM_HAS_ACTIVE_CASES',
  'SUPERVISOR_ALREADY_ASSIGNED',
  'INVALID_TEAM_MEMBER',
  'INVALID_PROVINCE',
  'PLAN_NOT_FOUND',
] as const

export type TeamErrorCode = (typeof TEAM_ERROR_CODES)[number]

/** 400 = ผิดกติกาข้อมูล/สถานะ · 404 = ไม่พบเป้าหมาย (ไม่ leak ว่ามี record นี้ในองค์กรอื่นไหม) */
const HTTP_STATUS: Record<TeamErrorCode, number> = {
  TEAM_NOT_FOUND: 404,
  DUPLICATE_TEAM_NAME: 400,
  TEAM_HAS_ACTIVE_CASES: 400,
  SUPERVISOR_ALREADY_ASSIGNED: 400,
  INVALID_TEAM_MEMBER: 400,
  INVALID_PROVINCE: 400,
  PLAN_NOT_FOUND: 404,
}

const MESSAGES: Record<TeamErrorCode, ErrorMessage> = {
  TEAM_NOT_FOUND: {
    title: 'ไม่พบทีม',
    message: 'ไม่พบทีมที่ระบุ หรือทีมนี้ถูกลบไปแล้ว',
  },
  DUPLICATE_TEAM_NAME: {
    title: 'ชื่อทีมซ้ำ',
    message: 'มีทีมชื่อนี้อยู่แล้วในองค์กร — ใช้ชื่ออื่น',
  },
  TEAM_HAS_ACTIVE_CASES: {
    title: 'ปิดทีมที่ยังมีเคสค้างไม่ได้',
    message: 'ทีมนี้ยังมีเคสที่ยังไม่ปิด — ย้ายเคสไปทีมอื่นให้หมดก่อนจึงจะปิดใช้งานทีมได้',
  },
  SUPERVISOR_ALREADY_ASSIGNED: {
    title: 'หัวหน้าทีมสังกัดทีมอื่นอยู่แล้ว',
    message: 'หัวหน้าทีมติดตามทรัพย์ 1 คนสังกัดได้ทีมเดียวเท่านั้น — ถอดออกจากทีมเดิมก่อน (ผู้จัดการดูแลได้หลายทีม)',
  },
  INVALID_TEAM_MEMBER: {
    title: 'ผู้ใช้ที่เลือกใช้กับทีมไม่ได้',
    message: 'ผู้จัดการ/หัวหน้าทีมต้องเป็นผู้ใช้ที่ยัง active และอยู่ในกลุ่ม Inhouse หรือ Outsource เท่านั้น',
  },
  INVALID_PROVINCE: {
    title: 'จังหวัดไม่ถูกต้อง',
    message: 'มีจังหวัดที่ไม่อยู่ในรายการพื้นที่ให้บริการ',
  },
  PLAN_NOT_FOUND: {
    title: 'ไม่พบแผนค่าตอบแทน',
    message: 'ไม่พบแผนค่าตอบแทนที่เลือก หรือแผนนั้นถูกปิดใช้งานไปแล้ว — ทุกทีมต้องผูกแผนที่ใช้งานอยู่เสมอ (`09` §7)',
  },
}

export function teamErrorStatus(code: TeamErrorCode): number {
  return HTTP_STATUS[code]
}

export function teamErrorMessage(code: TeamErrorCode): ErrorMessage {
  return MESSAGES[code]
}

export class TeamError extends ModuleError<TeamErrorCode> {
  constructor(code: TeamErrorCode, options?: { detail?: string; context?: Record<string, unknown> }) {
    super(code, MESSAGES[code], HTTP_STATUS[code], options)
    this.name = 'TeamError'
  }
}

export function isTeamError(error: unknown): error is TeamError {
  return error instanceof TeamError
}
