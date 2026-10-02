import { describe, expect, it } from 'vitest'
import {
  companyUserCreateSchema,
  userCreateSchema,
  userListQuerySchema,
  userPasswordResetSchema,
  userStatusChangeSchema,
  userUpdateSchema,
} from '@/lib/users/schemas'

/** schema เดียวใช้ร่วม FE/BE (Rule 13) — เทสต์กติกาที่ฟอร์มพึ่งพาโดยตรง */

const ROLE_ID = '11111111-1111-4111-8111-111111111111'
const TEAM_ID = '22222222-2222-4222-8222-222222222222'

const valid = {
  roleId: ROLE_ID,
  username: 'Somchai.J',
  email: 'Somchai@Example.com',
  fullName: 'สมชาย ใจดี',
  phone: '081-234-5678',
  employeeCode: '',
  teamId: TEAM_ID,
  companyId: null,
  password: 'assetrecovery1',
  confirmPassword: 'assetrecovery1',
  reason: 'เพิ่มพนักงานใหม่เข้าทีมกรุงเทพ 1',
}

describe('userCreateSchema', () => {
  it('รับค่าปกติ + normalize อีเมล/เบอร์โทร และแปลงช่องว่างเป็น null', () => {
    const parsed = userCreateSchema.parse(valid)
    expect(parsed.email).toBe('somchai@example.com')
    expect(parsed.phone).toBe('0812345678')
    expect(parsed.employeeCode).toBeNull()
  })

  it('ไม่มีเบอร์โทรก็ได้ (optional ตาม `08` §7.1)', () => {
    const parsed = userCreateSchema.parse({ ...valid, phone: null })
    expect(parsed.phone).toBeNull()
  })

  it('เบอร์โทรสั้น/ยาวเกินถูกปฏิเสธ', () => {
    expect(userCreateSchema.safeParse({ ...valid, phone: '0812345' }).success).toBe(false)
    expect(userCreateSchema.safeParse({ ...valid, phone: '08123456789' }).success).toBe(false)
  })

  it('อีเมลผิดรูปแบบถูกปฏิเสธ', () => {
    expect(userCreateSchema.safeParse({ ...valid, email: 'not-an-email' }).success).toBe(false)
  })

  it('username บังคับ + normalize ตัวพิมพ์เล็ก (มติ PO 03/10/2569)', () => {
    expect(userCreateSchema.parse(valid).username).toBe('somchai.j')
    expect(userCreateSchema.safeParse({ ...valid, username: '' }).success).toBe(false)
    expect(userCreateSchema.safeParse({ ...valid, username: 'มี@อีเมล' }).success).toBe(false)
  })

  it('อีเมลไม่บังคับ — ว่าง/ไม่ส่งมา = null', () => {
    expect(userCreateSchema.parse({ ...valid, email: '' }).email).toBeNull()
    const { email: _omit, ...withoutEmail } = valid
    expect(userCreateSchema.parse(withoutEmail).email).toBeNull()
  })

  it('ตอนสร้างต้องตั้งรหัสผ่านตามนโยบาย + ยืนยันให้ตรง', () => {
    expect(userCreateSchema.safeParse({ ...valid, password: undefined, confirmPassword: undefined }).success).toBe(false)
    expect(userCreateSchema.safeParse({ ...valid, password: 'short1', confirmPassword: 'short1' }).success).toBe(false)
    const mismatch = userCreateSchema.safeParse({ ...valid, confirmPassword: 'assetrecovery2' })
    expect(mismatch.success).toBe(false)
    expect(mismatch.error?.issues[0]?.path).toEqual(['confirmPassword'])
  })

  it('`reason` บังคับทุก mutation (ผู้ใช้กระทบสิทธิ์ — `90` §13)', () => {
    expect(userCreateSchema.safeParse({ ...valid, reason: '' }).success).toBe(false)
    expect(userCreateSchema.safeParse({ ...valid, reason: 'สั้น' }).success).toBe(false)
  })

  it('ฟอร์มส่ง status มาไม่มีผล — เปลี่ยนสถานะต้องผ่าน endpoint แยก (Rule 04)', () => {
    const parsed = userCreateSchema.parse({ ...valid, status: 'suspended' })
    expect('status' in parsed).toBe(false)
  })
})

describe('companyUserCreateSchema', () => {
  it('ไม่รับ `companyId`/`teamId` จาก body — บริษัทมาจาก path เสมอ', () => {
    const parsed = companyUserCreateSchema.parse({
      ...valid,
      teamId: null,
      companyId: '33333333-3333-4333-8333-333333333333',
    })
    expect('companyId' in parsed).toBe(false)
    expect('teamId' in parsed).toBe(false)
  })
})

describe('userUpdateSchema', () => {
  it('แก้ไขผู้ใช้ไม่รับรหัสผ่าน — ตั้งใหม่ผ่าน endpoint แยกเท่านั้น', () => {
    const parsed = userUpdateSchema.parse(valid)
    expect('password' in parsed).toBe(false)
    expect('confirmPassword' in parsed).toBe(false)
  })
})

describe('userPasswordResetSchema', () => {
  it('รหัสผ่านใหม่ตามนโยบาย + เหตุผลบังคับ', () => {
    const good = { password: 'newpass123', confirmPassword: 'newpass123', reason: 'ผู้ใช้ลืมรหัสผ่าน' }
    expect(userPasswordResetSchema.safeParse(good).success).toBe(true)
    expect(userPasswordResetSchema.safeParse({ ...good, reason: '' }).success).toBe(false)
    expect(userPasswordResetSchema.safeParse({ ...good, confirmPassword: 'other1234' }).success).toBe(false)
  })
})

describe('userStatusChangeSchema', () => {
  it('ระงับ/เปิดใช้งานกลับต้องมีเหตุผลเสมอ (`08` §13)', () => {
    expect(userStatusChangeSchema.safeParse({ reason: 'พนักงานลาออก' }).success).toBe(true)
    expect(userStatusChangeSchema.safeParse({}).success).toBe(false)
  })
})

describe('userListQuerySchema', () => {
  it('ค่าเริ่มต้นของ status = all (ไม่รวมบัญชีที่ถูกลบ — กรองที่ชั้น query)', () => {
    expect(userListQuerySchema.parse({}).status).toBe('all')
  })

  it('roleGroup รับหลายค่าคั่นด้วย comma (แท็บเจ้าหน้าที่ = inhouse+outsource)', () => {
    expect(userListQuerySchema.parse({ roleGroup: 'inhouse,outsource' }).roleGroup).toEqual([
      'inhouse',
      'outsource',
    ])
  })

  it('roleGroup ที่ไม่รู้จักถูกปฏิเสธ', () => {
    expect(userListQuerySchema.safeParse({ roleGroup: 'inhouse,ghost' }).success).toBe(false)
  })
})
