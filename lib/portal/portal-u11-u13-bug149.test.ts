import { describe, expect, it } from 'vitest'
import {
  PORTAL_CUSTOMER_WHT_NOTICE,
  PORTAL_REVENUE_BASIS_LABEL,
  portalAlertTextClass,
  portalAlertTone,
  portalHasCustomerWht,
  portalRevenueChartAxis,
} from '@/lib/portal/finance-ui'
import { PORTAL_LOT_DOCUMENTS, portalLotDocumentApiUrl } from '@/lib/portal/handover-view'
import { portalKpiCards } from '@/lib/portal/nav'

/** มติ PO 05/10/2569 U11/U13/U14 + BUG-146/BUG-149 — ตัวช่วยฝั่ง UI ของพอร์ทัล (pure) */

describe('BUG-149 — สีตามค่า (ทุกหน้าใช้ helper เดียว)', () => {
  it('0/ติดลบ = เขียว · มากกว่า 0 = แดง', () => {
    expect(portalAlertTone(0)).toBe('emerald')
    expect(portalAlertTone(-500)).toBe('emerald')
    expect(portalAlertTone(1)).toBe('red')
    expect(portalAlertTextClass(0)).toContain('emerald')
    expect(portalAlertTextClass(3)).toContain('red')
  })

  it('การ์ดยอดค้างหน้าภาพรวม ฿0 = เขียว (ตรงกับหน้าวางบิล) · มียอด = แดง', () => {
    const zero = portalKpiCards({ arOutstanding: { outstandingSatang: 0 } })
    expect(zero[0]?.tone).toBe('emerald')
    const owed = portalKpiCards({ arOutstanding: { outstandingSatang: 10_000 } })
    expect(owed[0]?.tone).toBe('red')
  })
})

describe('U11 — ภาษีหัก ณ ที่จ่ายที่ลูกค้าหัก', () => {
  it('แสดงหมายเหตุเฉพาะเมื่อมีรอบที่ลูกค้าหักไว้', () => {
    expect(portalHasCustomerWht([{ customerWhtSatang: 0 }])).toBe(false)
    expect(portalHasCustomerWht([{ customerWhtSatang: 0 }, { customerWhtSatang: 1_119_000 }])).toBe(true)
    expect(PORTAL_CUSTOMER_WHT_NOTICE).toContain('50 ทวิ')
    expect(PORTAL_CUSTOMER_WHT_NOTICE).not.toMatch(/§|ไฟล์ \d/)
  })
})

describe('U14/BUG-146 — กราฟรายได้', () => {
  it('ป้ายบอกฐานยอดตามใบกำกับ (ก่อน VAT)', () => {
    expect(PORTAL_REVENUE_BASIS_LABEL).toBe('ยอดตามใบกำกับ (ก่อน VAT)')
  })

  it('จอแคบ: เอียงมากขึ้น + แสดงเว้นเดือน · จอกว้าง: ทุกเดือน', () => {
    expect(portalRevenueChartAxis(true)).toEqual({ interval: 1, angle: -40, height: 56 })
    expect(portalRevenueChartAxis(false)).toEqual({ interval: 0, angle: -15, height: 48 })
  })
})

describe('U13 — เอกสารของล็อต', () => {
  it('URL ของแต่ละเอกสารตรงกับ contract', () => {
    const id = '00000000-0000-4000-8000-000000000001'
    expect(portalLotDocumentApiUrl(id, 'signed_doc')).toBe(`/api/portal/handover-lots/${id}/download`)
    expect(portalLotDocumentApiUrl(id, 'delivery_note')).toBe(`/api/portal/handover-lots/${id}/delivery-note`)
    expect(portalLotDocumentApiUrl(id, 'delivery_proof')).toBe(`/api/portal/handover-lots/${id}/delivery-proof`)
    expect(PORTAL_LOT_DOCUMENTS.delivery_note.label).toContain('ใบส่งมอบ')
  })
})
