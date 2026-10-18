import { createHash } from 'node:crypto'
import { createSupabaseAdminClient } from '@/lib/supabase/server'

/**
 * ที่เก็บไฟล์โอนเงิน (ไฟล์ 17) — Supabase Storage **bucket private** `payment-files`
 *
 * ⚠️ ต้องสร้าง bucket `payment-files` (private) ไว้ก่อน **1 ครั้งต่อ environment** เหมือน
 *    `case-documents` ของ 2.5 — ไม่มี bucket = สร้างไฟล์โอนไม่ผ่านและขึ้นข้อความบอกให้สร้างก่อน
 * ⚠️ **ห้าม overwrite ไฟล์เดิมเด็ดขาด** (`upsert: false` + path เดินเวอร์ชัน — Rule 04 idempotency):
 *    ไฟล์โอนที่ส่งเข้าธนาคารไปแล้วต้องเก็บไว้ตรวจย้อนหลังได้เสมอ
 * ⚠️ ดาวน์โหลดผ่าน endpoint ของเราเอง (`GET /api/payout-batches/:id/payment-file`) ไม่แจก signed URL
 *    ให้ browser — ไฟล์โอนคือข้อมูลบัญชีธนาคารทั้งรอบ ต้องผ่าน `requirePermission()` ทุกครั้ง
 */

export const PAYMENT_FILE_BUCKET = 'payment-files'

export class PaymentFileStorageError extends Error {
  /** `true` = path นี้มีไฟล์อยู่แล้ว (`upsert: false` ปฏิเสธ) — อีกคำขอสร้างเวอร์ชันเดียวกันไปก่อน (mytester7 S7-AG3-04) */
  readonly alreadyExists: boolean

  constructor(message: string, options?: { alreadyExists?: boolean }) {
    super(message)
    this.name = 'PaymentFileStorageError'
    this.alreadyExists = options?.alreadyExists ?? false
  }
}

/**
 * Supabase Storage ตอบ "มีไฟล์อยู่แล้ว" ได้หลายรูป (HTTP 409 · `statusCode: '409'` · ข้อความ "already exists"/"Duplicate")
 * ⇒ รวมการตรวจไว้จุดเดียว
 */
export function isStorageAlreadyExistsError(error: {
  message?: string
  status?: unknown
  statusCode?: unknown
  error?: unknown
}): boolean {
  if (error.status === 409 || error.statusCode === '409' || error.statusCode === 409) return true
  if (error.error === 'Duplicate') return true
  return /already exists|duplicate/i.test(error.message ?? '')
}

/** SHA-256 (hex) ของไฟล์ที่สร้าง — ลง audit เพื่อยืนยันว่าไฟล์ที่อัปโหลดเข้าธนาคารคือไฟล์เดียวกัน */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export async function uploadPaymentFile(input: {
  path: string
  bytes: Uint8Array
  contentType: string
}): Promise<void> {
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.storage.from(PAYMENT_FILE_BUCKET).upload(input.path, input.bytes, {
    contentType: input.contentType,
    upsert: false,
  })
  if (error !== null) {
    throw new PaymentFileStorageError(
      `อัปโหลดไฟล์โอนเงินไม่สำเร็จ — ${error.message} (ตรวจว่าสร้าง bucket "${PAYMENT_FILE_BUCKET}" แบบ private ไว้แล้วหรือยัง)`,
      { alreadyExists: isStorageAlreadyExistsError(error) },
    )
  }
}

export async function downloadPaymentFile(path: string): Promise<Uint8Array> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.storage.from(PAYMENT_FILE_BUCKET).download(path)
  if (error !== null || data === null) {
    throw new PaymentFileStorageError(`อ่านไฟล์โอนเงินไม่สำเร็จ — ${error?.message ?? 'ไม่พบไฟล์'}`)
  }
  return new Uint8Array(await data.arrayBuffer())
}
