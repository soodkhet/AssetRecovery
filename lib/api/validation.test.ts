import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import { requiredIdSchema } from '@/lib/api/validation'
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
