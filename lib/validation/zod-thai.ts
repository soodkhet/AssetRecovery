import { z } from 'zod'

/**
 * ข้อความ validation ภาษาไทยกลางของ Zod — preship audit PS-015
 *
 * schema หลายตัวไม่ได้ใส่ข้อความเอง (97 จุดของ `.max()`) ⇒ ผู้ใช้เห็น "Too big: expected string to have <=255 characters"
 * ใต้ช่องภาษาไทย · ติดตั้งครั้งเดียวต่อ runtime (Zod เก็บ config ไว้ที่ `globalThis`):
 * server = `instrumentation.ts` · browser = `instrumentation-client.ts`
 * ข้อความที่ schema กำหนดเองยังชนะเสมอ · กรณีที่ไม่ได้แปลงที่นี่ใช้ locale ไทยของ Zod
 */

type ZodIssue = Parameters<NonNullable<z.core.$ZodConfig['customError']>>[0]

const fmt = (value: number | bigint) => Number(value).toLocaleString('th-TH')

export function thaiZodMessage(issue: ZodIssue): string | undefined {
  switch (issue.code) {
    case 'invalid_type':
      if (issue.input === undefined || issue.input === null) return 'กรุณากรอกข้อมูลช่องนี้'
      if (issue.expected === 'number' || issue.expected === 'int') return 'ต้องเป็นตัวเลข'
      if (issue.expected === 'date') return 'วันที่ไม่ถูกต้อง'
      return 'รูปแบบข้อมูลไม่ถูกต้อง'
    case 'too_big':
      if (issue.origin === 'string') return `ยาวเกิน ${fmt(issue.maximum)} ตัวอักษร`
      if (issue.origin === 'array' || issue.origin === 'set') return `เลือกได้ไม่เกิน ${fmt(issue.maximum)} รายการ`
      if (issue.origin === 'number' || issue.origin === 'int' || issue.origin === 'bigint') {
        return issue.inclusive === false ? `ต้องน้อยกว่า ${fmt(issue.maximum)}` : `ต้องไม่เกิน ${fmt(issue.maximum)}`
      }
      return undefined
    case 'too_small':
      if (issue.origin === 'string') {
        return Number(issue.minimum) <= 1 ? 'กรุณากรอกข้อมูลช่องนี้' : `ต้องมีอย่างน้อย ${fmt(issue.minimum)} ตัวอักษร`
      }
      if (issue.origin === 'array' || issue.origin === 'set') return `ต้องเลือกอย่างน้อย ${fmt(issue.minimum)} รายการ`
      if (issue.origin === 'number' || issue.origin === 'int' || issue.origin === 'bigint') {
        return issue.inclusive === false ? `ต้องมากกว่า ${fmt(issue.minimum)}` : `ต้องไม่น้อยกว่า ${fmt(issue.minimum)}`
      }
      return undefined
    case 'invalid_format':
      if (issue.format === 'email') return 'รูปแบบอีเมลไม่ถูกต้อง'
      if (issue.format === 'uuid' || issue.format === 'guid') return 'รูปแบบรหัสไม่ถูกต้อง'
      return 'รูปแบบข้อมูลไม่ถูกต้อง'
    case 'invalid_value':
      return 'กรุณาเลือกจากรายการ'
    default:
      return undefined
  }
}

let installed = false

export function installThaiZodErrors(): void {
  if (installed) return
  installed = true
  z.config(z.locales.th())
  z.config({ customError: thaiZodMessage })
}
