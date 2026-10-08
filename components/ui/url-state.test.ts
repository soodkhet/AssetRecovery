import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseCaseListParams } from '@/components/cases/case-list-params'
import {
  browserSearchParams,
  clearUrlParamsExcept,
  initialUrlParam,
  isRecentSelfWrite,
  markQueryAsCurrent,
  initialUrlUuid,
  mergeSearchParams,
  pickPage,
  pickParam,
  pickUuid,
  replaceUrlParams,
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
    const query = new URLSearchParams({ search: 'ก'.repeat(150), status: 'draft', source: 'import', page: '-3' })
    const { filters, page } = parseCaseListParams((key) => query.get(key))
    expect(filters.search).toHaveLength(100)
    expect(filters.status).toBe('draft')
    expect(filters.sourceChannel).toBe('import')
    expect(page).toBe(1)
  })

  it('ค่านอกชุด (สถานะ/ช่องทาง/บริษัทไม่ใช่ UUID/จังหวัด) = ทั้งหมด — ไม่ส่งต่อให้ API แล้วตาราง error (R7-010)', () => {
    const query = new URLSearchParams({ status: 'bogus', source: 'email', company: 'x', province: 'ไม่มีจังหวัดนี้' })
    expect(parseCaseListParams((key) => query.get(key)).filters).toEqual({
      search: '',
      status: 'all',
      sourceChannel: 'all',
      financeCompanyId: 'all',
      province: 'all',
    })
    const valid = new URLSearchParams({ company: '3f1c2b4a-1111-4222-8333-944455556666', province: 'เชียงใหม่' })
    const { filters } = parseCaseListParams((key) => valid.get(key))
    expect(filters.financeCompanyId).toBe('3f1c2b4a-1111-4222-8333-944455556666')
    expect(filters.province).toBe('เชียงใหม่')
  })
})

describe('replaceUrlParams — จำ query ที่หน้าเขียนเอง (preship R7-004)', () => {
  const stubBrowser = (pathname: string, search: string) => {
    const location = { pathname, search, hash: '' }
    const history = {
      state: null,
      replaceState: (_state: unknown, _unused: string, url: string) => {
        const parsed = new URL(url, 'http://localhost')
        location.pathname = parsed.pathname
        location.search = parsed.search
      },
    }
    vi.stubGlobal('window', { location, history })
    return location
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('ค่าที่เพิ่งเขียนเอง = echo (ไม่ใช่การนำทาง) · หมดเวลาแล้วไม่นับ · ค่าที่ไม่เคยเขียน = การนำทาง', () => {
    stubBrowser('/finance', '?tab=advances')
    replaceUrlParams({ adv_status: 'cleared' })
    replaceUrlParams({ adv_status: 'uncleared' })
    const now = Date.now()
    // echo ของค่าก่อนหน้าที่กดรัว (ภายใน 500ms) · ค่าล่าสุดนับเสมอ
    expect(isRecentSelfWrite('tab=advances&adv_status=cleared', now)).toBe(true)
    expect(isRecentSelfWrite('tab=advances&adv_status=uncleared', now + 60_000)).toBe(true)
    // ค่าเก่าที่เขียนนานแล้วถูกนำทางกลับมา = การนำทางจริง
    expect(isRecentSelfWrite('tab=advances&adv_status=cleared', now + 5000)).toBe(false)
    expect(isRecentSelfWrite('tab=advances', now)).toBe(false)
  })

  it('นำทางมา query ใหม่แล้ว Back กลับ query ที่มีตัวกรอง (เคยเขียนเอง) ⇒ นับเป็นการนำทาง (R8-004)', () => {
    stubBrowser('/finance', '?tab=advances')
    replaceUrlParams({ adv_status: 'uncleared' })
    const later = Date.now() + 5000
    expect(isRecentSelfWrite('tab=advances&adv_status=uncleared', later)).toBe(true)
    // กดแจ้งเตือน ⇒ /finance?tab=advances (ตัวกรองถูกล้างตาม URL)
    markQueryAsCurrent('tab=advances')
    // Back ⇒ กลับ entry ที่มีตัวกรอง — ไม่ใช่ echo แล้ว
    expect(isRecentSelfWrite('tab=advances&adv_status=uncleared', later)).toBe(false)
  })

  it('query จากการนำทางส่งถึงตัวฟังทุกตัวของหน้า — ตัวแรก mark แล้วตัวถัดไปต้องไม่นับเป็น echo (R9-002)', () => {
    stubBrowser('/finance', '?tab=payout')
    replaceUrlParams({ payout_status: 'completed' })
    replaceUrlParams({ payout_side: 'inhouse' })
    const later = Date.now() + 5000
    // กดแจ้งเตือน ⇒ /finance?tab=payout — hook ตัวกรองตัวแรกรับแล้ว mark
    expect(isRecentSelfWrite('tab=payout', later)).toBe(false)
    markQueryAsCurrent('tab=payout')
    // hook ตัวกรองตัวที่สองใน render เดียวกันต้องยังรับได้
    expect(isRecentSelfWrite('tab=payout', later)).toBe(false)
    // echo ของการเขียนเองล่าสุดยังถูกข้ามตามเดิม
    replaceUrlParams({ payout_status: 'cancelled' })
    expect(isRecentSelfWrite('tab=payout&payout_status=cancelled&payout_side=inhouse', later)).toBe(true)
  })

  it('clearUrlParamsExcept ล้างตัวกรองย่อยทุกตัว เหลือแต่ key ที่ระบุ', () => {
    const location = stubBrowser('/accounting', '?tab=bank&bank_status=unmatched&cwht_age=d30')
    clearUrlParamsExcept(['tab'])
    expect(location.search).toBe('?tab=bank')
  })
})
