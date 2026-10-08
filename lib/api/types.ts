import { readEnvelope, type ApiErrorPayload, type ApiWarning } from '@/lib/api/envelope'
import { announceSessionExpired, isSessionLost } from '@/lib/api/session-expiry'

/**
 * ตัวเรียก API ฝั่ง client — **pure type + fetch ล้วน** (import เข้าไฟล์ `'use client'` ได้)
 *
 * รูปแบบ envelope กลางอยู่ที่ `lib/api/envelope.ts` (Phase 2.1 · ตาม `44` §15) —
 * ตัวนี้อ่านได้ทั้ง envelope ใหม่ (`{success, data, error}`) และ response ของ Phase 1 ที่ยังเป็น
 * `{ data }` / `{ error }` ล้วน จึงไม่ต้องแก้หน้าจอเดิมพร้อมกันทั้งหมด
 */

export type { ApiWarning }

/** @deprecated ใช้ `ApiEnvelope` จาก `lib/api/envelope.ts` — เหลือไว้ให้หน้าจอ Phase 1 ที่ยังอ่าน body ดิบเอง */
export interface ApiData<T> {
  data: T
  warning?: ApiWarning
}

/** @deprecated ใช้ `ApiEnvelope` จาก `lib/api/envelope.ts` */
export interface ApiErrorBody {
  error: ApiErrorPayload
}

/**
 * error ที่หน้าจอใช้ได้จริง — นอกจากข้อความยังต้องมี `code`/`fields` เพื่อทำ inline error
 * และ `payload` ดิบสำหรับ error ที่แนบข้อมูลประกอบมา (เช่น `CASE_REF_DUPLICATE` ส่ง `existingCase`
 * ให้ลิงก์ไปเคสเดิมได้ตาม `38` §7.3) — โครง `{title, message}` เดิมยังอยู่ครบ หน้าจอเก่าไม่ต้องแก้
 */
export interface ApiCallError {
  code?: string
  title: string
  message: string
  fields?: Record<string, string>
  payload?: ApiErrorPayload
}

export interface ApiCallResult<T> {
  data?: T
  warning?: ApiWarning
  error?: ApiCallError
}

/** คีย์ข้อมูลประกอบที่เป็นรายชื่อ (string[]) และควรต่อท้ายข้อความให้ผู้ใช้เห็น */
const CONTEXT_NAME_KEYS = ['companies', 'payees'] as const

/**
 * ต่อท้ายรายชื่อที่ error บางตัวส่งมา เช่นบริษัทของ `TEMPLATE_IN_USE` (`12` §11) หรือผู้รับเงินที่ยัง
 * ไม่ยืนยันของ `UNVERIFIED_PAYEE_IN_PAYOUT` (`17` §11 · BUG-110) — รับเฉพาะ string ล้วน (รายการที่เป็น object ไม่ต่อ)
 */
export function withContextSuffix(message: string, payload: Partial<Record<string, unknown>>): string {
  for (const key of CONTEXT_NAME_KEYS) {
    const value = payload[key]
    if (!Array.isArray(value)) continue
    const names = value.filter((name): name is string => typeof name === 'string' && name.length > 0)
    if (names.length > 0) return `${message} (${names.join(', ')})`
  }
  return message
}

/**
 * ชื่อช่องภาษาไทยของ key ที่พบบ่อยใน schema — ใช้เติมหน้าข้อความ error กลางของ Zod ที่ไม่บอกชื่อช่อง
 * (เช่น `ยาวเกิน 1,000 ตัวอักษร`) ให้ผู้ใช้รู้ว่าช่องไหน (preship R3-012) · key ที่ไม่อยู่ในรายการคงข้อความเดิม
 */
