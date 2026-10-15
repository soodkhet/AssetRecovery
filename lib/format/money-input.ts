/**
 * กติกาช่องกรอกยอดเงิน (บาท) ระหว่างพิมพ์/วาง — ใช้กับ `<MoneyInput>` (มติผู้ใช้ 15/10/2569)
 *
 * - รับเฉพาะตัวเลข 0–9 และจุดทศนิยม 1 จุด · ทศนิยมไม่เกิน 2 ตำแหน่ง (เงินเก็บเป็น INTEGER satang — Rule 01)
 * - ติดลบไม่ได้ (ทุกช่องเงินในระบบเป็นค่าบวก ทิศทางอยู่ที่ประเภทรายการ)
 * - พิมพ์อักขระอื่น ⇒ ไม่เข้าช่อง · พิมพ์จนทศนิยมเกิน 2 ตำแหน่ง ⇒ ไม่รับตัวที่พิมพ์ (ไม่ปัด/ตัดเงียบ)
 * - วาง/ค่าที่เข้าเป็นก้อน ⇒ ตัดคอมมาและช่องว่างได้ · ยังมีอักขระอื่น/ผลลัพธ์ผิดรูป ⇒ ไม่รับทั้งก้อน (ไม่ตัดเงียบให้กลายเป็นยอดอื่น)
 *
 * ตรรกะอยู่ที่ `lib/format/numeric-input.ts` (ชนิด `money`) — ไฟล์นี้เป็นชื่อเรียกเฉพาะช่องเงิน
 * ⚠️ แปลงเป็นสตางค์ยังใช้ `parseBahtInput()` (`lib/format/money.ts`) ที่เดียว และ server ยังตรวจซ้ำด้วย Zod (`satangSchema()`)
 */
import { applyNumericPaste, normalizeNumericPaste, numericChange, numericRule, type NumericChange } from '@/lib/format/numeric-input'

/** กติกาช่องเงิน (ชนิด `money`) */
export const MONEY_RULE = numericRule({ kind: 'money' })

/** ข้อความนี้อยู่ในช่องเงินได้หรือไม่ (ตัวเลข + จุด 1 จุด + ทศนิยม ≤ 2 ตำแหน่ง · ว่างได้) */
export function isMoneyInputText(text: string): boolean {
  return MONEY_RULE.accepts(text)
}

/** ผลของการเปลี่ยนค่าในช่อง — `value === prev` และ `rejected` = ไม่รับ · `caret` = ตำแหน่งเคอร์เซอร์ที่ควรเป็น */
export type MoneyChange = NumericChange

/** ค่าที่ช่องเงินควรเป็นหลังผู้ใช้แก้ช่อง — ดู `numericChange()` */
export function moneyChange(prev: string, next: string, caret: number = next.length): MoneyChange {
  return numericChange(MONEY_RULE, prev, next, caret)
}

/** `moneyChange()` แบบเอาเฉพาะค่า */
export function sanitizeTypedMoney(prev: string, next: string): string {
  return moneyChange(prev, next).value
}

/** ข้อความที่วางลงช่องเงิน → ข้อความที่จะใส่ (ตัดคอมมา/ช่องว่างแล้ว) · `null` = ไม่รับทั้งก้อน */
export function normalizePastedMoney(text: string): string | null {
  return normalizeNumericPaste(MONEY_RULE, text)
}

/** ผลของการวาง `pasted` แทนช่วงที่เลือก `[start, end)` ในค่าเดิม `prev` — `null` = ไม่รับ */
export function applyMoneyPaste(prev: string, start: number, end: number, pasted: string): string | null {
  return applyNumericPaste(MONEY_RULE, prev, start, end, pasted)
}
