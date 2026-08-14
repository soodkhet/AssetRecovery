import { describe, expect, it } from 'vitest'
import { teamCreateSchema, teamListQuerySchema, teamManagerSchema } from '@/lib/teams/schemas'

/** เทสต์ validation ของฟอร์มทีม (`09` §11 · DoD "ทีมไม่มีแผน → สร้างไม่ได้") */

const PLAN_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '22222222-2222-4222-8222-222222222222'

const validInput = {
  name: 'ทีมกรุงเทพ 1',
  side: 'inhouse',
  compensationPlanId: PLAN_ID,
  supervisorId: USER_ID,
  managerIds: [USER_ID],
  provinces: ['กรุงเทพมหานคร'],
  reason: 'ตั้งทีมใหม่ตามโครงสร้างองค์กรปี 2569',
}

function fieldsOf(input: unknown): string[] {
  const parsed = teamCreateSchema.safeParse(input)
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.path.join('.'))
}

describe('teamCreateSchema', () => {
  it('รับค่าที่ครบถ้วน และ default status = active', () => {
    const parsed = teamCreateSchema.parse(validInput)
    expect(parsed.status).toBe('active')
    expect(parsed.managerIds).toEqual([USER_ID])
  })

  it('ทีมไม่มีแผนค่าตอบแทน → สร้างไม่ได้ (`09` §7)', () => {
    const { compensationPlanId: _omitted, ...withoutPlan } = validInput
    expect(fieldsOf(withoutPlan)).toContain('compensationPlanId')
    expect(fieldsOf({ ...validInput, compensationPlanId: null })).toContain('compensationPlanId')
    expect(fieldsOf({ ...validInput, compensationPlanId: '' })).toContain('compensationPlanId')
  })

  it('ต้องเลือกจังหวัดอย่างน้อย 1 จังหวัด', () => {
    expect(fieldsOf({ ...validInput, provinces: [] })).toContain('provinces')
  })

  it('ไม่มีหัวหน้าทีมได้ (nullable) แต่ผู้จัดการต้องเป็น uuid', () => {
    expect(teamCreateSchema.parse({ ...validInput, supervisorId: null }).supervisorId).toBeNull()
    expect(fieldsOf({ ...validInput, managerIds: ['not-a-uuid'] })).toContain('managerIds.0')
  })

  it('reason บังคับทุก mutation (`90` §13 — ทีมกระทบเงิน/สิทธิ์)', () => {
    const { reason: _omitted, ...withoutReason } = validInput
    expect(fieldsOf(withoutReason)).toContain('reason')
    expect(fieldsOf({ ...validInput, reason: 'สั้น' })).toContain('reason')
  })
})

describe('teamManagerSchema / teamListQuerySchema', () => {
  it('เพิ่ม-ถอดผู้จัดการต้องมี reason', () => {
    expect(teamManagerSchema.safeParse({ userId: USER_ID }).success).toBe(false)
    expect(teamManagerSchema.safeParse({ userId: USER_ID, reason: 'ย้ายผู้จัดการตามโครงสร้างใหม่' }).success).toBe(true)
  })

  it('filter default = ทุกสถานะ (ตารางทีมมีปุ่มกรอง Active/Inactive เอง)', () => {
    expect(teamListQuerySchema.parse({}).status).toBe('all')
    expect(teamListQuerySchema.parse({ side: 'outsource', province: 'ภูเก็ต' }).side).toBe('outsource')
  })
})