const FIELD_MESSAGE_LABELS: Readonly<Record<string, string>> = {
  note: 'หมายเหตุ',
  reason: 'เหตุผล',
  rejectionReason: 'เหตุผลที่ปฏิเสธ',
  rejectReason: 'เหตุผลที่ไม่รับ',
  declineReason: 'เหตุผลที่ไม่ยินยอม',
  teamChangeReason: 'เหตุผลที่ย้ายทีม',
  failReasonDetail: 'รายละเอียดเหตุผล',
  editNote: 'หมายเหตุการแก้ไข',
  matchNote: 'หมายเหตุการจับคู่',
  resolutionNote: 'หมายเหตุการแก้ไขปัญหา',
  purpose: 'วัตถุประสงค์',
  description: 'รายละเอียด',
  detail: 'รายละเอียด',
  questionText: 'คำถาม',
  answerText: 'คำตอบ',
  title: 'หัวข้อ',
  name: 'ชื่อ',
}

/** ข้อความกลางของ Zod (`lib/validation/zod-thai.ts` · `userFacingIssueMessage`) — ไม่มีชื่อช่องในตัว */
const GENERIC_FIELD_MESSAGE =
  /^(ยาวเกิน|ต้องมีอย่างน้อย|ต้องไม่เกิน|ต้องไม่น้อยกว่า|ต้องน้อยกว่า|ต้องมากกว่า|ต้องเป็นตัวเลข|กรุณากรอกข้อมูลช่องนี้|กรุณาระบุข้อมูลช่องนี้|รูปแบบข้อมูลไม่ถูกต้อง|เลือกได้ไม่เกิน|ต้องเลือกอย่างน้อย|ค่าต้อง)/

/** `contacts.0.note` ⇒ ใช้ส่วนท้ายที่ไม่ใช่ตัวเลข (`note`) หาชื่อช่อง */
export function labelFieldMessage(key: string, text: string): string {
  if (!GENERIC_FIELD_MESSAGE.test(text)) return text
  const segment = key.split('.').filter((part) => !/^\d+$/.test(part)).pop() ?? key
  const label = FIELD_MESSAGE_LABELS[segment]
  return label === undefined ? text : `${label}: ${text}`
}

/**
 * ต่อข้อความ error รายช่องท้าย message — preship R3-012
 * หลายหน้าจอแสดงแค่ title+message ใน toast/InlineAlert ไม่ได้ map `fields` ลงใต้ช่อง ⇒ ผู้ใช้ถูกบอกให้
 * "ตรวจช่องที่มีข้อความแจ้งเตือน" ที่ไม่มีอยู่จริง · แสดงไม่เกิน 3 ข้อ (ที่เหลือบอกจำนวน)
 */
export function withFieldsSuffix(message: string, fields: Record<string, string> | undefined): string {
  const messages = [
    ...new Set(
      Object.entries(fields ?? {})
        .filter(([, text]) => typeof text === 'string' && text.trim() !== '')
        .map(([key, text]) => labelFieldMessage(key, text)),
    ),
  ]
  if (messages.length === 0) return message
  const shown = messages.slice(0, 3).join(' · ')
  const more = messages.length > 3 ? ` และอีก ${messages.length - 3} ข้อ` : ''
  return `${message} — ${shown}${more}`
}

/** เวลารอสูงสุดของคำขอหนึ่งครั้ง — เกินแล้วหยุดรอและบอกผู้ใช้ (preship PS-007) · งานยาว (PDF/export) ส่งค่าเองได้ */
export const DEFAULT_API_TIMEOUT_MS = 60_000

export interface CallApiOptions {
  timeoutMs?: number
}

type FailureKind = 'timeout' | 'network' | 'server' | 'client' | 'invalid_response'

/**
 * ข้อความเมื่อเรียก API ไม่สำเร็จโดยไม่มี error envelope จาก server (preship PS-006/PS-007)
 * แยก "เน็ตหลุด" ออกจาก "ระบบขัดข้อง" — เดิมรวมเป็น "เชื่อมต่อระบบไม่สำเร็จ" ทั้งหมด ผู้ใช้ไปตรวจ Wi-Fi ทั้งที่ระบบล่ม
 * คำขอที่เขียนข้อมูล (ไม่ใช่ GET) อาจสำเร็จที่ server แล้วแต่คำตอบหาย ⇒ เตือนให้ตรวจรายการก่อนส่งซ้ำ (PS-003)
 */
