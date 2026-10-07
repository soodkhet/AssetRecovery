import { createClient } from '@supabase/supabase-js'
import { callApi, jsonRequest } from '@/lib/api/types'
import { CASE_DOCUMENT_BUCKET } from '@/lib/cases/document-upload'
import { getPublicEnv } from '@/lib/env-public'
import {
  STORAGE_API_PATH,
  type SignedDownloadDto,
  type SignedUploadDto,
  type UploadTarget,
} from '@/lib/uploads/targets'

/**
 * ทางเดียวที่ browser แตะ bucket `case-documents` (BUG-143 · DEC-014)
 *
 * - อัปโหลด: ขอโทเคนต่อ path จาก server (ตรวจสิทธิ์ + scope + ประกอบ path ให้) → `uploadToSignedUrl()`
 * - เปิดดู: ขอ signed URL อายุสั้นจาก server (ตรวจสิทธิ์ตามเจ้าของ path)
 *
 * ห้ามเรียก `storage.from(...).upload()` / `createSignedUrl()` ตรงจากฝั่ง client — bucket ไม่มี policy ให้
 * `authenticated` แล้ว (เทสต์ `client-storage-scan.test.ts` สแกนกันไว้)
 *
 * ⚠️ ฝั่ง browser เท่านั้น
 */

export class StorageUploadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StorageUploadError'
  }
}

/** เวลาขั้นต่ำของการอัปโหลดหนึ่งไฟล์ + ส่วนที่เพิ่มตามขนาด (คิดที่เน็ตช้าสุด ~100 KB/วินาที — สัญญาณภาคสนาม) */
const UPLOAD_BASE_TIMEOUT_MS = 120_000
const UPLOAD_MIN_BYTES_PER_SECOND = 100 * 1024

/** เวลารอสูงสุดของการอัปโหลดตามขนาดไฟล์ — เกินนี้ถือว่าค้าง (preship R2-024) */
export function uploadTimeoutMs(sizeBytes: number): number {
  return UPLOAD_BASE_TIMEOUT_MS + Math.ceil((Math.max(sizeBytes, 0) / UPLOAD_MIN_BYTES_PER_SECOND) * 1000)
}

/** ข้อความเมื่อผู้ใช้กดยกเลิกการอัปโหลดเอง */
export function uploadCancelledMessage(fileName: string): string {
  return `ยกเลิกการอัปโหลดไฟล์ ${fileName} แล้ว`
}

export interface UploadToStorageOptions {
  /** ผู้เรียกยกเลิกได้ (เช่นปุ่ม "ยกเลิก" ของ modal) — request ที่ค้างอยู่ถูก abort จริง ไม่ใช่แค่เลิกรอ (preship R3-026) */
  signal?: AbortSignal
}

/**
 * signal ของการอัปโหลดแต่ละครั้ง ผูกด้วยโทเคนที่ server ออก (โทเคนไม่ซ้ำต่อ path) — `uploadToSignedUrl()`
 * ไม่รับ signal เอง ⇒ ส่งผ่าน `fetch` ของ client ตัวอัปโหลดซึ่งหา signal จาก query `token` ของ request
 */
const uploadSignals = new Map<string, AbortSignal>()

function abortableFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  let token: string | null = null
  try {
    token = new URL(url).searchParams.get('token')
  } catch {
    token = null
  }
  const signal = token === null ? undefined : uploadSignals.get(token)
  return fetch(input, signal === undefined ? init : { ...init, signal })
}

type UploadClient = ReturnType<typeof createClient>
let uploadClient: UploadClient | null = null

/**
 * client เฉพาะงานอัปโหลดผ่านโทเคน — ไม่ถือ session (สิทธิ์อยู่ที่โทเคนที่ server ออกให้หลังตรวจสิทธิ์แล้ว
 * DEC-014) จึงไม่ไปแย่ง refresh token กับ client หลักของ Auth · ใช้ `fetch` ที่ abort ได้จริงต่อการอัปโหลด
 */
function getUploadClient(): UploadClient {
  if (uploadClient === null) {
    const env = getPublicEnv()
    uploadClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: 'asset-recovery-signed-upload',
      },
      global: { fetch: abortableFetch },
    })
  }
  return uploadClient
}

