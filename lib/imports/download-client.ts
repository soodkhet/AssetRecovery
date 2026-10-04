import type { ImportTemplateColumn } from '@/lib/imports/template'

/**
 * ตัวช่วยไฟล์ของจุดนำเข้า — **ฝั่ง client เท่านั้น**
 */

/** ให้ browser ดาวน์โหลดเนื้อไฟล์ (ข้อความหรือไบต์) */
export function downloadFile(fileName: string, content: BlobPart, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/**
 * ให้ browser ดาวน์โหลดข้อความเป็นไฟล์ (ใช้กับไฟล์ตัวอย่าง CSV ของจุดนำเข้า)
 * ข้อความที่ขึ้นต้นด้วย BOM (`﻿`) จะถูกเขียนเป็นไบต์ `EF BB BF` เพราะ `Blob` เข้ารหัส UTF-8 เสมอ
 */
export function downloadTextFile(fileName: string, text: string, mimeType = 'text/csv;charset=utf-8'): void {
  downloadFile(fileName, text, mimeType)
}

/** นามสกุลไฟล์ที่จุดนำเข้ารับ — ใช้กับ `accept` ของ `<input type="file">` */
export const IMPORT_FILE_ACCEPT =
  '.xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/**
 * อ่านไฟล์นำเข้าเป็น **ข้อความ CSV** (มติผู้ใช้ 04/10/2569 — รับทั้ง .xlsx และ .csv)
 * - `.csv` → ข้อความตามไฟล์ (เหมือนเดิม)
 * - `.xlsx` → อ่านแผ่นแรกด้วย SheetJS (โหลดแบบ dynamic) แล้วแปลงเป็น CSV ⇒ parser เดิมของแต่ละจุดใช้ต่อได้ 100%
 * อ่านไม่ได้/นามสกุลอื่น → โยน `Error` ที่ `message` เป็นภาษาไทยพร้อมแสดงผู้ใช้เสมอ
 */
export async function readImportFileAsCsv(file: File, options: { maxDataRows?: number } = {}): Promise<string> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.csv')) return file.text()
  const { ImportFileError, xlsxToCsv } = await import('@/lib/imports/xlsx')
  if (!name.endsWith('.xlsx')) {
    throw new ImportFileError('รองรับเฉพาะไฟล์ .xlsx หรือ .csv — ไฟล์ Excel รุ่นเก่า (.xls) ให้บันทึกใหม่เป็น .xlsx ก่อน')
  }
  try {
    return xlsxToCsv(new Uint8Array(await file.arrayBuffer()), options)
  } catch (error) {
    if (error instanceof ImportFileError) throw error
    throw new ImportFileError('อ่านไฟล์ Excel ไม่ได้ — ลองบันทึกใหม่เป็น .xlsx หรือ CSV UTF-8')
  }
}

/** สร้างและดาวน์โหลดแม่แบบ .xlsx (โหลด SheetJS แบบ dynamic เมื่อกดปุ่มเท่านั้น) */
export async function downloadXlsxTemplate(
  fileName: string,
  columns: readonly ImportTemplateColumn[],
): Promise<void> {
  const { buildImportTemplateXlsx, XLSX_MIME_TYPE } = await import('@/lib/imports/xlsx')
  downloadFile(fileName, buildImportTemplateXlsx(columns) as Uint8Array<ArrayBuffer>, XLSX_MIME_TYPE)
}
