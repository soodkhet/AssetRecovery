import { IMPORT_COLUMNS, resolveImportField, type ImportField } from '@/lib/cases/import'

/**
 * ตรรกะของ Import wizard ฝั่งหน้าจอ (`38` §7.1 — เลือกไฟล์ → mapping คอลัมน์ → preview → ยืนยัน)
 * **pure ล้วน** — แยกจาก component เพื่อให้มีเทสต์จริงได้
 *
 * วิธีต่อกับ backend: wizard **ไม่ได้ส่ง mapping ไปด้วย** แต่ "เปลี่ยนชื่อหัวคอลัมน์" ให้เป็น
 * label มาตรฐานของ `IMPORT_COLUMNS` ก่อนส่ง `rows` — ฝั่ง API จึง resolve ด้วย
 * `resolveImportField()` ตัวเดิมได้เลย (ตรรกะ mapping มีชุดเดียวทั้งระบบ)
 */

/** หัวคอลัมน์ในไฟล์ → ฟิลด์ปลายทาง (`''` = ไม่นำเข้า คอลัมน์นี้) */
export type HeaderMapping = Readonly<Record<string, ImportField | ''>>

const FIELD_LABEL = new Map<ImportField, string>(IMPORT_COLUMNS.map((column) => [column.field, column.label]))

export function importFieldLabel(field: ImportField): string {
  return FIELD_LABEL.get(field) ?? field
}

/** ฟิลด์ที่ต้อง map ให้ครบก่อนนำเข้าได้ — `case_ref` เป็นค่าเดียวที่ schema บังคับ (`38` §11) */
export const REQUIRED_IMPORT_FIELDS: readonly ImportField[] = ['caseRef']

/** หัวคอลัมน์ทั้งหมดที่พบในไฟล์ (union ของทุกแถว — ไฟล์บางไฟล์เว้นคอลัมน์ท้ายไว้) */
export function collectHeaders(rows: readonly Record<string, unknown>[]): string[] {
  const headers: string[] = []
  for (const row of rows) {
    for (const header of Object.keys(row)) {
      if (header.trim() !== '' && !headers.includes(header)) headers.push(header)
    }
  }
  return headers
}

/** เดา mapping อัตโนมัติจากชื่อหัวคอลัมน์ — ผู้ใช้แก้ทับได้ทุกช่อง */
export function autoMapping(headers: readonly string[]): Record<string, ImportField | ''> {
  const mapping: Record<string, ImportField | ''> = {}
  const used = new Set<ImportField>()
  for (const header of headers) {
    const field = resolveImportField(header)
    // ฟิลด์เดียวกันถูกจับคู่ได้ครั้งเดียว — คอลัมน์ที่ซ้ำทีหลังปล่อยให้ผู้ใช้เลือกเอง
    if (field !== null && !used.has(field)) {
      mapping[header] = field
      used.add(field)
    } else {
      mapping[header] = ''
    }
  }
  return mapping
}

/** ฟิลด์บังคับที่ยังไม่ได้ map — wizard ใช้ปิดปุ่ม "ตรวจสอบข้อมูล" */
export function missingRequiredFields(mapping: HeaderMapping): ImportField[] {
  const mapped = new Set(Object.values(mapping).filter((field): field is ImportField => field !== ''))
  return REQUIRED_IMPORT_FIELDS.filter((field) => !mapped.has(field))
}

/** ฟิลด์ที่ถูก map ซ้ำมากกว่า 1 คอลัมน์ — ต้องแก้ก่อน ไม่งั้นค่าทับกันเงียบ ๆ */
export function duplicateMappedFields(mapping: HeaderMapping): ImportField[] {
  const seen = new Set<ImportField>()
  const duplicates = new Set<ImportField>()
  for (const field of Object.values(mapping)) {
    if (field === '') continue
    if (seen.has(field)) duplicates.add(field)
    else seen.add(field)
  }
  return [...duplicates]
}

/** คอลัมน์ในไฟล์ที่ผู้ใช้เลือก "ไม่นำเข้า" (หรือระบบเดาไม่ออก) — เตือนก่อนยืนยัน */
export function ignoredHeaders(mapping: HeaderMapping): string[] {
  return Object.entries(mapping)
    .filter(([, field]) => field === '')
    .map(([header]) => header)
}

/**
 * แถวดิบ + mapping → แถวที่หัวคอลัมน์เป็น label มาตรฐาน (พร้อมส่งเป็น `rows` ให้ API)
 * คอลัมน์ที่ไม่ได้ map ถูกตัดทิ้ง — ค่าที่เป็น `null`/`undefined` แปลงเป็นสตริงว่าง
 */
export function applyHeaderMapping(
  rows: readonly Record<string, unknown>[],
  mapping: HeaderMapping,
): Array<Record<string, unknown>> {
  return rows.map((row) => {
    const mapped: Record<string, unknown> = {}
    for (const [header, value] of Object.entries(row)) {
      const field = mapping[header]
      if (field === undefined || field === '') continue
      mapped[importFieldLabel(field)] = value ?? ''
    }
    return mapped
  })
}