/**
 * อัปโหลดไฟล์เข้า target แล้วคืน **path** ที่ server ประกอบให้ — error มีข้อความพร้อมแสดงผู้ใช้
 *
 * - เกินเวลา ({@link uploadTimeoutMs}) ⇒ **abort request จริง** แล้ว throw ข้อความให้ลองใหม่ (R2-024 · R3-026)
 *   เดิมแค่เลิกรอ แต่การอัปโหลดเก่ายังวิ่งต่อเบื้องหลัง
 * - `options.signal` ถูก abort ⇒ ยกเลิก request ที่ค้าง แล้ว throw {@link uploadCancelledMessage}
 */
export async function uploadToStorage(target: UploadTarget, file: File, options: UploadToStorageOptions = {}): Promise<string> {
  const callerSignal = options.signal
  if (callerSignal?.aborted) throw new StorageUploadError(uploadCancelledMessage(file.name))

  const issued = await callApi<SignedUploadDto>(STORAGE_API_PATH.uploadUrl, {
    ...jsonRequest('POST', { target, fileName: file.name, sizeBytes: file.size }),
    ...(callerSignal === undefined ? {} : { signal: callerSignal }),
  })
  if (callerSignal?.aborted) throw new StorageUploadError(uploadCancelledMessage(file.name))
  if (issued.error !== undefined || issued.data === undefined) {
    throw new StorageUploadError(`อัปโหลดไฟล์ ${file.name} ไม่สำเร็จ — ${issued.error?.message ?? 'ขอสิทธิ์อัปโหลดไม่ได้'}`)
  }

  const controller = new AbortController()
  let reason: 'timeout' | 'cancelled' | null = null
  let rejectStop: (error: StorageUploadError) => void = () => undefined
  const stopped = new Promise<never>((_resolve, reject) => {
    rejectStop = reject
  })
  const stop = (why: 'timeout' | 'cancelled') => {
    if (reason !== null) return
    reason = why
    controller.abort()
    rejectStop(
      new StorageUploadError(
        why === 'timeout'
          ? `อัปโหลดไฟล์ ${file.name} ใช้เวลานานเกินไป — ตรวจสอบสัญญาณอินเทอร์เน็ตแล้วลองใหม่`
          : uploadCancelledMessage(file.name),
      ),
    )
  }
  const onCallerAbort = () => stop('cancelled')
  const timer = setTimeout(() => stop('timeout'), uploadTimeoutMs(file.size))
  callerSignal?.addEventListener('abort', onCallerAbort)
  const { path, token } = issued.data
  uploadSignals.set(token, controller.signal)

  try {
    const uploaded = await Promise.race([
      getUploadClient()
        .storage.from(CASE_DOCUMENT_BUCKET)
        .uploadToSignedUrl(path, token, file, { contentType: file.type === '' ? undefined : file.type }),
      stopped,
    ])
    if (uploaded.error !== null) {
      throw new StorageUploadError(`อัปโหลดไฟล์ ${file.name} ไม่สำเร็จ — ${uploaded.error.message}`)
    }
    return path
  } finally {
    clearTimeout(timer)
    callerSignal?.removeEventListener('abort', onCallerAbort)
    uploadSignals.delete(token)
    // กัน unhandled rejection ของ promise ที่ไม่ได้ใช้แล้ว
    stopped.catch(() => undefined)
  }
}

/**
 * signed URL ชั่วคราวสำหรับเปิดดูไฟล์ที่แนบไว้ — คืน `null` เมื่อไม่มีสิทธิ์/ไม่พบไฟล์
 * ลิงก์ภายนอก (`http(s)://`) ส่งคืนตามเดิม (ไม่ใช่ไฟล์ใน bucket)
 */
export async function signedFileUrl(fileUrl: string): Promise<string | null> {
  if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) return fileUrl
  const signed = await callApi<SignedDownloadDto>(STORAGE_API_PATH.downloadUrl, jsonRequest('POST', { path: fileUrl }))
  return signed.error === undefined && signed.data !== undefined ? signed.data.url : null
}
