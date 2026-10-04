import { describe, expect, it } from 'vitest'
import {
  AssignmentStatus,
  BillingBatchStatus,
  CaseStatus,
  HandoverLotStatus,
  TaxInvoiceStatus,
} from '@/lib/generated/prisma/enums'
import {
  PORTAL_CASE_STATUS_CODES,
  PORTAL_LOT_STATUS_CODES,
  portalBillingStatusDisplay,
  portalCaseShowsReason,
  portalCaseStatusCode,
  portalCaseStatusDisplay,
  portalLotDownloadable,
  portalLotStatusDisplay,
  portalTaxInvoiceStatusDisplay,
} from '@/lib/portal/status-map'
import { STATUS_BADGE_CLASS } from '@/lib/ui/status-badge'

const TONES = Object.keys(STATUS_BADGE_CLASS)
const INTERNAL_CASE_LIKE = new Set<string>([
  ...Object.values(CaseStatus),
  ...Object.values(AssignmentStatus),
  ...Object.values(HandoverLotStatus),
])

describe('portal status-map — เคส (97 §10.1)', () => {
  it('ครบทุก enum ของ case_status × assignment_status และไม่มี raw enum หลุด', () => {
    for (const status of Object.values(CaseStatus)) {
      for (const assignmentStatus of [null, ...Object.values(AssignmentStatus)]) {
        const display = portalCaseStatusDisplay({ status, assignmentStatus })
        expect(PORTAL_CASE_STATUS_CODES).toContain(display.code)
        expect(INTERNAL_CASE_LIKE.has(display.code)).toBe(false)
        expect(display.label).not.toMatch(/[a-z_]{4,}/)
        expect(TONES).toContain(display.tone)
      }
    }
  })

  it.each([
    ['draft', 'under_review', 'อยู่ระหว่างตรวจสอบ', 'neutral'],
    ['pending_review', 'under_review', 'อยู่ระหว่างตรวจสอบ', 'neutral'],
    ['need_info', 'info_requested', 'ขอข้อมูลเพิ่มเติม', 'cleared'],
    ['rejected', 'declined', 'ไม่รับเคส', 'critical'],
    ['approved', 'tracking', 'กำลังดำเนินการติดตาม', 'pending'],
    ['active', 'tracking', 'กำลังดำเนินการติดตาม', 'pending'],
    ['pending_recycle_review', 'tracking', 'กำลังดำเนินการติดตาม', 'pending'],
    ['closed_success', 'recovered', 'ติดตามสำเร็จ', 'success'],
    ['closed_fail', 'not_recovered', 'ติดตามไม่สำเร็จ', 'neutral'],
  ] as const)('%s → %s', (status, code, label, tone) => {
    const display = portalCaseStatusDisplay({ status })
    expect(display).toMatchObject({ code, label, tone })
  })

  it('ไม่สำเร็จ = slate แบบเส้นขอบ', () => {
    expect(portalCaseStatusDisplay({ status: 'closed_fail' }).outline).toBe(true)
    expect(portalCaseStatusDisplay({ status: 'closed_success' }).outline).toBe(false)
  })

  it('เคสถูกตีกลับ (needs_revision) ยังเป็น "กำลังดำเนินการติดตาม" แม้ case ปิดแล้ว', () => {
    expect(portalCaseStatusCode({ status: 'closed_success', assignmentStatus: 'needs_revision' })).toBe('tracking')
    expect(portalCaseStatusCode({ status: 'closed_fail', assignmentStatus: 'needs_revision' })).toBe('tracking')
    expect(portalCaseStatusCode({ status: 'closed_success', assignmentStatus: 'closed_success' })).toBe('recovered')
    expect(portalCaseStatusCode({ status: 'closed_fail', assignmentStatus: 'closed_fail' })).toBe('not_recovered')
  })

  it('เหตุผลแสดงเฉพาะ ไม่รับเคส / ขอข้อมูลเพิ่มเติม', () => {
    const shown = PORTAL_CASE_STATUS_CODES.filter(portalCaseShowsReason)
    expect(shown).toEqual(['info_requested', 'declined'])
  })

  it('enum ที่ไม่รู้จัก → throw', () => {
    expect(() => portalCaseStatusDisplay({ status: 'bogus' as CaseStatus })).toThrow(/unknown case_status/)
    expect(() =>
      portalCaseStatusDisplay({ status: 'closed_success', assignmentStatus: 'bogus' as AssignmentStatus }),
    ).toThrow(/unknown assignment_status/)
  })
})

describe('portal status-map — ล็อต (97 §10.2)', () => {
  it('ครบทุก enum + ไม่ใช่ raw enum', () => {
    for (const status of Object.values(HandoverLotStatus)) {
      const display = portalLotStatusDisplay(status)
      expect(PORTAL_LOT_STATUS_CODES).toContain(display.code)
      expect(INTERNAL_CASE_LIKE.has(display.code)).toBe(false)
      expect(TONES).toContain(display.tone)
    }
    expect(portalLotStatusDisplay('pending_attach').label).toBe('รอดำเนินการส่งมอบ')
    expect(portalLotStatusDisplay('pending_delivery_proof').label).toBe('จัดส่งแล้ว รอยืนยัน')
    expect(portalLotStatusDisplay('confirmed').label).toBe('ส่งมอบสำเร็จ')
  })

  it('ดาวน์โหลดได้เฉพาะ confirmed', () => {
    expect(Object.values(HandoverLotStatus).filter(portalLotDownloadable)).toEqual(['confirmed'])
  })

  it('enum ที่ไม่รู้จัก → throw', () => {
    expect(() => portalLotStatusDisplay('bogus' as HandoverLotStatus)).toThrow()
  })
})

describe('portal status-map — billing / ใบกำกับ (97 §10.3)', () => {
  it('draft ไม่แสดง (null) ส่วนที่เหลือใช้คำเดิม', () => {
    for (const status of Object.values(BillingBatchStatus)) {
      const display = portalBillingStatusDisplay(status)
      if (status === 'draft') expect(display).toBeNull()
      else expect(display).toMatchObject({ code: status })
    }
    expect(portalBillingStatusDisplay('paid')?.tone).toBe('success')
    expect(portalBillingStatusDisplay('partially_paid')?.tone).toBe('partial')
    expect(() => portalBillingStatusDisplay('bogus' as BillingBatchStatus)).toThrow()
  })

  it('ใบกำกับครบทุก enum', () => {
    for (const status of Object.values(TaxInvoiceStatus)) {
      expect(portalTaxInvoiceStatusDisplay(status).code).toBe(status)
    }
    expect(portalTaxInvoiceStatusDisplay('cancelled').tone).toBe('critical')
    expect(() => portalTaxInvoiceStatusDisplay('bogus' as TaxInvoiceStatus)).toThrow()
  })
})