export function describeApiFailure(kind: FailureKind, method: string, status?: number): ApiCallError {
  const mutating = method.toUpperCase() !== 'GET'
  const checkFirst = mutating ? ' — ถ้ากดบันทึกไปแล้ว ให้ตรวจในรายการก่อนส่งซ้ำ' : ''
  switch (kind) {
    case 'timeout':
      return { title: 'ระบบตอบช้าเกินไป', message: `รอนานเกินกำหนดจึงหยุดรอ กรุณาลองใหม่${checkFirst}` }
    case 'network':
      return { title: 'เชื่อมต่อระบบไม่สำเร็จ', message: `ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่${checkFirst}` }
    case 'server':
      return {
        title: 'ระบบขัดข้องชั่วคราว',
        message: `ระบบทำรายการไม่สำเร็จ (HTTP ${status ?? 500}) กรุณาลองใหม่ — ถ้ายังไม่ได้ให้แจ้งผู้ดูแลระบบ`,
      }
    case 'client':
      return { title: 'ทำรายการไม่สำเร็จ', message: `ระบบปฏิเสธคำขอ (HTTP ${status ?? 400}) กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง` }
    case 'invalid_response':
      return { title: 'ข้อมูลตอบกลับไม่ถูกต้อง', message: 'กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง' }
  }
}

/**
 * เรียก API ของโมดูลแล้วคืนผลแบบ discriminated — **ไม่มี setState ในตัวเอง**
 * เพื่อให้เรียกจาก `useEffect` ได้โดยไม่ชนกฎ `react-hooks/set-state-in-effect` (กับดักใน REUSE_INDEX)
 * มี timeout ในตัว ({@link DEFAULT_API_TIMEOUT_MS}) · `init.signal` ของผู้เรียก (เช่นยกเลิกตอน unmount) ยังใช้ได้ตามเดิม
 */
export async function callApi<T>(input: string, init?: RequestInit, options?: CallApiOptions): Promise<ApiCallResult<T>> {
  const method = init?.method ?? 'GET'
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, options?.timeoutMs ?? DEFAULT_API_TIMEOUT_MS)
  const callerSignal = init?.signal ?? null
  const forwardAbort = () => controller.abort()
  if (callerSignal?.aborted) controller.abort()
  callerSignal?.addEventListener('abort', forwardAbort)

  try {
    let response: Response
    try {
      response = await fetch(input, { ...init, signal: controller.signal })
    } catch {
      return { error: describeApiFailure(timedOut ? 'timeout' : 'network', method) }
    }

    let body: unknown
    try {
      body = await response.json()
    } catch {
      // ไม่มี envelope (เช่น 502/504 จาก proxy) — บอกตามสถานะจริง ไม่ใช่ "เชื่อมต่อไม่สำเร็จ"
      if (timedOut) return { error: describeApiFailure('timeout', method) }
      if (response.status >= 500) return { error: describeApiFailure('server', method, response.status) }
      if (!response.ok) return { error: describeApiFailure('client', method, response.status) }
      return { error: describeApiFailure('invalid_response', method) }
    }

    const envelope = readEnvelope<T>(body, response.ok)
    if (!envelope.success) {
      const { code, title, message, fields } = envelope.error
      // session หมดระหว่างใช้งาน ⇒ shell เปิดกล่องพาไปเข้าสู่ระบบ (preship R8-009) — ผู้เรียกยังได้ error ตามเดิม
      if (isSessionLost(response.status, code)) announceSessionExpired()
      return {
        error: {
          code,
          title,
          message: withFieldsSuffix(withContextSuffix(message, envelope.error), fields),
          ...(fields === undefined ? {} : { fields }),
          payload: envelope.error,
        },
      }
    }
    return envelope.warning === undefined
      ? { data: envelope.data }
      : { data: envelope.data, warning: envelope.warning }
  } finally {
    clearTimeout(timer)
    callerSignal?.removeEventListener('abort', forwardAbort)
  }
}

/** ส่ง JSON body พร้อม header มาตรฐาน (POST/PATCH/DELETE ของทุกโมดูล) */
export function jsonRequest(method: 'POST' | 'PATCH' | 'DELETE', body: unknown): RequestInit {
  return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
}
