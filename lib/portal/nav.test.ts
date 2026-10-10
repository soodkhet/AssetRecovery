import { describe, expect, it } from 'vitest'
import {
  PORTAL_FINANCE_TABS,
  PORTAL_NAV_ITEMS,
  activePortalNavKey,
  portalBottomNavItems,
  portalKpiCards,
  portalNavItems,
  portalOverviewLoads,
  revenueSummaryIsEmpty,
} from '@/lib/portal/nav'
import type { PortalSection } from '@/lib/portal/access'

const ALL: PortalSection[] = ['cases', 'finance', 'handover', 'profile']
/** ค่าเริ่มต้นของหัวหน้า (`97` §3.3/§4) — ไม่มีหมวดการเงิน */
const SUPERVISOR: PortalSection[] = ['cases', 'handover', 'profile']
/** ค่าเริ่มต้นของแอดมินบริษัท — ภาพรวม/เคส + ข้อมูลบริษัท */
const ADMIN: PortalSection[] = ['cases', 'profile']

describe('portalNavItems — แท็บ desktop', () => {
  it('ผู้จัดการเห็นครบ 6 แท็บตามลำดับ mockup', () => {
    expect(portalNavItems(ALL).map((item) => item.key)).toEqual([
      'overview',
      'cases',
      'billing',
      'tax-invoices',
      'handover',
      'company',
    ])
  })

  it('หัวหน้าไม่เห็นแท็บการเงิน (วางบิล + ใบกำกับภาษี)', () => {
    const keys = portalNavItems(SUPERVISOR).map((item) => item.key)
    expect(keys).toEqual(['overview', 'cases', 'handover', 'company'])
  })

  it('แอดมินเห็นภาพรวม/เคส/ข้อมูลบริษัท', () => {
    expect(portalNavItems(ADMIN).map((item) => item.key)).toEqual(['overview', 'cases', 'company'])
  })

  it('ไม่มีหมวดเลย ยังเห็นหน้าแรก', () => {
    expect(portalNavItems([]).map((item) => item.key)).toEqual(['overview'])
  })

  it('ทุกแท็บอยู่ใต้ /portal และ href ไม่ซ้ำ', () => {
    const hrefs = PORTAL_NAV_ITEMS.map((item) => item.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
    for (const href of hrefs) expect(href.startsWith('/portal')).toBe(true)
  })

  it('ป้ายเมนูไม่มีเลขอ้างอิงสเปค', () => {
    for (const item of PORTAL_NAV_ITEMS) expect(`${item.label}${item.shortLabel}`).not.toMatch(/§|ไฟล์ \d/)
  })
})

describe('portalBottomNavItems — mobile', () => {
  it('ผู้จัดการ: ภาพรวม/เคส/การเงิน/ส่งมอบ · การเงินไฮไลต์ทั้งวางบิลและใบกำกับ', () => {
    const items = portalBottomNavItems(ALL)
    expect(items.map((item) => item.key)).toEqual(['overview', 'cases', 'finance', 'handover'])
    expect(items.find((item) => item.key === 'finance')?.matches).toEqual(['billing', 'tax-invoices'])
  })

  it('หัวหน้าไม่มีปุ่มการเงิน', () => {
    expect(portalBottomNavItems(SUPERVISOR).map((item) => item.key)).toEqual(['overview', 'cases', 'handover'])
  })
})

describe('activePortalNavKey', () => {
  it.each([
    ['/portal', 'overview'],
    ['/portal/', 'overview'],
    ['/portal/cases', 'cases'],
    ['/portal/cases/abc', 'cases'],
    ['/portal/billing', 'billing'],
    ['/portal/tax-invoices', 'tax-invoices'],
    ['/portal/handover/lot-1', 'handover'],
    ['/portal/company', 'company'],
  ])('%s → %s', (pathname, key) => {
    expect(activePortalNavKey(pathname)).toBe(key)
  })

  it('path ที่ขึ้นต้นคล้ายกันไม่ถูกนับ', () => {
    expect(activePortalNavKey('/portal/casesx')).toBeNull()
    expect(activePortalNavKey('/dashboard')).toBeNull()
  })
})

describe('portalOverviewLoads — ยิงเฉพาะ endpoint ที่มีสิทธิ์', () => {
  it('หัวหน้าไม่ยิงรายงานการเงิน', () => {
    expect(portalOverviewLoads(SUPERVISOR)).toEqual({ dashboard: true, financeReports: false })
  })
  it('ผู้จัดการยิงครบ', () => {
    expect(portalOverviewLoads(ALL)).toEqual({ dashboard: true, financeReports: true })
  })
  it('ไม่มีหมวดเคส ไม่ยิง dashboard (endpoint ต้องการหมวดเคส)', () => {
    expect(portalOverviewLoads(['finance'])).toEqual({ dashboard: false, financeReports: true })
  })
})

describe('portalKpiCards — แสดงเฉพาะการ์ดที่ API ส่งคีย์มา', () => {
  it('ครบ 4 ใบตามลำดับ §5', () => {
    const cards = portalKpiCards({
      inProgressCases: { count: 3 },
      arOutstanding: { outstandingSatang: 1_234_500 },
      latestTaxInvoice: { invoiceNumber: 'INV-1', issueDate: '2026-09-30', totalSatang: 10700 },
      pendingLots: { count: 2 },
    })
    expect(cards.map((card) => card.key)).toEqual(['inProgressCases', 'arOutstanding', 'latestTaxInvoice', 'pendingLots'])
    expect(cards[1]?.value).toEqual({ kind: 'money', satang: 1_234_500 })
    expect(cards[2]?.value).toEqual({ kind: 'invoice', invoiceNumber: 'INV-1', issueDate: '2026-09-30', totalSatang: 10700 })
  })

  it('หัวหน้า (ไม่มีคีย์การเงิน) — ไม่มีการ์ดยอดค้าง/ใบกำกับ', () => {
    const cards = portalKpiCards({ inProgressCases: { count: 0 }, pendingLots: { count: 1 } })
    expect(cards.map((card) => card.key)).toEqual(['inProgressCases', 'pendingLots'])
  })

  it('มีสิทธิ์การเงินแต่ยังไม่มีใบกำกับ → การ์ดแสดงค่าว่าง ไม่หาย', () => {
    const cards = portalKpiCards({ arOutstanding: { outstandingSatang: 0 }, latestTaxInvoice: null })
    expect(cards.map((card) => card.key)).toEqual(['arOutstanding', 'latestTaxInvoice'])
    expect(cards[1]?.value).toEqual({ kind: 'none' })
  })

  it('response ว่าง → ไม่มีการ์ด', () => {
    expect(portalKpiCards({})).toEqual([])
  })
})

describe('revenueSummaryIsEmpty', () => {
  it('ทุกเดือนเป็นศูนย์ = ว่าง', () => {
    expect(revenueSummaryIsEmpty([{ revenueSatang: 0, caseCount: 0 }, { revenueSatang: 0, caseCount: 0 }])).toBe(true)
  })
  it('มีเคสแต่ยอด 0 (เคสไม่สำเร็จที่ไม่คิดค่าบริการ) ถือว่ามีข้อมูล', () => {
    expect(revenueSummaryIsEmpty([{ revenueSatang: 0, caseCount: 1 }])).toBe(false)
  })
})

describe('staging E-076/E-077 — ชื่อหน้าใบกำกับภาษี + แท็บการเงินบนมือถือ', () => {
  it('เมนูใช้ชื่อเดียวตามมติ U95 · ป้ายสั้นบนมือถือ', () => {
    const item = PORTAL_NAV_ITEMS.find((entry) => entry.key === 'tax-invoices')
    expect(item?.label).toBe('ใบเสร็จรับเงิน/ใบกำกับภาษี')
    expect(item?.shortLabel).toBe('ใบกำกับภาษี')
  })

  it('แท็บการเงินมี 2 หน้า ชี้หน้าเดียวกับเมนู', () => {
    expect(PORTAL_FINANCE_TABS.map((tab) => tab.href)).toEqual(['/portal/billing', '/portal/tax-invoices'])
    for (const tab of PORTAL_FINANCE_TABS) {
      expect(PORTAL_NAV_ITEMS.some((entry) => entry.href === tab.href && entry.section === 'finance')).toBe(true)
    }
  })
})
