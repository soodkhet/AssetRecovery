/**
 * Response envelope ชั่วคราวของ Phase 1 — **pure type ล้วน** (import เข้าไฟล์ `'use client'` ได้)
 * TODO(Phase 2.1): ย้ายไป envelope กลางของไฟล์ `45` เมื่อ API Contract Infra พร้อม
 */

export interface ApiData<T> {
  data: T
  /**
   * งานที่ "สำเร็จแต่มีเรื่องต้องบอก" — ไม่ใช่ error (HTTP ยัง 2xx) เช่น สร้างผู้ใช้สำเร็จ
   * แต่ส่งอีเมลคำเชิญไม่ผ่าน (`08` §14 · D1) · FE แสดงเป็น toast โทนเตือน
   */
  warning?: { code: string; title: string; message: string }
}

export interface ApiErrorBody {
  error: {
    code: string
    title: string
    message: string
    fields?: Record<string, string>
    /** ข้อมูลประกอบเฉพาะ error บางตัว เช่น `TEMPLATE_IN_USE` ส่งรายชื่อบริษัทกลับมา (`12` §11) */
    companies?: string[]
    teamCount?: number
  }
}

export interface ApiCallResult<T> {
  data?: T
  warning?: { code: string; title: string; message: string }
  error?: { title: string; message: string }
}

function toErrorMessage(body: unknown): { title: string; message: string } {
  const error = (body as ApiErrorBody | undefined)?.error
  if (error === undefined) return { title: 'ทำรายการไม่สำเร็จ', message: 'กรุณาลองใหม่' }
  const companies = error.companies
  const suffix = companies !== undefined && companies.length > 0 ? ` (${companies.join(', ')})` : ''
  return { title: error.title, message: `${error.message}${suffix}` }
}

/**
 * เรียก API ของโมดูลแล้วคืนผลแบบ discriminated — **ไม่มี setState ในตัวเอง**
 * เพื่อให้เรียกจาก `useEffect` ได้โดยไม่ชนกฎ `react-hooks/set-state-in-effect` (กับดักใน REUSE_INDEX)
 */
export async function callApi<T>(input: string, init?: RequestInit): Promise<ApiCallResult<T>> {
  try {
    const response = await fetch(input, init)
    const body: unknown = await response.json()
    if (!response.ok) return { error: toErrorMessage(body) }
    const payload = body as ApiData<T>
    return payload.warning === undefined ? { data: payload.data } : { data: payload.data, warning: payload.warning }
  } catch {
    return { error: { title: 'เชื่อมต่อระบบไม่สำเร็จ', message: 'กรุณาลองใหม่' } }
  }
}

/** ส่ง JSON body พร้อม header มาตรฐาน (POST/PATCH/DELETE ของทุกโมดูล) */
export function jsonRequest(method: 'POST' | 'PATCH' | 'DELETE', body: unknown): RequestInit {
  return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
}
