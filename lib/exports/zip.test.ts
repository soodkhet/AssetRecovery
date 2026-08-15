import { describe, expect, it } from 'vitest'
import { buildZip, crc32, dosDateTime, type ZipEntry } from '@/lib/exports/zip'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** อ่านไฟล์กลับจาก zip ผ่าน **central directory** (ทางเดียวกับที่โปรแกรมแตกไฟล์จริงใช้) */
function readZip(bytes: Uint8Array): { name: string; text: string; crc: number }[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  // EOCD อยู่ท้ายไฟล์ (ไม่มี comment ⇒ 22 ไบต์สุดท้ายพอดี)
  const eocd = bytes.length - 22
  expect(view.getUint32(eocd, true)).toBe(0x06054b50)
  const count = view.getUint16(eocd + 10, true)
  let cursor = view.getUint32(eocd + 16, true)

  const out: { name: string; text: string; crc: number }[] = []
  for (let index = 0; index < count; index += 1) {
    expect(view.getUint32(cursor, true)).toBe(0x02014b50)
    const crc = view.getUint32(cursor + 16, true)
    const size = view.getUint32(cursor + 24, true)
    const nameLength = view.getUint16(cursor + 28, true)
    const localOffset = view.getUint32(cursor + 42, true)
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength))

    expect(view.getUint32(localOffset, true)).toBe(0x04034b50)
    const localNameLength = view.getUint16(localOffset + 26, true)
    const extraLength = view.getUint16(localOffset + 28, true)
    const dataStart = localOffset + 30 + localNameLength + extraLength
    const data = bytes.subarray(dataStart, dataStart + size)

    out.push({ name, text: decoder.decode(data), crc })
    cursor += 46 + nameLength
  }
  return out
}

const AT = new Date('2026-07-05T03:30:00Z') // 05/07/2569 10:30 เวลาไทย

function entries(): ZipEntry[] {
  return [
    { name: '01_Revenue.csv', data: encoder.encode('company,case_ref\r\n') },
    { name: '08_Document_Checklist.xlsx', data: encoder.encode('ไบต์ไทยในไฟล์') },
  ]
}

describe('ตัวเขียน .zip ของ Accounting Pack (`37` §6.1)', () => {
  it('CRC-32 ตรงกับค่ามาตรฐานที่รู้ผลอยู่แล้ว', () => {
    expect(crc32(encoder.encode(''))).toBe(0)
    expect(crc32(encoder.encode('123456789'))).toBe(0xcbf43926)
    expect(crc32(encoder.encode('The quick brown fox jumps over the lazy dog'))).toBe(0x414fa339)
  })

  it('แตกไฟล์กลับได้ครบทุกไฟล์ ชื่อและเนื้อหาเหมือนเดิม (รวมข้อความไทย)', () => {
    const parsed = readZip(buildZip(entries(), AT))
    expect(parsed.map((file) => file.name)).toEqual(['01_Revenue.csv', '08_Document_Checklist.xlsx'])
    expect(parsed[0]?.text).toBe('company,case_ref\r\n')
    expect(parsed[1]?.text).toBe('ไบต์ไทยในไฟล์')
  })

  it('CRC ใน central directory ตรงกับเนื้อไฟล์จริง (ไฟล์เสียจะถูกจับได้ตอนแตก)', () => {
    const list = entries()
    const parsed = readZip(buildZip(list, AT))
    expect(parsed[0]?.crc).toBe(crc32(list[0]!.data))
    expect(parsed[1]?.crc).toBe(crc32(list[1]!.data))
  })

  it('input เดิม → ไบต์เดิมทุกครั้ง (deterministic — หัวใจของ SHA-256 ที่บันทึกไว้)', () => {
    expect(Array.from(buildZip(entries(), AT))).toEqual(Array.from(buildZip(entries(), AT)))
  })

  it('เวลาแก้ไขไฟล์ใน zip ใช้เวลาไทย ไม่ใช่ UTC (Rule 01)', () => {
    // 05/07/2026 10:30 น. เวลาไทย → date = ((2026-1980)<<9)|(7<<5)|5 · time = (10<<11)|(30<<5)
    expect(dosDateTime(AT)).toEqual({
      date: ((2026 - 1980) << 9) | (7 << 5) | 5,
      time: (10 << 11) | (30 << 5),
    })
  })

  it('ชุดว่างยังเป็น zip ที่ถูกต้อง (EOCD ครบ 22 ไบต์)', () => {
    const bytes = buildZip([], AT)
    expect(bytes.length).toBe(22)
    expect(readZip(bytes)).toEqual([])
  })
})
