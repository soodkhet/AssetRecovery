import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseCaseListParams } from '@/components/cases/case-list-params'
import {
  browserSearchParams,
  initialUrlParam,
  initialUrlUuid,
  mergeSearchParams,
  pickPage,
  pickParam,
  pickUuid,
} from '@/components/ui/url-state'

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

describe('ค่าเริ่มต้นจาก URL จริงของ browser (preship R6-004)', () => {
  const CASE_ID = '3f1c2b4a-1111-4222-8333-944455556666'
  const stubLocation = (pathname: string, search: string) =>
    vi.stubGlobal('window', { location: { pathname, search, hash: '' } })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('ฝั่ง server (ไม่มี window) = ค่าจาก server', () => {
    expect(browserSearchParams('/finance')).toBeNull()
    expect(initialUrlParam('tab', 'payout', '/finance')).toBe('payout')
    expect(initialUrlUuid('case', CASE_ID, '/cases/submit')).toBe(CASE_ID)
  })

  it('Back กลับมาหน้าเดิม — URL จริงชนะ prop เก่าจาก router cache', () => {
    stubLocation('/cases/submit', '?search=FINAL&page=2')
    expect(initialUrlParam('search', null, '/cases/submit')).toBe('FINAL')
    // key ที่ URL ไม่มี = null (ไม่ใช่ค่าจาก server ที่อาจเป็นของ entry เก่า)
    expect(initialUrlParam('status', 'approved', '/cases/submit')).toBeNull()
    expect(initialUrlUuid('case', CASE_ID, '/cases/submit')).toBeNull()
  })

  it('นำทางฝั่ง client มาจากหน้าอื่น (window ยังเป็น path เดิม) = ค่าจาก server (R6-003)', () => {
    stubLocation('/dashboard', '?search=x')
    expect(browserSearchParams('/finance')).toBeNull()
    expect(initialUrlParam('tab', 'revenue', '/finance')).toBe('revenue')
    expect(initialUrlUuid('case', CASE_ID, '/field/tracking')).toBe(CASE_ID)
  })
})

describe('parseCaseListParams', () => {
  it('ค่าว่าง/ไม่มี = ค่าเริ่มต้น', () => {
    expect(parseCaseListParams(() => null)).toEqual({
      filters: { search: '', status: 'all', sourceChannel: 'all', financeCompanyId: 'all', province: 'all' },
      page: 1,
    })
  })

  it('อ่านทุก key + ตัดคำค้นยาวเกิน 100 ตัว · หน้าไม่ใช่จำนวนเต็มบวก = 1', () => {
    const query = new URLSearchParams({ search: 'ก'.repeat(150), status: 'draft', source: 'email', page: '-3' })
    const { filters, page } = parseCaseListParams((key) => query.get(key))
    expect(filters.search).toHaveLength(100)
    expect(filters.status).toBe('draft')
    expect(filters.sourceChannel).toBe('email')
    expect(page).toBe(1)
  })
})
