import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PORTAL_LOT_FILTERS,
  LOT_DOWNLOAD_LOCKED_HINT,
  PORTAL_LOT_STATUS_FILTER_OPTIONS,
  fileNameFromDisposition,
  hasActivePortalLotFilters,
  isIsoDate,
  parsePortalLotFilters,
  portalAssetPhotoApiUrl,
  portalLotDetailApiUrl,
  portalLotDownloadApiUrl,
  portalLotDownloadState,
  portalLotFiltersToQuery,
  portalLotLastPage,
  portalLotListApiUrl,
  updatePortalLotFilters,
  type PortalLotFilters,
} from '@/lib/portal/handover-view'
import { PORTAL_LOT_STATUS_CODES, portalLotStatusDisplay } from '@/lib/portal/status-map'

const LOT_ID = '0b9c6f1e-1d2a-4c3b-9f8e-7a6b5c4d3e2f'

function params(query: string): URLSearchParams {
  return new URLSearchParams(query)
}

describe('parsePortalLotFilters', () => {
  it('ไม่มี query = ค่าเริ่มต้น', () => {
    expect(parsePortalLotFilters(params(''))).toEqual(DEFAULT_PORTAL_LOT_FILTERS)
  })

  it('อ่านค่าที่ถูกต้องครบ', () => {
    expect(
      parsePortalLotFilters(
        params(`status=delivered&dateFrom=2026-09-01&dateTo=2026-09-30&search=%20LOT-2569%20&page=3&lot=${LOT_ID}`),
      ),
    ).toEqual({
      status: 'delivered',
      dateFrom: '2026-09-01',
      dateTo: '2026-09-30',
      search: 'LOT-2569',
      page: 3,
      lot: LOT_ID,
    })
  })

  it('รับเฉพาะรหัสสถานะของพอร์ทัล — enum ภายในถอยเป็น all', () => {
    expect(parsePortalLotFilters(params('status=confirmed')).status).toBe('all')
    expect(parsePortalLotFilters(params('status=pending_attach')).status).toBe('all')
    for (const code of PORTAL_LOT_STATUS_CODES) {
      expect(parsePortalLotFilters(params(`status=${code}`)).status).toBe(code)
    }
  })

  it('วันที่ผิดรูป/ไม่มีจริง ถูกทิ้ง · ช่วงกลับหัวทิ้งวันสิ้นสุด', () => {
    expect(parsePortalLotFilters(params('dateFrom=2026-02-31&dateTo=01/09/2569'))).toMatchObject({
      dateFrom: '',
      dateTo: '',
    })
    expect(parsePortalLotFilters(params('dateFrom=2026-09-30&dateTo=2026-09-01'))).toMatchObject({
      dateFrom: '2026-09-30',
      dateTo: '',
    })
  })

  it('page ไม่ใช่จำนวนเต็มบวก = 1 · lot ไม่ใช่ uuid = ว่าง · search ตัดที่ 100 ตัว', () => {
    expect(parsePortalLotFilters(params('page=0')).page).toBe(1)
    expect(parsePortalLotFilters(params('page=1.5')).page).toBe(1)
    expect(parsePortalLotFilters(params('page=abc')).page).toBe(1)
    expect(parsePortalLotFilters(params('lot=LOT-2569-003')).lot).toBe('')
    expect(parsePortalLotFilters(params(`search=${'a'.repeat(150)}`)).search).toHaveLength(100)
  })
})

describe('isIsoDate', () => {
  it('ตรวจปฏิทินจริง', () => {
    expect(isIsoDate('2026-10-05')).toBe(true)
    expect(isIsoDate('2028-02-29')).toBe(true)
    expect(isIsoDate('2026-02-29')).toBe(false)
    expect(isIsoDate('2026-1-5')).toBe(false)
    expect(isIsoDate('')).toBe(false)
  })
})

describe('portalLotFiltersToQuery', () => {
  it('ค่าเริ่มต้น = สตริงว่าง', () => {
    expect(portalLotFiltersToQuery(DEFAULT_PORTAL_LOT_FILTERS)).toBe('')
  })

  it('ไป-กลับกับ parse ได้ค่าเดิม', () => {
    const filters: PortalLotFilters = {
      status: 'dispatched',
      dateFrom: '2026-09-01',
      dateTo: '2026-09-30',
      search: 'DLV-2569',
      page: 2,
      lot: LOT_ID,
    }
    const query = portalLotFiltersToQuery(filters)
    expect(query.startsWith('?')).toBe(true)
    expect(parsePortalLotFilters(params(query.slice(1)))).toEqual(filters)
  })
})

describe('updatePortalLotFilters', () => {
  const base: PortalLotFilters = { ...DEFAULT_PORTAL_LOT_FILTERS, page: 4 }

  it('เปลี่ยนตัวกรองกลับหน้า 1', () => {
    expect(updatePortalLotFilters(base, { status: 'delivered' }).page).toBe(1)
    expect(updatePortalLotFilters(base, { search: 'LOT' }).page).toBe(1)
    expect(updatePortalLotFilters(base, { dateFrom: '2026-09-01' }).page).toBe(1)
  })

  it('เปลี่ยนหน้า/เปิดล็อต ไม่รีเซ็ตหน้า · ค่าเดิมซ้ำไม่รีเซ็ต', () => {
    expect(updatePortalLotFilters(base, { page: 5 }).page).toBe(5)
    expect(updatePortalLotFilters(base, { lot: LOT_ID }).page).toBe(4)
    expect(updatePortalLotFilters(base, { status: 'all' }).page).toBe(4)
  })

  it('ช่วงวันที่กลับหัว ดันอีกฝั่งตาม', () => {
    const ranged = { ...base, dateFrom: '2026-09-10', dateTo: '2026-09-20' }
    expect(updatePortalLotFilters(ranged, { dateFrom: '2026-09-25' })).toMatchObject({
      dateFrom: '2026-09-25',
      dateTo: '2026-09-25',
    })
    expect(updatePortalLotFilters(ranged, { dateTo: '2026-09-01' })).toMatchObject({
      dateFrom: '2026-09-01',
      dateTo: '2026-09-01',
    })
  })
})

