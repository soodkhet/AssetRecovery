import { describe, expect, it } from 'vitest'
import { isWhtError } from '@/lib/wht/errors'
import {
  assertCertificateCancellable,
  assertFilingMarkable,
  buildWhtCertificateDoc,
  daysUntilFilingDue,
  DEFAULT_INCOME_TYPE,
  EMPTY_FIELD_TEXT,
  filingDueDateOf,
  filingFormOf,
  filingOverdueWarning,
  incomeTypeOf,
  isFilingOverdue,
  nextCertificateSequence,
  parseCertificateSequence,
  requireWhtCancelReason,
  shouldIssueCertificate,
  summarizeFilingTotals,
  whtCertificateNumber,
  whtCertificateNumberPrefix,
  type FilingTotalSource,
  type WhtCertificateDocSource,
} from '@/lib/wht/wht'

/**
 * กติกา pure ของไฟล์ 33 — เทสต์ตาม §16 ทั้ง 4 เคส + จุดที่ผิดแล้วเสียเงินจริง:
 *  · เลยกำหนดนำส่ง ⇒ `FILING_OVERDUE_WARNING` (เตือน ไม่ block)
 *  · แยก ภ.ง.ด.3 / ภ.ง.ด.53 ตามชนิดผู้ถูกหักในรอบเดียวกัน
 *  · ยกเลิกไม่กรอกเหตุผล ⇒ `WHT_CANCEL_REQUIRES_REASON`
 *  · **ยอดใบที่ยกเลิกต้องหายจาก pnd3/pnd53**
 *  · กำหนดนำส่ง = วันที่ 15 ของเดือนถัดไป (`33` §17 default) และเดินเลขที่ไม่ซ้ำ/ไม่ย้อน
 */

function codeOf(error: unknown): string {
  return isWhtError(error) ? error.code : String(error)
}

/** 25/06/2569 เวลาไทย (UTC+7) — วันจ่ายมาตรฐานของไฟล์เทสต์นี้ */
const PAYMENT_AT = new Date('2026-06-25T03:00:00Z')

describe('เงื่อนไขการออกใบ (`33` §9)', () => {
  it('หักภาษีจริงเท่านั้นจึงออกใบ — 0 บาท (เงินทดรอง/ต่ำกว่าเกณฑ์) ไม่ออก', () => {
    expect(shouldIssueCertificate({ whtSatang: 1_350_00 })).toBe(true)
    expect(shouldIssueCertificate({ whtSatang: 0 })).toBe(false)
  })

  it('แบบที่ยื่นมาจาก Tax Profile ที่ snapshot ไว้ก่อนเสมอ (`18` §6.3)', () => {
    // Payee เป็นบุคคลธรรมดา แต่ profile ระบุ PND53 ⇒ profile ชนะ
    expect(filingFormOf({ taxProfileFilingForm: 'PND53', payeeType: 'individual' })).toBe('PND53')
    expect(filingFormOf({ taxProfileFilingForm: null, payeeType: 'individual' })).toBe('PND3')
    expect(filingFormOf({ taxProfileFilingForm: null, payeeType: 'corporate' })).toBe('PND53')
  })

  it('ประเภทเงินได้ว่าง ⇒ ใช้ค่ามาตรฐาน มาตรา 40(8) (ฟิลด์บังคับตาม `28` §6.3 ห้ามว่าง)', () => {
    expect(incomeTypeOf('ค่าบริการ มาตรา 40(8)')).toBe('ค่าบริการ มาตรา 40(8)')
    expect(incomeTypeOf('   ')).toBe(DEFAULT_INCOME_TYPE)
    expect(incomeTypeOf(null)).toBe(DEFAULT_INCOME_TYPE)
  })
})

