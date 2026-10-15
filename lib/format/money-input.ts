/**
 * กติกาช่องกรอกยอดเงิน (บาท) ระหว่างพิมพ์/วาง — pure ใช้กับ `<MoneyInput>` (มติผู้ใช้ 15/10/2569)
 *
 * - รับเฉพาะตัวเลข 0–9 และจุดทศนิยม 1 จุด · ทศนิยมไม่เกิน 2 ตำแหน่ง (เงินเก็บเป็น INTEGER satang — Rule 01)
 * - ติดลบไม่ได้ (ทุกช่องเงินในระบบเป็นค่าบวก ทิศทางอยู่ที่ประเภทรายการ)
 * - พิมพ์อักขระอื่น ⇒ ไม่เข้าช่อง · พิมพ์จนทศนิยมเกิน 2 ตำแหน่ง ⇒ ไม่รับตัวที่พิมพ์ (ไม่ปัด/ตัดเงียบ)
 * - วาง/ค่าที่เข้าเป็นก้อน ⇒ ตัดคอมมาและช่องว่างได้ · ยังมีอักขระอื่น/ผลลัพธ์ผิดรูป ⇒ ไม่รับทั้งก้อน (ไม่ตัดเงียบให้กลายเป็นยอดอื่น)
 *
 * ⚠️ ที่นี่แค่กรองข้อความในช่อง — แปลงเป็นสตางค์ยังใช้ `parseBahtInput()` (`lib/format/money.ts`) ที่เดียว
 * และ server ยังตรวจซ้ำด้วย Zod (`satangSchema()`) เหมือนเดิม
 */

/** ข้อความในช่องเงินที่ยอมให้อยู่ในช่องได้ (รวมสถานะกำลังพิมพ์ เช่น `''`, `'12.'`, `'.5'`) */
const MONEY_TEXT_PATTERN = /^\d*(\.\d{0,2})?$/

/** ข้อความนี้อยู่ในช่องเงินได้หรือไม่ (ตัวเลข + จุด 1 จุด + ทศนิยม ≤ 2 ตำแหน่ง · ว่างได้) */
export function isMoneyInputText(text: string): boolean {
  return MONEY_TEXT_PATTERN.test(text)
}

/** ผลของการเปลี่ยนค่าในช่อง — `value === prev` และ `rejected` = ไม่รับ · `caret` = ตำแหน่งเคอร์เซอร์ที่ควรเป็น */
export interface MoneyChange {
  value: string
  caret: number
  rejected: boolean
}

/**
 * ค่าที่ช่องควรเป็นหลังผู้ใช้แก้ช่อง (`next` = ค่าที่ browser จะใส่ · `caret` = เคอร์เซอร์ใน `next`) — `prev` = ค่าเดิมในช่อง
 * - ถูกรูปแล้ว ⇒ `next`
 * - พิมพ์เพิ่มทีละ 1 ตัว (ยาวขึ้น 1) ⇒ ทิ้งอักขระที่ไม่ใช่ตัวเลข/จุด (ตัวอักษรที่หลุด beforeinput มา) ถ้ายังผิดรูป (จุดซ้อน/ทศนิยมเกิน 2) ⇒ คงค่าเดิม
 * - ค่าที่เข้าเป็นก้อน (autofill/เสนอคำ/พิมพ์ด้วยเสียง/IME) ⇒ กติกาเดียวกับวาง: ตัดได้แค่คอมมา/ช่องว่าง มีอักขระอื่น ⇒ ไม่รับทั้งก้อน
 */
export function moneyChange(prev: string, next: string, caret: number = next.length): MoneyChange {
  if (isMoneyInputText(next)) return { value: next, caret, rejected: false }
  const dropped = next.length === prev.length + 1 ? /[^\d.]/g : /[,\s]/g
  const cleaned = next.replace(dropped, '')
  if (isMoneyInputText(cleaned)) {
    return { value: cleaned, caret: next.slice(0, caret).replace(dropped, '').length, rejected: false }
  }
  return { value: prev, caret: Math.min(prev.length, Math.max(0, caret - (next.length - prev.length))), rejected: true }
}

/** `moneyChange()` แบบเอาเฉพาะค่า */
export function sanitizeTypedMoney(prev: string, next: string): string {
  return moneyChange(prev, next).value
}

/**
 * ข้อความที่วางลงช่องเงิน → ข้อความที่จะใส่ (ตัดคอมมา/ช่องว่างแล้ว) · `null` = ไม่รับทั้งก้อน
 * (มีอักขระอื่นนอกจากตัวเลข/จุด/คอมมา/ช่องว่าง เช่น `12x`, `-5`, `฿100`)
 */
export function normalizePastedMoney(text: string): string | null {
  const cleaned = text.replace(/[,\s]/g, '')
  return /^[\d.]*$/.test(cleaned) ? cleaned : null
}

/**
 * ผลของการวาง `pasted` แทนช่วงที่เลือก `[start, end)` ในค่าเดิม `prev` — `null` = ไม่รับ (ช่องคงค่าเดิม)
 * ผลรวมต้องยังถูกรูป เช่นวาง `1.234` หรือวาง `.5` ต่อท้าย `1.2` ⇒ ไม่รับ
 */
export function applyMoneyPaste(prev: string, start: number, end: number, pasted: string): string | null {
  const cleaned = normalizePastedMoney(pasted)
  if (cleaned === null) return null
  const next = prev.slice(0, start) + cleaned + prev.slice(end)
  return isMoneyInputText(next) ? next : null
}
