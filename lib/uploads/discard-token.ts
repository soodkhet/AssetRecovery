import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * โทเคนทิ้งไฟล์ที่อัปโหลดค้าง (mytester6 T-015/T-019) — ⚠️ ฝั่ง server เท่านั้น
 *
 * `POST /api/storage/upload-url` ออกโทเคนนี้คู่กับ path ⇒ ผู้ถือโทเคนคือ**ผู้ใช้คนที่ขอ path นั้นเอง** (ผูก user id)
 * ใช้พิสูจน์ตอน `POST /api/storage/discard` ว่าลบได้เฉพาะไฟล์ที่ตัวเองอัปโหลด (Storage ไม่เก็บเจ้าของของการอัปโหลด
 * ผ่านโทเคน — service role เป็นผู้ออกโทเคน) · ยังต้องไม่มี record ใดอ้าง path นั้นอีกชั้น (`isUploadPathReferenced`)
 * · ไม่มีวันหมดอายุในตัว: ไฟล์ที่ผูกเข้า record แล้วลบไม่ได้อยู่ดี
 *
 * กุญแจ = HMAC แยกโดเมนจาก secret ฝั่ง server (ไม่ต้องตั้ง env ใหม่) — ผู้เรียกส่ง secret เข้ามา (ทดสอบแบบ pure ได้)
 */
const DOMAIN = 'asset-recovery:upload-discard:v1'

export function uploadDiscardToken(secret: string, userId: string, path: string): string {
  if (secret === '') throw new Error('upload discard secret ว่าง')
  return createHmac('sha256', secret).update(`${DOMAIN}\n${userId}\n${path}`).digest('base64url')
}

/** เทียบแบบ constant-time — โทเคนผิดรูป/ผิดผู้ใช้/ผิด path ⇒ `false` */
export function isValidUploadDiscardToken(secret: string, userId: string, path: string, token: string): boolean {
  const expected = Buffer.from(uploadDiscardToken(secret, userId, path))
  const actual = Buffer.from(token)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
