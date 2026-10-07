import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { periodReasonSchema } from '@/lib/accounting/schemas'
import { dateOnlySchema, requiredIdSchema, toFieldErrors } from '@/lib/api/validation'
import { financeCompanyFieldsSchema } from '@/lib/finance-companies/schemas'
import { payeeCreateSchema } from '@/lib/payees/schemas'
import { teamFieldsSchema } from '@/lib/teams/schemas'
import { userFieldsSchema } from '@/lib/users/schemas'

/**
 * UAT BUG-003/BUG-017 — dropdown บังคับที่ยังไม่เลือกต้องได้ "กรุณาเลือก…" ภาษาไทย
 * ไม่ใช่ข้อความดิบของ Zod ("Invalid input: expected string, received undefined") หรือ "รูปแบบรหัสไม่ถูกต้อง"
 */

const VALID_ID = '00000000-0000-4000-8000-000000000001'

function messageAt(schema: z.ZodType, input: unknown, path: string): string | undefined {
  const parsed = schema.safeParse(input)
  if (parsed.success) return undefined
  return parsed.error.issues.find((issue) => issue.path.join('.') === path)?.message
}

describe('requiredIdSchema()', () => {
  const schema = requiredIdSchema('บทบาท')

  it.each([undefined, null, ''])('ยังไม่เลือก (%s) → "กรุณาเลือกบทบาท"', (input) => {
    const parsed = schema.safeParse(input)
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues[0]?.message).toBe('กรุณาเลือกบทบาท')
  })

  it('ค่าที่ไม่ใช่ UUID → ข้อความรูปแบบเดิม', () => {
    expect(schema.safeParse('abc').error?.issues[0]?.message).toBe('รูปแบบรหัสไม่ถูกต้อง')
  })

  it('UUID ถูกต้องผ่าน', () => {
    expect(schema.safeParse(VALID_ID).success).toBe(true)
  })

  it('BUG-173: id จาก seed (ไม่ระบุ version RFC) ผ่าน', () => {
    expect(schema.safeParse('00000000-0000-0000-0000-000000000002').success).toBe(true)
  })
})

describe('dropdown บังคับของฟอร์ม master data', () => {
  it.each([
    ['บทบาทของผู้ใช้', userFieldsSchema, 'roleId', 'กรุณาเลือกบทบาท'],
    ['แผนค่าตอบแทนของทีม', teamFieldsSchema, 'compensationPlanId', 'กรุณาเลือกแผนค่าตอบแทน'],
    ['เทมเพลตค่าบริการของบริษัท', financeCompanyFieldsSchema, 'serviceFeeTemplateId', 'กรุณาเลือกเทมเพลตค่าบริการ'],
    ['ผู้ใช้เจ้าของ payee', payeeCreateSchema, 'userId', 'กรุณาเลือกผู้ใช้'],
  ] as const)('%s ไม่เลือก → %s', (_label, schema, path, expected) => {
    expect(messageAt(schema, {}, path)).toBe(expected)
    expect(messageAt(schema, { [path]: '' }, path)).toBe(expected)
  })
})

/** UAT BUG-122 — ข้อความที่ Zod สร้างเอง (อังกฤษ) ต้องถูกแปลงเป็นไทยก่อนถึงผู้ใช้ */
describe('toFieldErrors() — ข้อความไทยเสมอ', () => {
  it('ส่งงวดโดยไม่มี reason → ข้อความไทย ไม่ใช่ Zod อังกฤษดิบ', () => {
    const parsed = periodReasonSchema.safeParse({})
    if (parsed.success) throw new Error('ต้อง fail')
    expect(toFieldErrors(parsed.error).reason).toBe('กรุณาระบุข้อมูลช่องนี้')
  })

  it('ข้อความไทยที่ schema ตั้งเองคงเดิม', () => {
    const parsed = periodReasonSchema.safeParse({ reason: '   ' })
    if (parsed.success) throw new Error('ต้อง fail')
    expect(toFieldErrors(parsed.error).reason).toBe('ต้องระบุเหตุผล')
  })

  const cases: ReadonlyArray<[z.ZodType, Record<string, unknown>, string]> = [
    [z.object({ a: z.string() }), { a: 5 }, 'รูปแบบข้อมูลไม่ถูกต้อง'],
    [z.object({ a: z.string().max(2) }), { a: 'abc' }, 'ยาวเกิน 2 ตัวอักษร'],
    [z.object({ a: z.enum(['x', 'y']) }), { a: 'z' }, 'ค่าที่เลือกไม่อยู่ในตัวเลือกที่ระบบรองรับ'],
    [z.object({ a: z.string().uuid() }), { a: 'nope' }, 'รูปแบบข้อมูลไม่ถูกต้อง'],
    [z.object({ a: z.number().min(3) }), { a: 1 }, 'ค่าต้องไม่น้อยกว่า 3'],
  ]
  it.each(cases)('แปลงข้อความ default ของ Zod เป็นไทย (%#)', (schema, input, expected) => {
    const parsed = schema.safeParse(input)
    if (parsed.success) throw new Error('ต้อง fail')
    expect(toFieldErrors(parsed.error).a).toBe(expected)
  })
})

describe('dateOnlySchema — ข้อความไม่มีศัพท์รูปแบบ (preship R3-032)', () => {
  const schema = z.object({ lineDate: dateOnlySchema('วันที่') })
  const messageOf = (input: unknown) => {
    const parsed = schema.safeParse(input)
    return parsed.success ? null : toFieldErrors(parsed.error).lineDate
  }

  it('ว่าง / ไม่ส่งมา ⇒ "กรุณาเลือก…"', () => {
    expect(messageOf({ lineDate: '' })).toBe('กรุณาเลือกวันที่')
    expect(messageOf({})).toBe('กรุณาเลือกวันที่')
  })

  it('ส่งมาแต่ผิดรูป ⇒ บอกให้เลือกจากปฏิทิน ไม่มี YYYY-MM-DD', () => {
    const message = messageOf({ lineDate: '08/10/2569' })
    expect(message).toMatch(/เลือกวันที่จากปฏิทิน/)
    expect(message).not.toMatch(/YYYY/)
  })

  it('วันที่ไม่มีจริงยังถูกปฏิเสธ · วันที่ถูกต้องแปลงเป็นเที่ยงคืน UTC', () => {
    expect(messageOf({ lineDate: '2026-02-30' })).toMatch(/ไม่ใช่วันที่ที่มีอยู่จริง/)
    const parsed = schema.parse({ lineDate: '2026-10-08' })
    expect(parsed.lineDate.toISOString()).toBe('2026-10-08T00:00:00.000Z')
  })
})