describe('เลขที่หนังสือรับรอง (D11 — ห้ามซ้ำ ห้ามย้อน)', () => {
  it('รูปแบบ WHT-<พ.ศ.>-NNN ตาม mockup + ใช้ปีไทยของวันที่จ่าย', () => {
    expect(whtCertificateNumber(1, PAYMENT_AT)).toBe('WHT-2569-001')
    expect(whtCertificateNumber(42, PAYMENT_AT)).toBe('WHT-2569-042')
    // เกิน 999 ต้องไม่ตัดหลัก (บทเรียนจาก `lpad` ของ Phase 3.5)
    expect(whtCertificateNumber(1234, PAYMENT_AT)).toBe('WHT-2569-1234')
  })

  it('วันที่จ่ายหลัง 17:00 น. ไทย ยังนับเป็นปี พ.ศ. ของวันไทย ไม่ใช่ของ UTC', () => {
    // 31/12/2569 19:00 น. ไทย = 2026-12-31T12:00Z (ปีเดียวกัน) · 01/01/2570 00:30 ไทย = 2026-12-31T17:30Z
    expect(whtCertificateNumber(1, new Date('2026-12-31T12:00:00Z'))).toBe('WHT-2569-001')
    expect(whtCertificateNumber(1, new Date('2026-12-31T17:30:00Z'))).toBe('WHT-2570-001')
  })

  it('ลำดับถัดไปนับจากเลขสูงสุดของปีนั้น (นับใบที่ยกเลิกด้วย — เลขไม่ recycle)', () => {
    const prefix = whtCertificateNumberPrefix(PAYMENT_AT)
    expect(prefix).toBe('WHT-2569-')
    expect(nextCertificateSequence([], prefix)).toBe(1)
    expect(nextCertificateSequence(['WHT-2569-001', 'WHT-2569-003', 'WHT-2569-002'], prefix)).toBe(4)
    // เลขของปีอื่น/รูปแบบอื่นไม่นับ
    expect(nextCertificateSequence(['WHT-2568-900', 'INV-2569-777'], prefix)).toBe(1)
    expect(parseCertificateSequence('WHT-2569-0012', prefix)).toBe(12)
    expect(parseCertificateSequence('WHT-2568-001', prefix)).toBeNull()
  })
})

describe('กำหนดเวลานำส่ง (`33` §6.2/§7.2 · §16)', () => {
  it('due date = วันที่ 15 ของเดือนถัดไป (ยื่นอินเทอร์เน็ต) — ข้ามปีถูกต้อง', () => {
    expect(filingDueDateOf({ yearBe: 2569, month: 6 }).toISOString()).toBe('2026-07-15T00:00:00.000Z')
    expect(filingDueDateOf({ yearBe: 2569, month: 12 }).toISOString()).toBe('2027-01-15T00:00:00.000Z')
  })

  it('นับวันคงเหลือตามปฏิทินไทย — 13 วันก่อนกำหนด/เลยกำหนดติดลบ', () => {
    const due = filingDueDateOf({ yearBe: 2569, month: 6 })
    expect(daysUntilFilingDue(due, new Date('2026-07-02T03:00:00Z'))).toBe(13)
    expect(daysUntilFilingDue(due, new Date('2026-07-15T16:00:00Z'))).toBe(0)
    expect(daysUntilFilingDue(due, new Date('2026-07-22T03:00:00Z'))).toBe(-7)
  })

  it('เลยกำหนดแต่ยัง pending ⇒ FILING_OVERDUE_WARNING (เตือน ไม่ block)', () => {
    const summary = {
      periodLabel: 'มิถุนายน 2569',
      status: 'pending' as const,
      filingDueDate: filingDueDateOf({ yearBe: 2569, month: 6 }),
    }
    const late = new Date('2026-07-22T03:00:00Z')

    expect(isFilingOverdue(summary.status, summary.filingDueDate, late)).toBe(true)
    const warning = filingOverdueWarning(summary, late)
    expect(warning?.code).toBe('FILING_OVERDUE_WARNING')
    expect(warning?.message).toContain('15/07/2569')
    expect(warning?.message).toContain('7 วัน')
  })

  it('ยังไม่ถึงกำหนด หรือยื่นแล้ว ⇒ ไม่เตือน', () => {
    const due = filingDueDateOf({ yearBe: 2569, month: 6 })
    expect(filingOverdueWarning({ periodLabel: 'มิถุนายน 2569', status: 'pending', filingDueDate: due }, new Date('2026-07-02T03:00:00Z'))).toBeNull()
    expect(filingOverdueWarning({ periodLabel: 'มิถุนายน 2569', status: 'filed', filingDueDate: due }, new Date('2026-08-02T03:00:00Z'))).toBeNull()
    expect(isFilingOverdue('filed', due, new Date('2026-09-01T03:00:00Z'))).toBe(false)
  })
})

describe('ยอดรวมของรอบนำส่ง (`33` §16)', () => {
  const rows: FilingTotalSource[] = [
    { status: 'active', filingForm: 'PND3', whtSatang: 1_350_00, grossSatang: 45_000_00 },
    { status: 'active', filingForm: 'PND53', whtSatang: 360_00, grossSatang: 12_000_00 },
    { status: 'active', filingForm: 'PND3', whtSatang: 90_00, grossSatang: 3_000_00 },
  ]

  it('แยกยอดตามแบบถูกต้องเมื่อมีทั้งบุคคลธรรมดาและนิติบุคคลในรอบเดียวกัน', () => {
    const totals = summarizeFilingTotals(rows)
    expect(totals.pnd3Satang).toBe(1_440_00)
    expect(totals.pnd53Satang).toBe(360_00)
    expect(totals.activeCount).toBe(3)
    expect(totals.grossSatang).toBe(60_000_00)
  })

  it('ใบที่ cancelled ไม่ถูกนับในยอดใด ๆ แต่ยังนับจำนวนไว้ให้ตรวจสอบได้', () => {
    const withCancelled = summarizeFilingTotals([
      ...rows,
      { status: 'cancelled', filingForm: 'PND53', whtSatang: 330_00, grossSatang: 11_000_00 },
    ])
    expect(withCancelled.pnd53Satang).toBe(360_00)
    expect(withCancelled.grossSatang).toBe(60_000_00)
    expect(withCancelled.activeCount).toBe(3)
    expect(withCancelled.cancelledCount).toBe(1)
  })

  it('ไม่มีใบเลย ⇒ ยอดเป็นศูนย์ (ไม่ใช่ NaN/undefined)', () => {
    expect(summarizeFilingTotals([])).toEqual({
      pnd3Satang: 0,
      pnd53Satang: 0,
      activeCount: 0,
      cancelledCount: 0,
      grossSatang: 0,
    })
  })
})

