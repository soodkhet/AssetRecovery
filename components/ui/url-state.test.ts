import { describe, expect, it } from 'vitest'
import { mergeSearchParams, pickPage, pickParam, pickUuid } from '@/components/ui/url-state'

describe('mergeSearchParams', () => {
  it('ตั้งค่าใหม่โดยคง key อื่นไว้', () => {
    expect(mergeSearchParams('?tab=payout&x=1', { tab: 'revenue' })).toBe('tab=revenue&x=1')
  })

  it('null / ค่าว่าง = ลบ key', () => {
    expect(mergeSearchParams('tab=payout&page=3', { page: null, search: '' })).toBe('tab=payout')
  })

  it('ตัวเลข/ภาษาไทยเข้ารหัสถูกต้อง', () => {
    const query = mergeSearchParams('', { page: 2, search: 'สมชาย ใจดี' })
    expect(new URLSearchParams(query).get('search')).toBe('สมชาย ใจดี')
    expect(new URLSearchParams(query).get('page')).toBe('2')
  })
})

describe('pickParam / pickPage', () => {
  const tabs = ['intake', 'in_custody', 'pending_handover'] as const

  it('ค่าในชุดที่อนุญาตใช้ได้ · นอกชุด/ไม่มี = ค่าเริ่มต้น', () => {
    expect(pickParam('in_custody', tabs, 'intake')).toBe('in_custody')
    expect(pickParam('hack', tabs, 'intake')).toBe('intake')
    expect(pickParam(undefined, tabs, 'intake')).toBe('intake')
    expect(pickParam(['pending_handover', 'x'], tabs, 'intake')).toBe('pending_handover')
  })

  it('เลขหน้า: จำนวนเต็มบวกเท่านั้น', () => {
    expect(pickPage('3')).toBe(3)
    expect(pickPage('0')).toBe(1)
    expect(pickPage('-2')).toBe(1)
    expect(pickPage('2.5')).toBe(1)
    expect(pickPage('abc')).toBe(1)
    expect(pickPage(undefined)).toBe(1)
  })
})

describe('pickUuid', () => {
  it('รับเฉพาะ UUID — ค่าอื่น (ลิงก์แก้มือ/ฉีดค่า) = null', () => {
    expect(pickUuid('5a9d5b8f-dd03-4f5c-ab08-43be3ae1075c')).toBe('5a9d5b8f-dd03-4f5c-ab08-43be3ae1075c')
    expect(pickUuid('abc')).toBeNull()
    expect(pickUuid("1' OR '1'='1")).toBeNull()
    expect(pickUuid(undefined)).toBeNull()
  })
})
