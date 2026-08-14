import { describe, expect, it } from 'vitest'
import {
  companyUserCreateSchema,
  userCreateSchema,
  userListQuerySchema,
  userStatusChangeSchema,
} from '@/lib/users/schemas'

/** schema เดียวใช้ร่วม FE/BE (Rule 13) — เทสต์กติกาที่ฟอร์มพึ่งพาโดยตรง */

const ROLE_ID = '11111111-1111-4111-8111-111111111111'
const TEAM_ID = '22222222-2222-4222-8222-222222222222'

const valid = {
  roleId: ROLE_ID,
  email: 'Somchai@Example.com',
  fullName: 'สมชาย ใจดี',
  phone: '081-234-5678',
  employeeCode: '',
  teamId: TEAM_ID,
  companyId: null,
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
