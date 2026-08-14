import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ALWAYS_SENSITIVE_TARGETS,
  FIELD_SENSITIVE_TARGETS,
  NON_SENSITIVE_TARGETS,
  TRANSACTIONAL_SENSITIVE_TARGETS,
  reasonRequirement,
  targetSensitivity,
} from '@/lib/audit/reason-policy'

describe('reasonRequirement — ข้อ 1: action ที่เป็นการแทรกแซง (`90` §13)', () => {
  it.each(['delete', 'reject', 'lock', 'unlock'] as const)('action `%s` ต้องมี reason แม้ตารางจะไม่อ่อนไหว', (action) => {
    expect(reasonRequirement({ action, targetType: 'case_documents', actorId: 'u1' }).required).toBe(true)
  })

  it('action ปกติของตารางไม่อ่อนไหว ไม่ต้องมี reason', () => {
    expect(reasonRequirement({ action: 'create', targetType: 'check_ins', actorId: 'u1' }).required).toBe(false)
    expect(reasonRequirement({ action: 'update', targetType: 'case_documents', actorId: 'u1' }).required).toBe(false)
  })
})

describe('reasonRequirement — ข้อ 2: ตาราง master/ตั้งค่า ต้องมี reason ทุก mutation', () => {
  it.each(Object.keys(ALWAYS_SENSITIVE_TARGETS))('`%s` create ก็ต้องมี reason', (targetType) => {
    const result = reasonRequirement({ action: 'create', targetType, actorId: 'u1' })
    expect(result.required).toBe(true)
    expect(result.sensitivity).toBe(ALWAYS_SENSITIVE_TARGETS[targetType])
  })

  it('เปลี่ยนอัตราค่าตอบแทน (เงิน) และสิทธิ์ของ role ถูกจัดหมวดถูกต้อง', () => {
    expect(targetSensitivity('compensation_plans')).toBe('money')
    expect(targetSensitivity('role_capabilities')).toBe('permission')
    expect(targetSensitivity('bank_accounts')).toBe('bank')
    expect(targetSensitivity('vat_rate_history')).toBe('tax')
    expect(targetSensitivity('accounting_periods')).toBe('period_lock')
  })
})

describe('reasonRequirement — ข้อ 3: ตารางธุรกรรม flow ปกติไม่ต้องมี แต่แก้ย้อนหลังต้องมี', () => {
  it('ระบบสร้าง expense/revenue ตาม flow ไม่ต้องมี reason', () => {
    expect(reasonRequirement({ action: 'create', targetType: 'expenses', actorId: 'u1' }).required).toBe(false)
    expect(reasonRequirement({ action: 'approve', targetType: 'expenses', actorId: 'u1' }).required).toBe(false)
    expect(reasonRequirement({ action: 'confirm', targetType: 'handover_lots', actorId: 'u1' }).required).toBe(false)
  })

  it.each(Object.keys(TRANSACTIONAL_SENSITIVE_TARGETS))('แก้ `%s` ด้วยมือ (update) ต้องมี reason', (targetType) => {
    expect(reasonRequirement({ action: 'update', targetType, actorId: 'u1' }).required).toBe(true)
  })
})

describe('reasonRequirement — ข้อ 4: ตารางที่อ่อนไหวเฉพาะบางฟิลด์', () => {
  it('เปลี่ยน role ของ user ต้องมี reason (กระทบสิทธิ์)', () => {
    const result = reasonRequirement({
      action: 'update',
      targetType: 'users',
      changedFields: ['roleId'],
      actorId: 'u1',
    })
    expect(result).toMatchObject({ required: true, sensitivity: 'permission' })
  })

  it('แก้เบอร์โทร user ไม่ต้องมี reason', () => {
    expect(
      reasonRequirement({ action: 'update', targetType: 'users', changedFields: ['phone'], actorId: 'u1' }).required,
    ).toBe(false)
  })

  it('เทียบชื่อฟิลด์ข้าม snake_case / camelCase ได้', () => {
    expect(
      reasonRequirement({ action: 'update', targetType: 'users', changedFields: ['role_id'], actorId: 'u1' }).required,
    ).toBe(true)
  })

  it('แก้ snapshot ค่าบริการของเคสต้องมี reason (กระทบเงิน)', () => {
    expect(
      reasonRequirement({
        action: 'update',
        targetType: 'cases',
        changedFields: ['serviceFeeBaseSatang'],
        actorId: 'u1',
      }),
    ).toMatchObject({ required: true, sensitivity: 'money' })
  })

  it('ไม่ส่ง snapshot มาเลย = ไม่รู้ว่าแตะฟิลด์ไหน → บังคับ reason ไว้ก่อน', () => {
    expect(reasonRequirement({ action: 'update', targetType: 'users', actorId: 'u1' }).required).toBe(true)
  })

  it('สร้าง user/ทีม/บริษัทใหม่ ไม่ต้องมี reason (ฟอร์มตามไฟล์ 08/09/10 ไม่มีช่องเหตุผล)', () => {
    expect(reasonRequirement({ action: 'create', targetType: 'users', actorId: 'u1' }).required).toBe(false)
    expect(reasonRequirement({ action: 'create', targetType: 'teams', actorId: 'u1' }).required).toBe(false)
    expect(reasonRequirement({ action: 'create', targetType: 'finance_companies', actorId: 'u1' }).required).toBe(false)
  })
})