describe('URL ของ API', () => {
  it('list ส่งเฉพาะตัวกรองที่ตั้ง + page/limit เสมอ · ไม่ส่ง lot', () => {
    expect(portalLotListApiUrl(DEFAULT_PORTAL_LOT_FILTERS)).toBe('/api/portal/handover-lots?page=1&limit=12')
    const url = portalLotListApiUrl(
      { status: 'awaiting_dispatch', dateFrom: '2026-09-01', dateTo: '', search: 'LOT 1', page: 2, lot: LOT_ID },
      20,
    )
    const parsed = new URL(url, 'http://localhost')
    expect(parsed.pathname).toBe('/api/portal/handover-lots')
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      status: 'awaiting_dispatch',
      dateFrom: '2026-09-01',
      search: 'LOT 1',
      page: '2',
      limit: '20',
    })
  })

  it('detail/download/photo', () => {
    expect(portalLotDetailApiUrl(LOT_ID)).toBe(`/api/portal/handover-lots/${LOT_ID}`)
    expect(portalLotDownloadApiUrl(LOT_ID)).toBe(`/api/portal/handover-lots/${LOT_ID}/download`)
    expect(portalAssetPhotoApiUrl(LOT_ID, 2)).toBe(`/api/portal/assets/${LOT_ID}/photos/2`)
  })
})

describe('hasActivePortalLotFilters / portalLotLastPage', () => {
  it('หน้า/ล็อตไม่นับเป็นตัวกรอง', () => {
    expect(hasActivePortalLotFilters({ ...DEFAULT_PORTAL_LOT_FILTERS, page: 3, lot: LOT_ID })).toBe(false)
    expect(hasActivePortalLotFilters({ ...DEFAULT_PORTAL_LOT_FILTERS, search: ' x ' })).toBe(true)
    expect(hasActivePortalLotFilters({ ...DEFAULT_PORTAL_LOT_FILTERS, dateTo: '2026-09-01' })).toBe(true)
  })

  it('หน้าสุดท้ายอย่างน้อย 1', () => {
    expect(portalLotLastPage(0, 12)).toBe(1)
    expect(portalLotLastPage(12, 12)).toBe(1)
    expect(portalLotLastPage(13, 12)).toBe(2)
    expect(portalLotLastPage(5, 0)).toBe(1)
  })
})

describe('portalLotDownloadState', () => {
  it('ไม่มีสิทธิ์ดาวน์โหลด = ซ่อน (ไม่ว่าล็อตสถานะใด)', () => {
    expect(portalLotDownloadState({ downloadable: true, canDownload: false })).toEqual({ visible: false })
    expect(portalLotDownloadState({ downloadable: false, canDownload: false })).toEqual({ visible: false })
  })

  it('ล็อตยังไม่ยืนยัน = disabled พร้อมคำอธิบาย · ยืนยันแล้ว = เปิด', () => {
    expect(portalLotDownloadState({ downloadable: false, canDownload: true })).toEqual({
      visible: true,
      enabled: false,
      hint: LOT_DOWNLOAD_LOCKED_HINT,
    })
    expect(portalLotDownloadState({ downloadable: true, canDownload: true })).toEqual({ visible: true, enabled: true })
  })

  it('คำอธิบายไม่มีเลขอ้างอิงสเปค', () => {
    expect(LOT_DOWNLOAD_LOCKED_HINT).not.toMatch(/§|ไฟล์ \d|`/)
  })
})

describe('ตัวเลือกสถานะ', () => {
  it('ป้ายตรงกับ mapper กลางของพอร์ทัล', () => {
    const fromMapper = new Map(
      (['pending_attach', 'pending_delivery_proof', 'confirmed'] as const).map((status) => {
        const display = portalLotStatusDisplay(status)
        return [display.code, display.label]
      }),
    )
    for (const option of PORTAL_LOT_STATUS_FILTER_OPTIONS) {
      if (option.value === 'all') continue
      expect(option.label).toBe(fromMapper.get(option.value))
    }
    expect(PORTAL_LOT_STATUS_FILTER_OPTIONS).toHaveLength(PORTAL_LOT_STATUS_CODES.length + 1)
  })
})

describe('fileNameFromDisposition', () => {
  it('อ่าน filename* ก่อน · ถอย filename · ถอยชื่อสำรอง', () => {
    expect(
      fileNameFromDisposition(`attachment; filename="DLV-2569-003-signed.pdf"; filename*=UTF-8''DLV-2569-003-signed.pdf`, 'x'),
    ).toBe('DLV-2569-003-signed.pdf')
    expect(fileNameFromDisposition(`attachment; filename*=UTF-8''%E0%B9%83%E0%B8%9A.pdf`, 'x')).toBe('ใบ.pdf')
    expect(fileNameFromDisposition('attachment; filename="a.pdf"', 'x')).toBe('a.pdf')
    expect(fileNameFromDisposition(`attachment; filename*=UTF-8''%E0%A4`, 'fallback.pdf')).toBe('fallback.pdf')
    expect(fileNameFromDisposition(null, 'fallback.pdf')).toBe('fallback.pdf')
  })
})
