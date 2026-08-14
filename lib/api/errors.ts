/**
 * ฐานของ error ประจำโมดูลธุรกิจ — **pure ล้วน ห้าม import อะไรที่แตะ Prisma/`next/headers`**
 * (โมดูลฝั่ง client เช่นตัว validate ของฟอร์มต้อง import ได้โดยไม่ลาก Prisma เข้า bundle)
 *
 * ตัวแปลง error → Response อยู่ที่ `lib/api/http.ts` (ฝั่ง server เท่านั้น)
 * code ทุกตัวต้องมีอยู่ใน `docs/24-finance-validation-rules.md` เท่านั้น (Rule 04)
 */

/** ข้อความคู่ (title/message) ภาษาไทยของ error code หนึ่งตัว */
export interface ErrorMessage {
  title: string
  message: string
}

export class ModuleError<Code extends string = string> extends Error {
  readonly code: Code
  readonly status: number
  readonly title: string
  /** ข้อความไทยที่ส่งให้ผู้ใช้ (ไม่มี prefix code เหมือน `Error.message`) */
  readonly userMessage: string
  /** รายละเอียดสำหรับ log ฝั่ง server เท่านั้น — ห้ามส่งออก response */
  readonly detail?: string
  /** ข้อมูลประกอบที่ปลอดภัยพอจะส่งให้ FE (เช่น รายชื่อบริษัทที่ผูกเทมเพลตอยู่ — `12` §11) */
  readonly context?: Record<string, unknown>

  constructor(
    code: Code,
    messages: ErrorMessage,
    status: number,
    options?: { detail?: string; context?: Record<string, unknown> },
  ) {
    super(`${code}: ${messages.message}`)
    this.name = 'ModuleError'
    this.code = code
    this.status = status
    this.title = messages.title
    this.userMessage = messages.message
    this.detail = options?.detail
    this.context = options?.context
  }
}