describe('State machine + เหตุผลบังคับ (`33` §10/§11)', () => {
  it('ยกเลิกใบที่ active ได้ · ใบที่ยกเลิกแล้วยกเลิกซ้ำไม่ได้ (terminal)', () => {
    expect(() => assertCertificateCancellable('active')).not.toThrow()
    try {
      assertCertificateCancellable('cancelled')
      expect.unreachable('ต้องโยน error')
    } catch (error) {
      expect(codeOf(error)).toBe('WHT_CERTIFICATE_INVALID_STATUS')
    }
  })

  it('ยกเลิกโดยไม่กรอกเหตุผล ⇒ WHT_CANCEL_REQUIRES_REASON', () => {
    expect(requireWhtCancelReason(' ฐานหักผิด ')).toBe('ฐานหักผิด')
    for (const empty of [null, undefined, '', '   ']) {
      try {
        requireWhtCancelReason(empty)
        expect.unreachable('ต้องโยน error')
      } catch (error) {
        expect(codeOf(error)).toBe('WHT_CANCEL_REQUIRES_REASON')
      }
    }
  })

  it('mark-filed ได้เฉพาะรอบที่ pending — ยื่นแล้ว mark ซ้ำไม่ได้', () => {
    expect(() => assertFilingMarkable('pending')).not.toThrow()
    try {
      assertFilingMarkable('filed')
      expect.unreachable('ต้องโยน error')
    } catch (error) {
      expect(codeOf(error)).toBe('WHT_FILING_ALREADY_FILED')
    }
  })
})

describe('แบบข้อมูลใบ 50 ทวิ (`28` §6.3)', () => {
  const source: WhtCertificateDocSource = {
    certificateNumber: 'WHT-2569-001',
    status: 'active',
    cancelReason: null,
    cancelledAt: null,
    replacesCertificateNumber: null,
    deliveryFormat: 'paper',
    filingForm: 'PND3',
    incomeType: 'ค่าจ้างทำของ มาตรา 40(8)',
    paymentDate: PAYMENT_AT,
    grossSatang: 45_000_00,
    whtSatang: 1_350_00,
    payer: { name: 'AssetRecovery', taxId: '0105560000000', address: 'กรุงเทพฯ', phone: '021234567' },
    payee: { name: 'ประยุทธ์ บุญมี', taxId: '3100000001234', address: EMPTY_FIELD_TEXT, phone: null },
  }

  it('ประกอบข้อความเป็น พ.ศ. + คั่นหลักพัน + ยอดสุทธิ = gross − wht (ห้ามคำนวณซ้ำที่ component)', () => {
    const doc = buildWhtCertificateDoc(source)
    expect(doc.paymentDateLabel).toBe('25/06/2569')
    expect(doc.grossText).toBe('45,000.00')
    expect(doc.whtText).toBe('1,350.00')
    expect(doc.netText).toBe('43,650.00')
    expect(doc.whtInWordsText).toContain('บาท')
    expect(doc.fileName).toBe('WHT-2569-001.pdf')
    expect(doc.cancelNote).toBeNull()
    expect(doc.replacesNote).toBeNull()
  })

  it('ใบที่ยกเลิกยังพิมพ์ได้ แต่ต้องมีแถบ "ยกเลิก" + อ้างฉบับที่ออกแทนได้ 2 ทาง', () => {
    const doc = buildWhtCertificateDoc({
      ...source,
      status: 'cancelled',
      cancelReason: 'ฐานหักผิด',
      cancelledAt: new Date('2026-07-01T03:00:00Z'),
      replacesCertificateNumber: 'WHT-2569-000',
    })
    expect(doc.isCancelled).toBe(true)
    expect(doc.cancelNote).toContain('01/07/2569')
    expect(doc.cancelNote).toContain('ฐานหักผิด')
    expect(doc.replacesNote).toContain('WHT-2569-000')
  })
})
