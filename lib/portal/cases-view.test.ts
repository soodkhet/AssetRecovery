import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PORTAL_CASES_FILTERS,
  PORTAL_CASE_STATUS_OPTIONS,
  hasActivePortalCasesFilter,
  parsePortalCasesFilters,
  portalAssetPhotoPath,
  portalCaseDetailApiPath,
  portalCasesApiPath,
  portalCasesLastPage,
  portalCasesPageQuery,
  portalCasesRange,
  portalServiceFeeRows,
  wrapPhotoIndex,
} from '@/lib/portal/cases-view'
import { portalCaseListQuerySchema } from '@/lib/portal/queries/cases'
import type { PortalServiceFeeDto } from '@/lib/portal/serializers'
import { PORTAL_CASE_STATUS_CODES } from '@/lib/portal/status-map'

const CASE_ID = '0b6f1c3e-2a4d-4f7a-9c1e-5d2b8a7f6e10'

function params(query: string): URLSearchParams {
  return new URLSearchParams(query)
}

describe('parsePortalCasesFilters — URL → ตัวกรอง', () => {
  it('ไม่มี query = ค่าเริ่มต้น', () => {
    expect(parsePortalCasesFilters(params(''))).toEqual(DEFAULT_PORTAL_CASES_FILTERS)
  })

  it('อ่านรหัสสถานะฝั่งบริษัท/คำค้น/หน้า/เคสที่เปิด', () => {
    expect(parsePortalCasesFilters(params(`status=recovered&search=%20UAT-CO1%20&page=3&case=${CASE_ID.toUpperCase()}`))).toEqual({
      status: 'recovered',
      search: 'UAT-CO1',
      page: 3,
      caseId: CASE_ID,
    })
  })

  it('enum ภายใน/ค่าแปลกตกเป็นค่าเริ่มต้น (ไม่รับ raw enum ของเคส)', () => {
    const parsed = parsePortalCasesFilters(params('status=closed_success&page=-2&case=not-a-uuid'))
    expect(parsed.status).toBe('all')
    expect(parsed.page).toBe(1)
    expect(parsed.caseId).toBeNull()
    expect(parsePortalCasesFilters(params('page=0')).page).toBe(1)
    expect(parsePortalCasesFilters(params('page=abc')).page).toBe(1)
  })

  it('ตัดคำค้นยาวเกินที่ API รับ', () => {
    expect(parsePortalCasesFilters(params(`search=${'ก'.repeat(150)}`)).search).toHaveLength(100)
  })
})

describe('portalCasesPageQuery — ตัวกรอง → URL หน้าเว็บ', () => {
  it('ค่าเริ่มต้น = ไม่มี query', () => {
    expect(portalCasesPageQuery(DEFAULT_PORTAL_CASES_FILTERS)).toBe('')
  })

  it('ใส่เฉพาะค่าที่ต่างจากค่าเริ่มต้น และอ่านกลับได้ค่าเดิม', () => {
    const filters = { status: 'info_requested' as const, search: 'มาลี', page: 2, caseId: CASE_ID }
    const query = portalCasesPageQuery(filters)
    expect(query).toBe(`?status=info_requested&search=${encodeURIComponent('มาลี')}&page=2&case=${CASE_ID}`)
    expect(parsePortalCasesFilters(params(query.slice(1)))).toEqual(filters)
  })

  it('คำค้นที่มีแต่ช่องว่างไม่ถูกใส่', () => {
    expect(portalCasesPageQuery({ ...DEFAULT_PORTAL_CASES_FILTERS, search: '   ' })).toBe('')
  })
})

describe('portalCasesApiPath — query ของ GET /api/portal/cases', () => {
  it('ส่ง page/limit เสมอ · ไม่ส่ง status=all และไม่ส่ง case', () => {
    expect(portalCasesApiPath({ ...DEFAULT_PORTAL_CASES_FILTERS, caseId: CASE_ID })).toBe('/api/portal/cases?page=1&limit=20')
  })

  it('ผ่าน Zod schema ของ API ทุกรหัสสถานะ (FE/BE ชุดเดียว)', () => {
    for (const status of PORTAL_CASE_STATUS_CODES) {
      const path = portalCasesApiPath({ status, search: 'UAT', page: 2, caseId: null })
      const query = Object.fromEntries(new URL(path, 'http://localhost').searchParams)
      expect(portalCaseListQuerySchema.parse(query)).toEqual({ status, search: 'UAT', page: 2, limit: 20 })
    }
  })
})

describe('path อื่น ๆ', () => {
  it('รายละเอียดเคส/รูปทรัพย์', () => {
    expect(portalCaseDetailApiPath(CASE_ID)).toBe(`/api/portal/cases/${CASE_ID}`)
    expect(portalAssetPhotoPath(CASE_ID, 6)).toBe(`/api/portal/assets/${CASE_ID}/photos/6`)
  })

  it('wrapPhotoIndex วนรอบทั้งสองทิศ', () => {
    expect(wrapPhotoIndex(7, 7)).toBe(0)
    expect(wrapPhotoIndex(-1, 7)).toBe(6)
    expect(wrapPhotoIndex(3, 0)).toBe(0)
  })
})

