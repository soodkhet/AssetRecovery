import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * โทเคนทิ้งไฟล์ที่อัปโหลดค้าง (mytester6 T-015/T-019) — ⚠️ ฝั่ง server เท่านั้น
 *
 * `POST /api/storage/upload-url` ออกโทเคนนี้คู่กับ path ⇒ ผู้ถือโทเคนคือ**ผู้ใช้คนที่ขอ path นั้นเอง** (ผูก user id)
 * ใช้พิสูจน์ตอน `POST /api/storage/discard` ว่าลบได้เฉพาะไฟล์ที่ตัวเองอัปโหลด (Storage ไม่เก็บเจ้าของของการอัปโหลด
 * ผ่านโทเคน — service role เป็นผู้ออกโทเคน) · ยังต้องไม่มี record ใดอ้าง path นั้นอีกชั้น (`isUploadPathReferenced`)
 *
 * รูปแบบ `<iat>.<mac>` — `iat` = เวลาออก (วินาที epoch) ถูกเซ็นรวมใน HMAC · อายุ {@link UPLOAD_DISCARD_TOKEN_TTL_SECONDS}
 * (24 ชม. — ฟอร์มที่ค้างนานกว่านั้นถือว่าไฟล์เป็นของเก่า ให้งานกวาดไฟล์ค้างจัดการแทน · mytester6 รีวิว D-2/D-3)
 * โทเคนรูปแบบเดิม (ไม่มี iat) ใช้ไม่ได้แล้ว — ไม่ต้องรองรับ เพราะอยู่แค่ในหน่วยความจำของแท็บ
 *
 * กุญแจ = HMAC แยกโดเมนจาก secret ฝั่ง server (ไม่ต้องตั้ง env ใหม่) — ผู้เรียกส่ง secret เข้ามา (ทดสอบแบบ pure ได้)
 */
const DOMAIN = 'asset-recovery:upload-discard:v2'

/** อายุโทเคนทิ้งไฟล์ (วินาที) — 24 ชม. */
export const UPLOAD_DISCARD_TOKEN_TTL_SECONDS = 24 * 60 * 60

/** เผื่อนาฬิกาเหลื่อม (โทเคนที่ iat ล้ำอนาคตเกินนี้ ⇒ ไม่ผ่าน) */
const CLOCK_SKEW_SECONDS = 60

function mac(secret: string, userId: string, path: string, issuedAt: number): string {
  if (secret === '') throw new Error('upload discard secret ว่าง')
  return createHmac('sha256', secret).update(`${DOMAIN}\n${userId}\n${path}\n${issuedAt}`).digest('base64url')
}

export function uploadDiscardToken(secret: string, userId: string, path: string, nowMs: number = Date.now()): string {
  const issuedAt = Math.floor(nowMs / 1000)
  return `${issuedAt}.${mac(secret, userId, path, issuedAt)}`
}

/** เทียบแบบ constant-time — โทเคนผิดรูป/ผิดผู้ใช้/ผิด path/หมดอายุ ⇒ `false` */
export function isValidUploadDiscardToken(
  secret: string,
  userId: string,
  path: string,
  token: string,
  nowMs: number = Date.now(),
): boolean {
  const match = /^(\d{1,12})\.([A-Za-z0-9_-]+)$/.exec(token)
  if (match === null || match[1] === undefined || match[2] === undefined) return false
  const issuedAt = Number(match[1])
  const now = Math.floor(nowMs / 1000)
  if (issuedAt > now + CLOCK_SKEW_SECONDS) return false
  if (now - issuedAt > UPLOAD_DISCARD_TOKEN_TTL_SECONDS) return false
  const expected = Buffer.from(mac(secret, userId, path, issuedAt))
  const actual = Buffer.from(match[2])
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
