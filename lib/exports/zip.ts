import { toBangkokParts } from '@/lib/format/datetime'

/**
 * ตัวเขียนไฟล์ `.zip` ของ Accounting Pack (ไฟล์ 37 §6.1) — **STORE อย่างเดียว ไม่บีบอัด**
 *
 * ทำไมเขียนเอง ไม่ลงไลบรารี: รูปแบบ ZIP แบบ STORE เป็นสเปคคงที่ไม่กี่สิบบรรทัด ทดสอบครบได้ ส่วน
 * **ผลลัพธ์ต้อง deterministic** (ไบต์เดิม → SHA-256 เดิม) ซึ่งไลบรารีทั่วไปฝังเวลาปัจจุบัน/ระดับการบีบอัด
 * ลงไฟล์เอง ⇒ hash ที่บันทึกไว้ใน `export_records.file_hash` พิสูจน์อะไรไม่ได้
 * (Tech Stack ใน CLAUDE.md ไม่มีไลบรารี zip — เพิ่ม dependency ต้องมี Decision Log ก่อน)
 *
 * ข้อจำกัดที่ยอมรับ: ไม่มี ZIP64 ⇒ ชุดเอกสารต้องไม่เกิน 4 GB และไม่เกิน 65,535 ไฟล์ (ชุดจริง = 9 ไฟล์)
 */

const LOCAL_HEADER_SIG = 0x04034b50
const CENTRAL_HEADER_SIG = 0x02014b50
const EOCD_SIG = 0x06054b50
/** 2.0 = ใช้ฟีเจอร์พื้นฐาน (store/deflate) — พอสำหรับ STORE */
const VERSION = 20
/** bit 11 = ชื่อไฟล์เป็น UTF-8 */
const FLAG_UTF8 = 0x0800
const METHOD_STORE = 0

const CRC_TABLE: readonly number[] = (() => {
  const table = new Array<number>(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
})()

/** CRC-32 (IEEE) ของข้อมูล — ค่าที่ ZIP บังคับให้มีต่อไฟล์ */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    // ตารางมีครบ 256 ช่องเสมอ (สร้างตอน import) — `?? 0` เป็นแค่ยามให้ชนิดแน่นอน
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

/**
 * เวลาแก้ไขไฟล์ในรูป MS-DOS (เวลา*ท้องถิ่น* ตามสเปค ZIP) — ใช้เวลาไทยเสมอเพื่อให้คนที่แตกไฟล์
 * ในไทยเห็นเวลาตรงกับที่ระบบแสดง (Rule 01) · วินาทีมีความละเอียด 2 วินาทีตามรูปแบบ DOS
 */
export function dosDateTime(at: Date): { date: number; time: number } {
  const parts = toBangkokParts(at)
  if (parts === null) throw new TypeError('dosDateTime: วันที่ไม่ถูกต้อง')
  // DOS นับปีจาก 1980 — วันก่อนหน้านั้นใช้ไม่ได้ (ไม่มีทางเกิดกับข้อมูลจริงของระบบ)
  const year = Math.max(parts.year, 1980)
  return {
    date: ((year - 1980) << 9) | (parts.month << 5) | parts.day,
    time: (parts.hour << 11) | (parts.minute << 5) | Math.floor(parts.second / 2),
  }
}

export interface ZipEntry {
  /** ชื่อไฟล์ใน archive (ไม่มีโฟลเดอร์นำหน้า — ชุดเอกสารเป็นไฟล์แบนทั้งชุด) */
  name: string
  data: Uint8Array
}

interface CentralEntry {
  nameBytes: Uint8Array
  crc: number
  size: number
  offset: number
}

const encoder = new TextEncoder()

/**
 * ประกอบไฟล์ zip จากรายการไฟล์ — ผลลัพธ์ขึ้นกับ (ชื่อ, เนื้อหา, `modifiedAt`) เท่านั้น
 * ⇒ เรียกด้วย input เดิมได้ไบต์เดิมและ SHA-256 เดิมเสมอ
 */
export function buildZip(entries: readonly ZipEntry[], modifiedAt: Date): Uint8Array {
  const { date, time } = dosDateTime(modifiedAt)
  const chunks: Uint8Array[] = []
  const central: CentralEntry[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name)
    const crc = crc32(entry.data)
    const header = new Uint8Array(30 + nameBytes.length)
    const view = new DataView(header.buffer)
    view.setUint32(0, LOCAL_HEADER_SIG, true)
    view.setUint16(4, VERSION, true)
    view.setUint16(6, FLAG_UTF8, true)
    view.setUint16(8, METHOD_STORE, true)
    view.setUint16(10, time, true)
    view.setUint16(12, date, true)
    view.setUint32(14, crc, true)
    view.setUint32(18, entry.data.length, true)
    view.setUint32(22, entry.data.length, true)
    view.setUint16(26, nameBytes.length, true)
    view.setUint16(28, 0, true)
    header.set(nameBytes, 30)

    chunks.push(header, entry.data)
    central.push({ nameBytes, crc, size: entry.data.length, offset })
    offset += header.length + entry.data.length
  }

  const centralOffset = offset
  for (const entry of central) {
    const header = new Uint8Array(46 + entry.nameBytes.length)
    const view = new DataView(header.buffer)
    view.setUint32(0, CENTRAL_HEADER_SIG, true)
    view.setUint16(4, VERSION, true)
    view.setUint16(6, VERSION, true)
    view.setUint16(8, FLAG_UTF8, true)
    view.setUint16(10, METHOD_STORE, true)
    view.setUint16(12, time, true)
    view.setUint16(14, date, true)
    view.setUint32(16, entry.crc, true)
    view.setUint32(20, entry.size, true)
    view.setUint32(24, entry.size, true)
    view.setUint16(28, entry.nameBytes.length, true)
    view.setUint16(30, 0, true)
    view.setUint16(32, 0, true)
    view.setUint16(34, 0, true)
    view.setUint16(36, 0, true)
    view.setUint32(38, 0, true)
    view.setUint32(42, entry.offset, true)
    header.set(entry.nameBytes, 46)

    chunks.push(header)
    offset += header.length
  }

  const eocd = new Uint8Array(22)
  const eocdView = new DataView(eocd.buffer)
  eocdView.setUint32(0, EOCD_SIG, true)
  eocdView.setUint16(4, 0, true)
  eocdView.setUint16(6, 0, true)
  eocdView.setUint16(8, central.length, true)
  eocdView.setUint16(10, central.length, true)
  eocdView.setUint32(12, offset - centralOffset, true)
  eocdView.setUint32(16, centralOffset, true)
  eocdView.setUint16(20, 0, true)
  chunks.push(eocd)

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const out = new Uint8Array(total)
  let cursor = 0
  for (const chunk of chunks) {
    out.set(chunk, cursor)
    cursor += chunk.length
  }
  return out
}
