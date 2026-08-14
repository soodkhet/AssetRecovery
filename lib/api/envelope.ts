/**
 * Response Envelope กลางของทุก endpoint — รูปแบบตาม `44` §15 ("Response ทุก endpoint")
 * `{ success, data, error: { code, message, field } }`
 *
 * ไฟล์นี้ **pure ล้วน** (ไม่มี Prisma/`next/*`) — ฝั่ง client import type ได้โดยไม่ลาก server เข้ามา
 *
 * ส่วนขยายที่ระบบนี้เพิ่มจากสเปคดิบ (superset — ของเดิมยังอ่านได้เหมือนเดิม):
 * - `error.title` = หัวข้อไทยของ error (ทุกหน้าจอ Phase 1 ใช้คู่กับ `message` อยู่แล้ว)
 * - `error.fields` = field errors หลายช่องพร้อมกัน (`24` §6.1 `REQUIRED_MISSING` จาก Zod)
 * - `warning` = งานสำเร็จแต่มีเรื่องต้องบอก (HTTP ยัง 2xx) เช่นส่งอีเมลคำเชิญไม่ผ่าน (`08` §14 · D1)
 */

/** งานสำเร็จแต่มีเรื่องต้องบอก — ไม่ใช่ error (`08` §14 · D1) */
export interface ApiWarning {
  code: string
  title: string
  message: string
}

export interface ApiErrorPayload {
  /** code จาก `docs/24` หรือไฟล์ต้นทางของโมดูลเท่านั้น (Rule 04 · ดู `lib/api/error-catalog.ts`) */
  code: string
  title: string
  message: string
  /** ช่องเดียวที่ผิด (`44` §15) */
  field?: string
  /** หลายช่องพร้อมกัน — คีย์ = path ของ field */
  fields?: Record<string, string>
  /**
   * ข้อมูลประกอบเฉพาะ error บางตัว แนบเป็นคีย์ระดับเดียวกัน เช่น `TEMPLATE_IN_USE` ส่ง
   * `companies: string[]` (`12` §11) — มาจาก `ModuleError.context` ที่ `toModuleErrorResponse()` กระจายลงมา
   */
  [extra: string]: unknown
}

export interface ApiSuccessEnvelope<T> {
  success: true
  data: T
  error: null
  warning?: ApiWarning
}

export interface ApiErrorEnvelope {
  success: false
  data: null
  error: ApiErrorPayload
}

export type ApiEnvelope<T> = ApiSuccessEnvelope<T> | ApiErrorEnvelope

export function successEnvelope<T>(data: T, warning?: ApiWarning): ApiSuccessEnvelope<T> {
  return warning === undefined ? { success: true, data, error: null } : { success: true, data, error: null, warning }
}

export function errorEnvelope(error: ApiErrorPayload): ApiErrorEnvelope {
  return { success: false, data: null, error }
}

/** 200 (หรือ status ที่ระบุ เช่น 201 ตอนสร้าง) + envelope สำเร็จ */
export function apiSuccess<T>(data: T, options?: { status?: number; warning?: ApiWarning }): Response {
  return Response.json(successEnvelope(data, options?.warning), { status: options?.status ?? 200 })
}

/** envelope ผิดพลาด — `status` ต้องมาจาก `lib/api/error-catalog.ts` ไม่ใช่ตั้งเอง */
export function apiFailure(error: ApiErrorPayload, status: number): Response {
  return Response.json(errorEnvelope(error), { status })
}

/**
 * อ่าน body ที่ไม่รู้ชนิดให้กลายเป็น envelope — รองรับทั้งรูปแบบใหม่และ response ของ Phase 1
 * ที่ยังเป็น `{ data }` / `{ error }` ล้วน (ยังไม่ย้ายมาใช้ `apiSuccess()`)
 */
export function readEnvelope<T>(body: unknown, httpOk: boolean): ApiEnvelope<T> {
  const shape = body as Partial<ApiSuccessEnvelope<T>> & Partial<ApiErrorEnvelope>
  const error = shape?.error
  if (error !== null && error !== undefined) return errorEnvelope(error)
  if (!httpOk) {
    return errorEnvelope({ code: 'UNKNOWN', title: 'ทำรายการไม่สำเร็จ', message: 'กรุณาลองใหม่' })
  }
  return successEnvelope(shape?.data as T, shape?.warning)
}
