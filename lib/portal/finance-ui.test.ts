import { describe, expect, it } from 'vitest'
import {
  attachmentFileName,
  bangkokToday,
  filterPortalBillingRows,
  isPortalBillingFilter,
  isPortalBillingOverdue,
  portalBillingFilterOptions,
  portalBillingSummary,
  portalShortMonthLabel,
  portalTaxInvoiceDownloadUrl,
  type PortalBillingRowLike,
} from '@/lib/portal/finance-ui'
import { attachmentHeader } from '@/lib/format/attachment'

const row = (code: PortalBillingRowLike['statusDisplay']['code'], outstandingSatang: number, dueDate: string) => ({
  outstandingSatang,
  dueDate,
  statusDisplay: { code },
})

describe('รอบวางบิล — กรอง/สรุป', () => {
  const rows = [
    row('sent', 107_000, '2026-09-30'),
    row('partially_paid', 50_000, '2026-10-31'),
    row('paid', 0, '2026-08-31'),
  ]

  it('ตัวเลือกกรองไม่มี draft และป้ายตรง badge', () => {
    const options = portalBillingFilterOptions()
    expect(options.map((option) => option.value)).toEqual(['all', 'sent', 'partially_paid', 'paid'])
    expect(options.every((option) => option.label.length > 0 && option.label !== option.value)).toBe(true)
    expect(isPortalBillingFilter('draft')).toBe(false)
    expect(isPortalBillingFilter('paid')).toBe(true)
  })

  it('กรองตามรหัสสถานะ', () => {
    expect(filterPortalBillingRows(rows, 'all')).toHaveLength(3)
    expect(filterPortalBillingRows(rows, 'paid')).toEqual([rows[2]])
  })

  it('เลยกำหนด = ยังค้าง และวันครบกำหนดน้อยกว่าวันนี้ (วันครบกำหนดเองไม่นับ)', () => {
    expect(isPortalBillingOverdue(rows[0]!, '2026-10-05')).toBe(true)
    expect(isPortalBillingOverdue(rows[0]!, '2026-09-30')).toBe(false)
    expect(isPortalBillingOverdue(rows[2]!, '2026-10-05')).toBe(false)
  })

  it('สรุปยอดค้างรวม (integer satang) + นับรอบค้าง/เลยกำหนด', () => {
    expect(portalBillingSummary(rows, '2026-10-05')).toEqual({
      outstandingSatang: 157_000,
      batchCount: 3,
      openCount: 2,
      overdueCount: 1,
      overdueSatang: 107_000,
    })
    expect(portalBillingSummary([], '2026-10-05')).toEqual({
      outstandingSatang: 0,
      batchCount: 0,
      openCount: 0,
      overdueCount: 0,
      overdueSatang: 0,
    })
  })

  it('วันนี้อิงเวลาไทย — 17:30 UTC = วันถัดไปของไทย', () => {
    expect(bangkokToday(new Date('2026-10-04T17:30:00Z'))).toBe('2026-10-05')
  })
})

describe('ใบกำกับภาษี — ไฟล์ดาวน์โหลด', () => {
  it('อ่านชื่อไฟล์ภาษาไทยจาก attachmentHeader() ได้ครบ', () => {
    expect(attachmentFileName(attachmentHeader('ใบกำกับภาษี_INV-0001.pdf'), 'x.pdf')).toBe('ใบกำกับภาษี_INV-0001.pdf')
  })

  it('ไม่มี filename* → filename · ไม่มีเลย → fallback', () => {
    expect(attachmentFileName('attachment; filename="a.pdf"', 'x.pdf')).toBe('a.pdf')
    expect(attachmentFileName(null, 'x.pdf')).toBe('x.pdf')
    expect(attachmentFileName("attachment; filename*=UTF-8''%E0%A4%A", 'x.pdf')).toBe('x.pdf')
  })

  it('URL ดาวน์โหลดเข้ารหัส id', () => {
    expect(portalTaxInvoiceDownloadUrl('a/b')).toBe('/api/portal/tax-invoices/a%2Fb/download')
  })
})

describe('portalShortMonthLabel — ป้ายเดือนสั้นของกราฟ', () => {
  it('ISO วันแรกของเดือน → เดือนย่อ + พ.ศ. 2 หลัก', () => {
    expect(portalShortMonthLabel('2026-05-01', '—')).toBe('พ.ค. 69')
    expect(portalShortMonthLabel('2027-01-01', '—')).toBe('ม.ค. 70')
    expect(portalShortMonthLabel('2026-12-01', '—')).toBe('ธ.ค. 69')
  })

  it('รูปแบบผิด → fallback', () => {
    expect(portalShortMonthLabel('พฤษภาคม 2569', 'พฤษภาคม 2569')).toBe('พฤษภาคม 2569')
    expect(portalShortMonthLabel('2026-13-01', 'x')).toBe('x')
  })
})
