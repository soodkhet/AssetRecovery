import { createHash } from 'node:crypto'

/**
 * กุญแจกันแจ้งเตือนซ้ำ (idempotency ของ Notification Service — PLAN §5.1 · Rule 04 `91`)
 *
 * ปัญหาจริงที่กัน: job/consumer ยิงซ้ำได้เสมอ (retry, duplicate delivery, กดปุ่มรัว) ถ้าปล่อยตามนั้น
 * ผู้ใช้จะเห็นแจ้งเตือนเรื่องเดียวกันซ้ำ 3 ใบ · ตาราง `notifications` (`02` §10) **ไม่มีคอลัมน์
 * dedupe key** และการเพิ่มคอลัมน์ต้องผ่านมติ PO ⇒ ใช้วิธีที่ไม่ต้องแตะ schema:
 * คำนวณ **`id` แบบ deterministic (UUIDv5)** จาก (org, ผู้รับ, event, กุญแจของเหตุการณ์)
 * แล้วให้ PRIMARY KEY เป็นตัวกันซ้ำระดับ DB — ยิงพร้อมกันกี่ครั้งก็ได้แถวเดียว
 *
 * กุญแจของเหตุการณ์ (`dedupeKey`) ควรเป็นอะไรที่ "เหตุการณ์เดียวกัน = ค่าเดียวกัน" เช่น
 * `caseId` + รอบติดตาม, `payoutBatchId`, `exceptionId` — ห้ามใส่เวลาปัจจุบันลงไป (จะไม่ซ้ำเลย)
 */

/** namespace UUID ประจำการแจ้งเตือนของ AssetRecovery (ค่าคงที่ ห้ามเปลี่ยน — เปลี่ยน = dedupe เดิมพัง) */
const NOTIFICATION_NAMESPACE = '5f3c0f6e-8f1a-4c8e-9a2b-6d0f7a1c3b55'

/** ตัวคั่นช่อง = US (U+001F) ไม่ใช่ `:` หรือช่องว่าง — กันคู่ (a, bc) กับ (ab, c) แฮชชนกัน */
const FIELD_SEPARATOR = '\u001F'

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/-/g, '')
  const bytes = new Uint8Array(clean.length / 2)
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(clean.slice(index * 2, index * 2 + 2), 16)
  }
  return bytes
}

function byteAt(bytes: Uint8Array, index: number): number {
  return bytes[index] ?? 0
}

function formatUuid(bytes: Uint8Array): string {
  const hex = [...bytes.slice(0, 16)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

/** UUID v5 (SHA-1 + namespace) ตาม RFC 4122 §4.3 — เขียนเองเพื่อไม่เพิ่ม dependency สำหรับงานสิบบรรทัด */
export function uuidV5(name: string, namespace = NOTIFICATION_NAMESPACE): string {
  const hash = createHash('sha1')
  hash.update(hexToBytes(namespace))
  hash.update(Buffer.from(name, 'utf8'))
  const digest = new Uint8Array(hash.digest())

  // version 5 (0101xxxx) + variant RFC 4122 (10xxxxxx)
  digest[6] = (byteAt(digest, 6) & 0x0f) | 0x50
  digest[8] = (byteAt(digest, 8) & 0x3f) | 0x80

  return formatUuid(digest)
}

/** `id` ของแถว `notifications` ที่คำนวณซ้ำได้ — คนละผู้รับ/คนละ event/คนละเหตุการณ์ = คนละ id เสมอ */
export function notificationDedupeId(input: {
  organizationId: string
  userId: string
  eventCode: string
  dedupeKey: string
}): string {
  return uuidV5([input.organizationId, input.userId, input.eventCode, input.dedupeKey].join(FIELD_SEPARATOR))
}
