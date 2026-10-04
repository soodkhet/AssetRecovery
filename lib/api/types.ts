import { readEnvelope, type ApiErrorPayload, type ApiWarning } from '@/lib/api/envelope'

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
 * เรียก API ของโมดูลแล้วคืนผลแบบ discriminated — **ไม่มี setState ในตัวเอง**
 * เพื่อให้เรียกจาก `useEffect` ได้โดยไม่ชนกฎ `react-hooks/set-state-in-effect` (กับดักใน REUSE_INDEX)
 */
export async function callApi<T>(input: string, init?: RequestInit): Promise<ApiCallResult<T>> {
  try {
    const response = await fetch(input, init)
    const body: unknown = await response.json()
    const envelope = readEnvelope<T>(body, response.ok)
    if (!envelope.success) {
      const { code, title, message, fields } = envelope.error
      return {
        error: {
          code,
          title,
          message: withContextSuffix(message, envelope.error),
          ...(fields === undefined ? {} : { fields }),
          payload: envelope.error,
        },
      }
    }
    return envelope.warning === undefined
      ? { data: envelope.data }
      : { data: envelope.data, warning: envelope.warning }
  } catch {
    return { error: { title: 'เชื่อมต่อระบบไม่สำเร็จ', message: 'กรุณาลองใหม่' } }
  }
}

/** ส่ง JSON body พร้อม header มาตรฐาน (POST/PATCH/DELETE ของทุกโมดูล) */
export function jsonRequest(method: 'POST' | 'PATCH' | 'DELETE', body: unknown): RequestInit {
  return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
}
