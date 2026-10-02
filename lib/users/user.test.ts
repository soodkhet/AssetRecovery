import { describe, expect, it } from 'vitest'
import { UserError } from '@/lib/users/errors'
import {
  assertScopeConsistent,
  assertUserDeletable,
  assertUserStatusTransition,
  canTransitionUserStatus,
  normalizePhone,
  describeUserChanges,
  normalizeUserValues,
  referencesInUse,
  requiredScopeFor,
  toUserAuditPayload,
  USER_STATUS_TRANSITIONS,
  type UserValues,
} from '@/lib/users/user'

/** ยามของไฟล์ 08 — §7.1 (conditional required), §7.2 (lifecycle), §10 (ห้ามลบผู้ใช้ที่มีประวัติ) */

const base: UserValues = {
  roleId: '11111111-1111-4111-8111-111111111111',
  username: ' Somchai.J ',
  email: 'Somchai@Example.COM ',
  fullName: '  สมชาย ใจดี ',
  phone: '08-1234-5678',
  employeeCode: '  ',
  teamId: null,
  companyId: null,
}

describe('normalizeUserValues', () => {
  it('username/อีเมลเป็นตัวพิมพ์เล็กเสมอ (ใช้ login — มติ PO 03/10/2569)', () => {
    expect(normalizeUserValues(base).username).toBe('somchai.j')
    expect(normalizeUserValues(base).email).toBe('somchai@example.com')
  })

  it('อีเมลไม่บังคับ — ช่องว่างล้วนกลายเป็น null', () => {
    expect(normalizeUserValues({ ...base, email: '  ' }).email).toBeNull()
    expect(normalizeUserValues({ ...base, email: null }).email).toBeNull()
  })

  it('ตัดช่องว่างหัวท้ายของชื่อ และแปลงช่องว่างล้วนเป็น null', () => {
    const values = normalizeUserValues(base)
    expect(values.fullName).toBe('สมชาย ใจดี')
    expect(values.employeeCode).toBeNull()
  })

  it('เบอร์โทรตัดตัวคั่นทิ้งให้เหลือแต่ตัวเลข (เทียบซ้ำแบบ exact — `08` §10)', () => {
    expect(normalizeUserValues(base).phone).toBe('0812345678')
    expect(normalizePhone('(081) 234-5678')).toBe('0812345678')
    expect(normalizePhone('   ')).toBeNull()
    expect(normalizePhone(null)).toBeNull()
  })
})

describe('conditional required ตาม role group (`08` §7.1)', () => {
  it('inhouse/outsource ต้องมีทีม · finance_company ต้องมีบริษัท · system ไม่ผูกทั้งคู่', () => {
    expect(requiredScopeFor('inhouse')).toBe('team')
    expect(requiredScopeFor('outsource')).toBe('team')
    expect(requiredScopeFor('finance_company')).toBe('company')
    expect(requiredScopeFor('system')).toBeNull()
  })

  it('ขาดทีมของกลุ่ม inhouse → INVALID_USER_SCOPE', () => {
    expect(() => assertScopeConsistent('inhouse', { teamId: null, companyId: null })).toThrowError(UserError)
  })

  it('ขาดบริษัทของกลุ่ม finance_company → INVALID_USER_SCOPE', () => {
    expect(() => assertScopeConsistent('finance_company', { teamId: null, companyId: null })).toThrowError(
      UserError,
    )
  })

  it('กลุ่มระบบที่ถูกยัดทีมมาด้วยก็ผิด (scope resolver จะเพี้ยน — `05` §5)', () => {
    expect(() => assertScopeConsistent('system', { teamId: 'team-1', companyId: null })).toThrowError(UserError)
  })

  it('ผูกผิดฝั่ง (inhouse แต่ส่ง company มา) ถูกปฏิเสธ', () => {
    expect(() => assertScopeConsistent('inhouse', { teamId: 'team-1', companyId: 'company-1' })).toThrowError(
      UserError,
    )
  })

  it('ผูกถูกต้องผ่านทุกกลุ่ม', () => {
    expect(() => assertScopeConsistent('inhouse', { teamId: 'team-1', companyId: null })).not.toThrow()
    expect(() => assertScopeConsistent('finance_company', { teamId: null, companyId: 'c-1' })).not.toThrow()
    expect(() => assertScopeConsistent('system', { teamId: null, companyId: null })).not.toThrow()
  })
})