describe('แบ่งหน้า', () => {
  it('lastPage อย่างน้อย 1', () => {
    expect(portalCasesLastPage(0)).toBe(1)
    expect(portalCasesLastPage(20)).toBe(1)
    expect(portalCasesLastPage(21)).toBe(2)
  })

  it('ช่วงแถว', () => {
    expect(portalCasesRange(2, 20, 5, 25)).toBe('21–25 จาก 25')
    expect(portalCasesRange(1, 20, 0, 0)).toBeNull()
  })

  it('มีตัวกรองหรือไม่ (ใช้เลือกข้อความ empty state)', () => {
    expect(hasActivePortalCasesFilter(DEFAULT_PORTAL_CASES_FILTERS)).toBe(false)
    expect(hasActivePortalCasesFilter({ ...DEFAULT_PORTAL_CASES_FILTERS, page: 4 })).toBe(false)
    expect(hasActivePortalCasesFilter({ ...DEFAULT_PORTAL_CASES_FILTERS, status: 'declined' })).toBe(true)
    expect(hasActivePortalCasesFilter({ ...DEFAULT_PORTAL_CASES_FILTERS, search: 'x' })).toBe(true)
  })
})

describe('PORTAL_CASE_STATUS_OPTIONS', () => {
  it('ทั้งหมด + 6 สถานะฝั่งบริษัท ป้ายไทย', () => {
    expect(PORTAL_CASE_STATUS_OPTIONS.map((option) => option.value)).toEqual(['all', ...PORTAL_CASE_STATUS_CODES])
    expect(PORTAL_CASE_STATUS_OPTIONS.find((option) => option.value === 'info_requested')?.label).toBe('ขอข้อมูลเพิ่มเติม')
  })
})

describe('portalServiceFeeRows — ค่าบริการใน drawer', () => {
  const base: PortalServiceFeeDto = {
    model: 'HYBRID',
    modelLabel: 'Hybrid (ผสม)',
    ratePct: 10,
    baseSatang: 50000,
    basis: 'debt_amount',
    basisLabel: 'มูลค่าหนี้คงเหลือ',
    chargeOnFail: true,
    projectedRevenueSatang: 350000,
  }

  it('ยังไม่อนุมัติ = null', () => {
    expect(portalServiceFeeRows(null)).toBeNull()
  })

  it('Hybrid แสดงครบ · ป้ายไทย ไม่มี enum ดิบ', () => {
    const rows = portalServiceFeeRows(base)
    expect(rows).toEqual([
      { label: 'รูปแบบค่าบริการ', value: 'Hybrid (ผสม)' },
      { label: 'ค่าบริการคงที่ต่อเคส', value: '฿500.00' },
      { label: 'อัตราค่าบริการเมื่อสำเร็จ', value: '10.00% ของมูลค่าหนี้คงเหลือ' },
      { label: 'เมื่อติดตามไม่สำเร็จ', value: 'เรียกเก็บ ฿500.00' },
      { label: 'ค่าบริการโดยประมาณ', value: '฿3,500.00' },
    ])
    const text = JSON.stringify(rows)
    for (const raw of ['HYBRID', 'debt_amount', 'SUCCESS_FEE', 'FLAT']) expect(text).not.toContain(raw)
  })

  it('Success Fee ไม่แสดงค่าคงที่ และไม่เก็บเมื่อไม่สำเร็จ', () => {
    const rows = portalServiceFeeRows({ ...base, model: 'SUCCESS_FEE', modelLabel: 'Success Fee (% ความสำเร็จ)', projectedRevenueSatang: null })
    expect(rows?.map((row) => row.label)).toEqual(['รูปแบบค่าบริการ', 'อัตราค่าบริการเมื่อสำเร็จ', 'เมื่อติดตามไม่สำเร็จ'])
    expect(rows?.at(-1)?.value).toBe('ไม่เรียกเก็บ')
  })

  it('Flat ไม่แสดงอัตรา % · ไม่เก็บเมื่อไม่สำเร็จถ้า chargeOnFail = false', () => {
    const rows = portalServiceFeeRows({ ...base, model: 'FLAT', modelLabel: 'Flat Rate (เหมาจ่ายรายเคส)', chargeOnFail: false })
    expect(rows?.map((row) => row.label)).not.toContain('อัตราค่าบริการเมื่อสำเร็จ')
    expect(rows?.find((row) => row.label === 'เมื่อติดตามไม่สำเร็จ')?.value).toBe('ไม่เรียกเก็บ')
  })
})
