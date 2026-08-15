import { fmtDate } from '@/lib/format/datetime'

/**
 * ตัวเขียน CSV ของ Accounting Pack (ไฟล์ 37 §6.1) — **CSV UTF-8** ตาม `reference/samples/01–07`
 *
 * รูปแบบที่ตัวอย่างใช้จริง (ตรวจจากไบต์ของไฟล์ตัวอย่าง — ห้ามเปลี่ยนโดยไม่แก้ตัวอย่างคู่กัน):
 * - **BOM** นำหน้าไฟล์ (`EF BB BF`) — Excel ไทยเปิดแล้วไม่เพี้ยน
 * - ปิดบรรทัดด้วย **CRLF** ทุกบรรทัด รวมบรรทัดสุดท้าย
 * - เงินเป็นทศนิยม 2 ตำแหน่ง **ไม่มีตัวคั่นหลักพัน** (`12000.00`) — คนละแบบกับ `fmtSatang()` บนหน้าจอ
 * - วันที่เป็น **พ.ศ.** `DD/MM/YYYY` ผ่าน `fmtDate()` ตัวเดียวกับทั้งระบบ (Rule 01)
 */

export const CSV_BOM = '﻿'
export const CSV_NEWLINE = '\r\n'

/** ช่องที่ไม่มีค่า — ตัวอย่างใช้ `-` (ไม่ใช่ช่องว่าง) เพื่อให้เห็นว่า "ไม่มี" ไม่ใช่ "ตกหล่น" */
export const CSV_EMPTY = '-'

/** ใส่เครื่องหมายคำพูดเมื่อค่ามี `,` `"` หรือขึ้นบรรทัดใหม่ (RFC 4180 — `"` ภายในเป็น `""`) */
export function csvCell(value: string | null | undefined): string {
  const text = value === null || value === undefined ? '' : value
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function csvLine(cells: readonly (string | null | undefined)[]): string {
  return cells.map(csvCell).join(',')
}

export function buildCsv(
  headers: readonly string[],
  rows: readonly (readonly (string | null | undefined)[])[],
): string {
  return (
    CSV_BOM +
    [csvLine(headers), ...rows.map(csvLine)].map((line) => line + CSV_NEWLINE).join('')
  )
}

/**
 * satang → บาททศนิยม 2 ตำแหน่ง แบบ **เลขจำนวนเต็มล้วน** (ห้ามหารด้วย 100 เป็น float — Rule 01)
 * ติดลบได้ (ไฟล์ 07 Adjustment มียอดลด เช่น `-100.00`)
 */
export function csvBaht(satang: number): string {
  const sign = satang < 0 ? '-' : ''
  const abs = Math.abs(satang)
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/** วันที่บนไฟล์ส่งบัญชี = พ.ศ. `DD/MM/YYYY` เสมอ (Rule 01) — ค่าว่างคืน `-` */
export function csvDate(input: Date | string | null | undefined): string {
  return fmtDate(input, CSV_EMPTY)
}

/** ข้อความที่อาจว่าง → `-` (ใช้กับคอลัมน์ที่สคีมาอนุญาต NULL) */
export function csvText(value: string | null | undefined): string {
  const text = (value ?? '').trim()
  return text === '' ? CSV_EMPTY : text
}