describe('lifecycle ผู้ใช้ (`08` §7.2)', () => {
  it('active ⇄ suspended และลบได้จากทั้งสองสถานะ', () => {
    expect(canTransitionUserStatus('active', 'suspended')).toBe(true)
    expect(canTransitionUserStatus('suspended', 'active')).toBe(true)
    expect(canTransitionUserStatus('active', 'deleted')).toBe(true)
    expect(canTransitionUserStatus('suspended', 'deleted')).toBe(true)
  })

  it('deleted เป็นปลายทาง — ไม่มีทางกลับผ่าน UI ปกติ', () => {
    expect(USER_STATUS_TRANSITIONS.deleted).toHaveLength(0)
    expect(() => assertUserStatusTransition('deleted', 'active')).toThrowError(UserError)
  })

  it('เปลี่ยนเป็นสถานะเดิมก็ไม่ใช่ transition ที่ถูกต้อง', () => {
    expect(() => assertUserStatusTransition('active', 'active')).toThrowError(UserError)
  })
})

describe('assertUserDeletable (`08` §10 — USER_HAS_HISTORY)', () => {
  it('ไม่มีประวัติเลย → ลบได้', () => {
    expect(() => assertUserDeletable({ assignments: 0, cases_created: 0 })).not.toThrow()
  })

  it('มีเคส/งานภาคสนามค้างประวัติ → ปฏิเสธ พร้อมบอกว่าติดตรงไหน', () => {
    try {
      assertUserDeletable({ assignments: 3, cases_created: 0, evidences: 1 })
      throw new Error('ต้องโยน USER_HAS_HISTORY')
    } catch (error) {
      expect(error).toBeInstanceOf(UserError)
      expect((error as UserError).code).toBe('USER_HAS_HISTORY')
      expect((error as UserError).context).toEqual({ references: { assignments: 3, evidences: 1 } })
    }
  })

  it('referencesInUse คัดเฉพาะรายการที่มากกว่า 0', () => {
    expect(referencesInUse({ a: 0, b: 2 })).toEqual({ b: 2 })
  })
})

describe('describeUserChanges (เหตุผลที่ระบบสร้างตอนแก้ไขผู้ใช้ — มติ PO 03/10/2569)', () => {
  const before = { ...normalizeUserValues(base), roleName: 'ธุรการ' }

  it('เปลี่ยนบทบาท → ระบุชื่อเดิม → ใหม่ · ฟิลด์อื่นระบุชื่อฟิลด์', () => {
    const after = { ...before, roleId: '99999999-9999-4999-8999-999999999999', roleName: 'การเงิน', phone: '0899999999' }
    expect(describeUserChanges(before, after)).toBe('แก้ไขข้อมูลผู้ใช้: บทบาท ธุรการ → การเงิน, เบอร์โทร')
  })

  it('ย้ายทีม + เปลี่ยน username', () => {
    const after = { ...before, teamId: '22222222-2222-4222-8222-222222222222', username: 'somchai.new' }
    expect(describeUserChanges(before, after)).toBe('แก้ไขข้อมูลผู้ใช้: ชื่อผู้ใช้, ทีม')
  })

  it('กดบันทึกโดยไม่ได้แก้อะไร', () => {
    expect(describeUserChanges(before, before)).toBe('แก้ไขข้อมูลผู้ใช้ (ไม่มีฟิลด์เปลี่ยน)')
  })
})

describe('toUserAuditPayload', () => {
  it('ใช้ชื่อคอลัมน์จริง (snake_case) และแนบสถานะ/ชื่อ role เมื่อส่งมา', () => {
    const payload = toUserAuditPayload(normalizeUserValues(base), { status: 'active', roleName: 'Superadmin' })
    expect(payload).toMatchObject({
      username: 'somchai.j',
      email: 'somchai@example.com',
      full_name: 'สมชาย ใจดี',
      phone: '0812345678',
      employee_code: null,
      team_id: null,
      company_id: null,
      status: 'active',
      role_name: 'Superadmin',
    })
  })
})