describe('reasonRequirement — background job ต้อง trace กลับผู้สั่งงานได้ (`90` §13)', () => {
  it('actor เป็น system (null) ต้องระบุ job id ใน reason', () => {
    expect(reasonRequirement({ action: 'create', targetType: 'notifications', actorId: null })).toMatchObject({
      required: true,
      rule: 'system_actor',
    })
  })

  it('failed login (ยังไม่รู้ตัวตน) ไม่ต้องมี reason', () => {
    expect(reasonRequirement({ action: 'login', targetType: 'users', actorId: null }).required).toBe(false)
    expect(reasonRequirement({ action: 'logout', targetType: 'users', actorId: null }).required).toBe(false)
  })
})

describe('ยามความครบถ้วน — ทุกตารางใน schema.prisma ต้องถูกจัดหมวด', () => {
  /**
   * ทำไมต้องมียามนี้: ตารางใหม่ที่ยังไม่จัดหมวดจะ "ไม่ต้องมี reason" โดยปริยาย —
   * ถ้าเป็นตารางเงิน/ภาษี ก็หลุดกติกา `90` §13 เงียบ ๆ โดยไม่มีอะไรฟ้อง
   */
  const schema = readFileSync(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8')
  // ไล่ทีละบรรทัดแทน regex ข้าม block — comment `///` มีวงเล็บปีกกาปนอยู่ (เช่นตัวอย่าง JSON ใน expenses)
  const tables: string[] = []
  let insideModel = false
  for (const line of schema.split('\n')) {
    if (/^model\s+\w+\s*\{/.test(line)) insideModel = true
    else if (line.startsWith('}')) insideModel = false
    // enum ก็ใช้ @@map เหมือนกัน — เก็บเฉพาะที่อยู่ใน block `model`
    else if (insideModel) {
      const match = /@@map\("([a-z_]+)"\)/.exec(line)
      if (match?.[1]) tables.push(match[1])
    }
  }

  const classified = new Set([
    ...Object.keys(ALWAYS_SENSITIVE_TARGETS),
    ...Object.keys(TRANSACTIONAL_SENSITIVE_TARGETS),
    ...Object.keys(FIELD_SENSITIVE_TARGETS),
    ...NON_SENSITIVE_TARGETS,
  ])

  it('พบตารางใน schema มากกว่า 50 ตาราง (กันเทสต์ผ่านเพราะ regex พัง)', () => {
    expect(tables.length).toBeGreaterThan(50)
  })

  it('ไม่มีตารางไหนตกหล่นจากการจัดหมวด reason policy', () => {
    const missing = tables.filter((table) => !classified.has(table))
    expect(missing, `ตารางใหม่ต้องจัดหมวดใน lib/audit/reason-policy.ts: ${missing.join(', ')}`).toEqual([])
  })

  it('ไม่มีตารางที่ถูกจัดซ้ำสองหมวด', () => {
    const all = [
      ...Object.keys(ALWAYS_SENSITIVE_TARGETS),
      ...Object.keys(TRANSACTIONAL_SENSITIVE_TARGETS),
      ...Object.keys(FIELD_SENSITIVE_TARGETS),
      ...NON_SENSITIVE_TARGETS,
    ]
    const duplicated = all.filter((table, index) => all.indexOf(table) !== index)
    expect(duplicated).toEqual([])
  })

  it('ทุกตารางที่จัดหมวดไว้ต้องมีอยู่จริงใน schema (กันชื่อสะกดผิด)', () => {
    const unknown = [...classified].filter((table) => !tables.includes(table))
    expect(unknown, `ชื่อตารางไม่ตรงกับ schema.prisma: ${unknown.join(', ')}`).toEqual([])
  })
})
