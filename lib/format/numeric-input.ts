/**
 * กติกาช่องกรอกตัวเลขระหว่างพิมพ์/วาง — pure ใช้กับ `<NumericInput>` / `<MoneyInput>` (มติผู้ใช้ 15/10/2569)
 *
 * ชนิดช่อง (`kind`):
 * - `money`   ยอดเงินบาท — ตัวเลข + จุด 1 จุด ทศนิยม ≤ 2 (เงินเก็บเป็น INTEGER satang — Rule 01) · วางตัดคอมมา/ช่องว่างได้
 * - `decimal` ทศนิยม/เปอร์เซ็นต์ — ตัวเลข + จุด 1 จุด ทศนิยม ≤ `decimals` (ค่าเริ่ม 2 = NUMERIC(5,2)) · วางตัดช่องว่างได้
 * - `integer` จำนวนเต็มไม่ติดลบ (ชั่วโมง/วัน/ปี/จำนวนคืน) — ตัวเลขล้วน · วางตัดคอมมา/ช่องว่างได้
 * - `digits`  รหัสที่เป็นตัวเลข (เลขผู้เสียภาษี/สาขา/บัญชี/เบอร์โทร/รหัสไปรษณีย์) — เก็บเป็นข้อความ (0 นำหน้าไม่หาย)
 *             ตัวเลข + อักขระคั่นที่ spec/โค้ดเดิมยอมรับ (`separators` เช่น `-` และช่องว่าง) · เลขไทย/เลขเต็มความกว้างแปลงเป็นเลขอารบิก
 *
 * กติการ่วม: ติดลบไม่ได้ (ไม่มี `-` นำหน้า — `-` เป็นได้แค่อักขระคั่นของ `digits`) · พิมพ์อักขระอื่น ⇒ ไม่เข้าช่อง ·
 * พิมพ์จนเกินรูป (ทศนิยมเกิน/หลักเกิน) ⇒ ไม่รับตัวที่พิมพ์ (ไม่ปัด/ตัดเงียบ) · วาง/ค่าที่เข้าเป็นก้อน ⇒ ตัดได้แค่ตัวคั่นที่กำหนด
 * ยังมีอักขระอื่น/ผลลัพธ์ผิดรูป ⇒ ไม่รับทั้งก้อน
 *
 * ⚠️ ที่นี่แค่กรองข้อความในช่อง — แปลง/ตรวจค่าจริงยังเป็นหน้าที่ของตัวแปลงเดิม (`parseBahtInput()`, `normalizeTaxId()` ฯลฯ)
 * และ Zod ฝั่ง server เหมือนเดิม · IMEI ไม่ใช้โมดูลนี้ (Rule 10 — `parseImei()` จุดเดียว)
 */

export type NumericInputKind = 'money' | 'decimal' | 'integer' | 'digits'

export interface NumericRuleOptions {
  kind: NumericInputKind
  /** `decimal` เท่านั้น — จำนวนตำแหน่งทศนิยมสูงสุด (ค่าเริ่ม 2) */
  decimals?: number
  /** `integer`/`digits` — จำนวนตัวเลขสูงสุด (ไม่นับอักขระคั่น) · `decimal` — จำนวนหลักหน้าจุดสูงสุด */
  maxDigits?: number
  /** `digits` — ความยาวข้อความสูงสุดรวมอักขระคั่น (เช่นเลขบัญชี ≤ 30 ตัวอักษร) */
  maxLength?: number
  /** `digits` — อักขระคั่นที่พิมพ์/วางลงช่องได้และคงไว้ในข้อความ (เช่น `'- '`) · ตัวแปลงเดิมของ field ตัดทิ้งเอง */
  separators?: string
}

