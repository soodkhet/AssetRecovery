import type { SettingAssumptionKey } from '@/lib/settings/assumptions'

/**
 * คำอธิบายค่าตั้งบนหน้าจอ (มติ PO 06/10/2569 U108) — โครงข้อมูลกลางที่ `<SettingHelp>` แสดง
 *
 * ทุกค่าตั้งด้านบัญชี/การเงินต้องตอบ 4 คำถามให้คนที่ไม่ใช่นักบัญชีอ่านเข้าใจ:
 * 1. `what` — คืออะไร ใช้ทำอะไร
 * 2. `options` — เลือกแต่ละแบบแล้วเกิดอะไร
 * 3. `examples` — ตัวอย่างตัวเลข (เฉพาะค่าที่กระทบเงิน) **คำนวณด้วยสูตรจริงของระบบ** จากค่าที่กำลังเลือกในฟอร์ม
 * 4. `who` + `when` — ใครแก้ได้ และมีผลเมื่อไร
 *
 * ⚠️ ข้อความทุกช่องเป็นข้อความที่ผู้ใช้เห็น — ห้ามมีเลขอ้างอิงสเปค (Rule 05) · `help.test.ts` ตรวจทุกตัว
 */

export interface SettingHelpOption {
  label: string
  effect: string
}

export interface SettingHelpExampleLine {
  label: string
  value: string
  /** บรรทัดผลลัพธ์ (ตัวหนา) */
  strong?: boolean
}

export interface SettingHelpExample {
  title: string
  lines: SettingHelpExampleLine[]
  note?: string
}

export interface SettingHelpTable {
  headers: string[]
  rows: string[][]
}

export interface SettingHelpContent {
  /** หัวกล่อง เช่น "ฐานภาษีหัก ณ ที่จ่ายคืออะไร" */
  title: string
  what: string
  options?: SettingHelpOption[]
  examples?: SettingHelpExample[]
  table?: SettingHelpTable
  who: string
  when: string
  /**
   * มติ PO 07/10/2569 U140 — ค่าตั้งนี้เป็นสมมติฐานรอนักบัญชียืนยัน (ทะเบียน `lib/settings/assumptions.ts`)
   * ⇒ `<SettingHelp>` แสดงป้าย "รอนักบัญชียืนยัน" จนกว่าบัญชีจะกดยืนยันแล้ว · เป็นรหัส ไม่ใช่ข้อความ
   */
  assumption?: SettingAssumptionKey
}
