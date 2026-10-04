import { buildCsv } from '@/lib/exports/csv'
import type { StatusBadgeGroup } from '@/lib/ui/status-badge'

/**
 * ไฟล์ตัวอย่าง (แม่แบบ) ของทุกจุดนำเข้าข้อมูลแบบตาราง — **pure ล้วน ใช้ร่วม FE/BE**
 * (มติ PO 04/10/2569 — UAT: ทุกจุดนำเข้าไฟล์ต้องมีแม่แบบหัวคอลัมน์ภาษาไทยให้ดาวน์โหลด)
 *
 * หลักการ: แต่ละโมดูลประกาศคอลัมน์ไว้ **ชุดเดียว** ข้าง parser ของตัวเอง (หัวคอลัมน์ต้องเป็นชื่อที่ parser
 * รู้จักอยู่แล้ว) แล้วส่งเข้ามาที่นี่เพื่อ (1) สร้างไฟล์ CSV แม่แบบ (2) แสดงคำอธิบายคอลัมน์บนหน้าจอ
 * ⇒ แม่แบบ / parser / คำอธิบาย ไม่มีทางเพี้ยนกัน (มีเทสต์ "แม่แบบ → parser ผ่าน 100%" ของแต่ละจุด)
 *
 * รูปแบบไฟล์ = CSV UTF-8 + BOM + CRLF ผ่าน `buildCsv()` ตัวเดียวกับ Accounting Pack — Excel ไทยเปิดแล้วไม่เพี้ยน
 */

/** ระดับความจำเป็นของคอลัมน์ — เรียงตามลำดับที่คอลัมน์ควรอยู่ในแม่แบบ */
export const IMPORT_COLUMN_REQUIREMENTS = ['required', 'required_before_review', 'conditional', 'optional'] as const
export type ImportColumnRequirement = (typeof IMPORT_COLUMN_REQUIREMENTS)[number]

export const IMPORT_REQUIREMENT_LABEL: Record<ImportColumnRequirement, string> = {
  required: 'บังคับ',
  required_before_review: 'บังคับก่อนส่งตรวจ',
  conditional: 'ตามเงื่อนไข',
  optional: 'ไม่บังคับ',
}

/** สีป้ายระดับความจำเป็น — ใช้กลุ่มสีกลางของระบบเท่านั้น */
export const IMPORT_REQUIREMENT_BADGE_GROUP: Record<ImportColumnRequirement, StatusBadgeGroup> = {
  required: 'critical',
  required_before_review: 'warning',
  conditional: 'info',
  optional: 'neutral',
}

export interface ImportTemplateColumn {
  /** หัวคอลัมน์ที่เขียนลงแม่แบบ — ต้องเป็นชื่อที่ parser ของจุดนั้นรู้จัก */
  header: string
  requirement: ImportColumnRequirement
  /** คำอธิบายรูปแบบค่าสั้น ๆ (ภาษาไทย ไม่มีเลขอ้างอิงสเปค) */
  format: string
  /** ค่าตัวอย่างต่อแถวของแม่แบบ (index 0 = แถวตัวอย่างที่ 1) — ว่างได้ */
  examples: readonly string[]
}

/** DTO ที่ส่งให้หน้าจอแสดงคำอธิบายคอลัมน์ (ไม่มีค่าตัวอย่าง) */
export interface ImportTemplateColumnDoc {
  header: string
  requirement: ImportColumnRequirement
  format: string
}

/** เรียงคอลัมน์ บังคับ → บังคับก่อนส่งตรวจ → ตามเงื่อนไข → ไม่บังคับ (คงลำดับเดิมภายในกลุ่มเดียวกัน) */
export function sortTemplateColumns<T extends { requirement: ImportColumnRequirement }>(columns: readonly T[]): T[] {
  const rank = (requirement: ImportColumnRequirement): number => IMPORT_COLUMN_REQUIREMENTS.indexOf(requirement)
  return columns
    .map((column, index) => ({ column, index }))
    .sort((a, b) => rank(a.column.requirement) - rank(b.column.requirement) || a.index - b.index)
    .map(({ column }) => column)
}

export function templateColumnDocs(columns: readonly ImportTemplateColumn[]): ImportTemplateColumnDoc[] {
  return columns.map(({ header, requirement, format }) => ({ header, requirement, format }))
}

/** แถวตัวอย่างของแม่แบบ (ตามลำดับคอลัมน์ที่ส่งมา) — จำนวนแถว = ตัวอย่างที่ยาวที่สุด · ใช้ร่วม CSV/.xlsx */
export function templateExampleRows(columns: readonly ImportTemplateColumn[]): string[][] {
  const rowCount = Math.max(0, ...columns.map((column) => column.examples.length))
  return Array.from({ length: rowCount }, (_, rowIndex) => columns.map((column) => column.examples[rowIndex] ?? ''))
}

/** คอลัมน์ (ตามลำดับที่ส่งมา) → เนื้อไฟล์ CSV แม่แบบ: หัวคอลัมน์ 1 แถว + แถวตัวอย่างเท่าจำนวนตัวอย่างที่ยาวที่สุด */
export function buildImportTemplateCsv(columns: readonly ImportTemplateColumn[]): string {
  return buildCsv(
    columns.map((column) => column.header),
    templateExampleRows(columns),
  )
}

/** ชื่อไฟล์แม่แบบ .xlsx คู่กับชื่อไฟล์ .csv เดิม (`x.csv` → `x.xlsx`) */
export function xlsxTemplateFileName(csvFileName: string): string {
  return csvFileName.replace(/\.csv$/i, '') + '.xlsx'
}

/**
 * ค่าที่ดูเป็น **เลขยกกำลัง** (`3.5E+14`, `8.12E8`) — เกิดเมื่อ Excel แปลงตัวเลขยาวในเซลล์รูปแบบ "ทั่วไป"
 * ค่าเดิมกู้คืนไม่ได้ (หลักท้าย ๆ หายไปแล้ว) ⇒ ผู้เรียกต้อง reject แถวนั้น ห้ามเดาค่าคืน
 * (มติผู้ใช้ 04/10/2569 — IMEI ต้องตรงเป๊ะ 15 หลัก)
 */
export function looksLikeScientificNotation(value: string): boolean {
  return /^[+-]?\d+(?:[.,]\d+)?[eE][+-]?\d+$/.test(value.trim())
}

/** ข้อความ error ภาษาไทยของเซลล์ที่ Excel แปลงเป็นเลขยกกำลัง — ใช้ร่วมทุกจุดนำเข้า */
export function scientificNotationMessage(label: string, value: string): string {
  return `${label} "${value.trim()}" ถูก Excel แปลงเป็นเลขยกกำลัง ตัวเลขเดิมหายไปแล้ว — ตั้งรูปแบบเซลล์ของคอลัมน์นี้เป็น “ข้อความ” แล้วพิมพ์เลขใหม่`
}