/** กติกาที่ประกอบแล้ว — ใช้กับ `numericChange()` / `applyNumericPaste()` */
export interface NumericRule {
  /** ข้อความนี้อยู่ในช่องได้หรือไม่ (รวมสถานะกำลังพิมพ์ เช่น `''`, `'12.'`) */
  accepts: (text: string) => boolean
  /** อักขระที่ทิ้งได้เมื่อพิมพ์เพิ่มทีละ 1 ตัว (= ทุกอักขระนอกชุดที่ช่องรับ) */
  typedDrop: RegExp
  /** อักขระที่ตัดได้เมื่อค่าเข้าเป็นก้อน/วาง (ตัวคั่นหลักพัน/ช่องว่าง) */
  blockDrop: RegExp
  /** แปลงอักขระแบบความยาวเท่าเดิม (เลขไทย → อารบิก) ก่อนตรวจ */
  mapChars: (text: string) => string
}

const THAI_DIGIT_ZERO = 0x0e50
const FULLWIDTH_DIGIT_ZERO = 0xff10

/**
 * เลขไทย (๐-๙) / เลขเต็มความกว้าง (０-９) และ `＋` เต็มความกว้าง → ASCII (preship R3-030)
 * แทนที่ทีละตัว ความยาวสตริงเท่าเดิม (ตำแหน่งเคอร์เซอร์ไม่เลื่อน)
 */
export function toAsciiDigits(value: string): string {
  return value.replace(/[๐-๙０-９＋]/g, (char) => {
    const code = char.charCodeAt(0)
    if (code === 0xff0b) return '+'
    return String(code >= FULLWIDTH_DIGIT_ZERO ? code - FULLWIDTH_DIGIT_ZERO : code - THAI_DIGIT_ZERO)
  })
}

function escapeClass(chars: string): string {
  return chars.replace(/[\\\]^-]/g, '\\$&')
}

function countDigits(text: string): number {
  return text.replace(/\D/g, '').length
}

const identity = (text: string): string => text

/** ประกอบกติกาของช่องตามชนิด */
export function numericRule({ kind, decimals = 2, maxDigits, maxLength, separators = '' }: NumericRuleOptions): NumericRule {
  const withinDigits = (text: string) => maxDigits === undefined || countDigits(text) <= maxDigits
  if (kind === 'money' || kind === 'decimal') {
    const places = kind === 'money' ? 2 : decimals
    const whole = kind === 'decimal' && maxDigits !== undefined ? `\\d{0,${maxDigits}}` : '\\d*'
    const pattern = new RegExp(places > 0 ? `^${whole}(\\.\\d{0,${places}})?$` : `^${whole}$`)
    return {
      accepts: (text) => pattern.test(text),
      typedDrop: places > 0 ? /[^\d.]/g : /\D/g,
      // เงินวางมาพร้อมคอมมาหลักพันได้ · เปอร์เซ็นต์ไม่มีหลักพัน (คอมมาอาจหมายถึงจุดทศนิยม ⇒ ไม่ตัดเงียบ)
      blockDrop: kind === 'money' ? /[,\s]/g : /\s/g,
      mapChars: identity,
    }
  }
  if (kind === 'integer') {
    return {
      accepts: (text) => /^\d*$/.test(text) && withinDigits(text),
      typedDrop: /\D/g,
      blockDrop: /[,\s]/g,
      mapChars: identity,
    }
  }
  const sep = escapeClass(separators)
  const pattern = new RegExp(`^[\\d${sep}]*$`)
  return {
    accepts: (text) => pattern.test(text) && withinDigits(text) && (maxLength === undefined || text.length <= maxLength),
    typedDrop: new RegExp(`[^\\d${sep}]`, 'g'),
    // ช่องว่างที่ไม่ใช่ตัวคั่น (ขึ้นบรรทัด/แท็บ/ช่องว่างหัวท้ายตอนคัดลอก) ตัดได้
    blockDrop: separators.includes(' ') ? /[^\S ]/g : /\s/g,
    mapChars: toAsciiDigits,
  }
}

/** ผลของการเปลี่ยนค่าในช่อง — `value === prev` และ `rejected` = ไม่รับ · `caret` = ตำแหน่งเคอร์เซอร์ที่ควรเป็น */
export interface NumericChange {
  value: string
  caret: number
  rejected: boolean
}

