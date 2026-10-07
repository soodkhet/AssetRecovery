import { DEFAULT_API_TIMEOUT_MS } from '@/lib/api/types'

/** คำขอเกินเวลา — แยกจาก network error ได้ (ข้อความต่างกัน: "ระบบตอบช้า" vs "ตรวจอินเทอร์เน็ต") */
export class FetchTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`request timed out after ${timeoutMs}ms`)
    this.name = 'FetchTimeoutError'
  }
}

/**
 * `fetch` ที่มี timeout — ใช้กับจุดที่ต้องได้ `Response` ดิบ (ดาวน์โหลดไฟล์/blob, login ที่อ่าน cookie)
 * ที่เรียก `callApi()` ไม่ได้ · เกินเวลา ⇒ throw {@link FetchTimeoutError} (preship R2-017 — เดิมหมุนไม่จบเมื่อ server ค้าง)
 * `init.signal` ของผู้เรียกยังยกเลิกได้ตามเดิม
 */
export async function fetchWithTimeout(
  input: string,
  init?: RequestInit,
  timeoutMs: number = DEFAULT_API_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const callerSignal = init?.signal ?? null
  const forwardAbort = () => controller.abort()
  if (callerSignal?.aborted) controller.abort()
  callerSignal?.addEventListener('abort', forwardAbort)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (error) {
    if (timedOut) throw new FetchTimeoutError(timeoutMs)
    throw error
  } finally {
    clearTimeout(timer)
    callerSignal?.removeEventListener('abort', forwardAbort)
  }
}
