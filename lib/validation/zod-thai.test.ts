import { beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { installThaiZodErrors } from '@/lib/validation/zod-thai'

const messagesOf = (schema: z.ZodType, value: unknown) => {
  const result = schema.safeParse(value)
  return result.success ? [] : result.error.issues.map((issue) => issue.message)
}

beforeAll(() => {
  installThaiZodErrors()
})

describe('ข้อความ validation ภาษาไทยกลาง (preship PS-015)', () => {
  it('ยาวเกิน / สั้นเกิน / ว่าง', () => {
    expect(messagesOf(z.string().max(255), 'ก'.repeat(300))).toEqual(['ยาวเกิน 255 ตัวอักษร'])
    expect(messagesOf(z.string().min(5), 'ab')).toEqual(['ต้องมีอย่างน้อย 5 ตัวอักษร'])
    expect(messagesOf(z.string().min(1), '')).toEqual(['กรุณากรอกข้อมูลช่องนี้'])
    expect(messagesOf(z.object({ name: z.string() }), {})).toEqual(['กรุณากรอกข้อมูลช่องนี้'])
  })

  it('ตัวเลข / รายการ / อีเมล / ตัวเลือก', () => {
    expect(messagesOf(z.number(), 'abc')).toEqual(['ต้องเป็นตัวเลข'])
    expect(messagesOf(z.number().int().max(1_000_000), 2_000_000)).toEqual(['ต้องไม่เกิน 1,000,000'])
    expect(messagesOf(z.number().positive(), 0)).toEqual(['ต้องมากกว่า 0'])
    expect(messagesOf(z.array(z.string()).min(1), [])).toEqual(['ต้องเลือกอย่างน้อย 1 รายการ'])
    expect(messagesOf(z.email(), 'x')).toEqual(['รูปแบบอีเมลไม่ถูกต้อง'])
    expect(messagesOf(z.enum(['a', 'b']), 'c')).toEqual(['กรุณาเลือกจากรายการ'])
  })

  it('ข้อความที่ schema กำหนดเองยังชนะ', () => {
    expect(messagesOf(z.string().max(100, 'ยาวเกิน 100 ตัวอักษร (เลขสัญญา)'), 'x'.repeat(101))).toEqual([
      'ยาวเกิน 100 ตัวอักษร (เลขสัญญา)',
    ])
  })

  it('ไม่มีข้อความภาษาอังกฤษดิบของ Zod หลุดออกมา', () => {
    const messages = [
      ...messagesOf(z.string().max(3), 'abcd'),
      ...messagesOf(z.boolean(), 'x'),
      ...messagesOf(z.string().regex(/^\d+$/), 'abc'),
    ]
    for (const message of messages) expect(message).not.toMatch(/Too big|Too small|Invalid|expected/i)
  })
})