/**
 * ค่าที่ช่องควรเป็นหลังผู้ใช้แก้ช่อง (`next` = ค่าที่ browser จะใส่ · `caret` = เคอร์เซอร์ใน `next`) — `prev` = ค่าเดิมในช่อง
 * - ถูกรูปแล้ว ⇒ `next` (เลขไทยแปลงเป็นอารบิกสำหรับ `digits`)
 * - พิมพ์เพิ่มทีละ 1 ตัว (ยาวขึ้น 1) ⇒ ทิ้งอักขระนอกชุดที่ช่องรับ ถ้ายังผิดรูป (จุดซ้อน/ทศนิยมเกิน/หลักเกิน) ⇒ คงค่าเดิม
 * - ค่าที่เข้าเป็นก้อน (autofill/เสนอคำ/พิมพ์ด้วยเสียง/IME) ⇒ กติกาเดียวกับวาง: ตัดได้แค่ตัวคั่น มีอักขระอื่น ⇒ ไม่รับทั้งก้อน
 * - ค่าเดิมผิดรูป (ข้อมูลเก่า) ⇒ ลบให้สั้นลงได้เสมอ
 */
export function numericChange(rule: NumericRule, prev: string, next: string, caret: number = next.length): NumericChange {
  const mapped = rule.mapChars(next)
  if (rule.accepts(mapped)) return { value: mapped, caret, rejected: false }
  // ค่าเดิมผิดรูปอยู่แล้ว (ข้อมูลเก่าก่อนมีตัวกรอง) ⇒ ลบออกได้เสมอ ไม่งั้นแก้ช่องไม่ได้เลย (เฉพาะการลบจริง — ไม่ใช่พิมพ์ทับ)
  if (!rule.accepts(prev) && isDeletion(prev, next, caret)) return { value: next, caret, rejected: false }
  const dropped = next.length === prev.length + 1 ? rule.typedDrop : rule.blockDrop
  const cleaned = mapped.replace(dropped, '')
  if (rule.accepts(cleaned)) {
    return { value: cleaned, caret: mapped.slice(0, caret).replace(dropped, '').length, rejected: false }
  }
  return { value: prev, caret: Math.min(prev.length, Math.max(0, caret - (next.length - prev.length))), rejected: true }
}

/** `next` = `prev` ที่ถูกลบช่วงต่อเนื่องหนึ่งช่วงตรงเคอร์เซอร์ (Backspace/Delete/ตัดส่วนที่เลือก) */
function isDeletion(prev: string, next: string, caret: number): boolean {
  return next.length < prev.length && prev.startsWith(next.slice(0, caret)) && prev.endsWith(next.slice(caret))
}

/**
 * ข้อความที่วางลงช่อง → ข้อความที่จะใส่ (ตัดตัวคั่นที่ตัดได้แล้ว) · `null` = ไม่รับทั้งก้อน
 * (มีอักขระนอกชุดที่ช่องรับ เช่น `12x`, `-5`, `฿100`, `1e5`)
 */
export function normalizeNumericPaste(rule: NumericRule, text: string): string | null {
  // ช่องว่างหัวท้ายจากการคัดลอกตัดได้เสมอ (ช่องที่ช่องว่างเป็นตัวคั่น เช่นเลขบัญชี ก็ไม่ควรนับความยาวเกิน)
  const cleaned = rule.mapChars(text).trim().replace(rule.blockDrop, '')
  return cleaned.replace(rule.typedDrop, '') === cleaned ? cleaned : null
}

/**
 * ผลของการวาง `pasted` แทนช่วงที่เลือก `[start, end)` ในค่าเดิม `prev` — `null` = ไม่รับ (ช่องคงค่าเดิม)
 * ผลรวมต้องยังถูกรูป เช่นวาง `1.234` หรือวางจนหลักเกิน ⇒ ไม่รับ (ไม่ตัดท้ายเงียบ)
 */
export function applyNumericPaste(rule: NumericRule, prev: string, start: number, end: number, pasted: string): string | null {
  const cleaned = normalizeNumericPaste(rule, pasted)
  if (cleaned === null) return null
  const next = prev.slice(0, start) + cleaned + prev.slice(end)
  return rule.accepts(next) ? next : null
}
