import { describe, expect, it } from 'vitest'
import { isAccountingError } from '@/lib/accounting/errors'
import {
  assertNoOpenPayouts,
  assertPeriodActionStatus,
  assertPeriodEnded,
  assertPeriodTransition,
  assertReadyToSend,
  assertUnlockAllowed,
  canTransitionPeriod,
  evaluateReadiness,
  isPeriodEnded,
  nextPeriodKey,
  periodCloseAvailableFrom,
  periodCloseAvailableHint,
  periodActionsFor,
  periodKeyOf,
  periodLabelOf,
  periodOrdinal,
  periodRangeOf,
  periodStatusLabel,
  periodYearCe,
  PERIOD_TRANSITIONS,
  type ReadinessInput,
  readinessDescription,
  buildPeriodClosedLookup,
  PERIOD_CLOSED_CANCEL_HINT,
} from '@/lib/accounting/period'

/** `30` §16 — Readiness Check 3 เงื่อนไข + state machine `23` §6.13 */

function codeOf(run: () => void): string {
  try {
    run()
  } catch (error) {
    if (isAccountingError(error)) return error.code
    throw error
  }
  return 'NO_ERROR'
}

const readyInput: ReadinessInput = {
  criticalOpen: [],
  warningOpenCount: 0,
  unmatchedBankCount: 0,
  billingMismatches: [],
}

describe('ป้ายชื่อรอบ (พ.ศ. + เดือนไทย — Rule 01)', () => {
  it('ประกอบป้ายตรงรูปแบบ `billing_batches.period`', () => {
    expect(periodLabelOf({ yearBe: 2569, month: 6 })).toBe('มิถุนายน 2569')
    expect(periodLabelOf({ yearBe: 2569, month: 12 })).toBe('ธันวาคม 2569')
  })

  it('งวดของ instant ยึดปฏิทินไทย — เที่ยงคืนวันที่ 1 ตามเวลาไทยยังเป็นเดือนใหม่', () => {
    // 2026-05-31T17:00:00Z = 1 มิ.ย. 2026 00:00 ไทย ⇒ มิถุนายน 2569
    expect(periodKeyOf(new Date('2026-05-31T17:00:00Z'))).toEqual({ yearBe: 2569, month: 6 })
    // 2026-05-31T16:59:00Z = 31 พ.ค. 23:59 ไทย ⇒ ยังเป็นพฤษภาคม
    expect(periodKeyOf(new Date('2026-05-31T16:59:00Z'))).toEqual({ yearBe: 2569, month: 5 })
  })

  it('เดือนไม่ถูกต้อง → RangeError (ไม่ปล่อยป้ายเพี้ยน)', () => {
    expect(() => periodLabelOf({ yearBe: 2569, month: 13 })).toThrow(RangeError)
  })

  it('เดินงวดถัดไปข้ามปีได้ + เรียงลำดับเวลาถูก', () => {
    expect(nextPeriodKey({ yearBe: 2569, month: 12 })).toEqual({ yearBe: 2570, month: 1 })
    expect(periodOrdinal({ yearBe: 2570, month: 1 })).toBeGreaterThan(periodOrdinal({ yearBe: 2569, month: 12 }))
    expect(periodYearCe({ yearBe: 2569, month: 6 })).toBe(2026)
  })
})

describe('state machine ของรอบบัญชี (`23` §6.13)', () => {
  it('เดินตามลำดับ collecting → sent_to_accountant → locked', () => {
    expect(PERIOD_TRANSITIONS.collecting).toEqual(['sent_to_accountant'])
    expect(PERIOD_TRANSITIONS.sent_to_accountant).toEqual(['locked'])
  })

  it('ปลดล็อกกลับไป sent_to_accountant เท่านั้น ไม่กลับ collecting (`30` §9)', () => {
    expect(PERIOD_TRANSITIONS.locked).toEqual(['sent_to_accountant'])
    expect(canTransitionPeriod('locked', 'collecting')).toBe(false)
    expect(codeOf(() => assertPeriodTransition('locked', 'collecting'))).toBe('PERIOD_INVALID_STATUS')
  })

  it('ข้ามขั้น collecting → locked ไม่ได้', () => {
    expect(codeOf(() => assertPeriodTransition('collecting', 'locked'))).toBe('PERIOD_INVALID_STATUS')
  })

  it('ป้ายสถานะมาจากตารางนโยบาย `13` §6.11 ตัวเดียว', () => {
    expect(periodStatusLabel('locked')).toBe('ปิดรอบแล้ว')
    expect(periodStatusLabel('collecting')).toBe('กำลังรวบรวม')
  })
})

describe('ยาม action ของรอบบัญชี (`30` §9–§10 · `24` §6.7)', () => {
  it('แต่ละ action สั่งได้จากสถานะเดียวเท่านั้น', () => {
    expect(() => assertPeriodActionStatus('send', 'collecting')).not.toThrow()
    expect(() => assertPeriodActionStatus('lock', 'sent_to_accountant')).not.toThrow()
    expect(() => assertPeriodActionStatus('unlock', 'locked')).not.toThrow()
  })

  it('ส่งบัญชีรอบที่ `locked` ไม่ได้ — ต้องไปทางปลดล็อกที่บังคับสิทธิ์ผู้บริหาร (`30` §10)', () => {
    expect(codeOf(() => assertPeriodActionStatus('send', 'locked'))).toBe('PERIOD_INVALID_STATUS')
    expect(codeOf(() => assertPeriodActionStatus('send', 'sent_to_accountant'))).toBe('PERIOD_INVALID_STATUS')
  })

  it('ปลดล็อกรอบที่ยังไม่ `locked` ไม่ได้ — กันการข้าม Readiness Check (`24` §6.7)', () => {
    expect(codeOf(() => assertPeriodActionStatus('unlock', 'collecting'))).toBe('PERIOD_INVALID_STATUS')
    expect(codeOf(() => assertPeriodActionStatus('unlock', 'sent_to_accountant'))).toBe('PERIOD_INVALID_STATUS')
  })

  it('ล็อกรอบที่ยัง `collecting` ไม่ได้', () => {
    expect(codeOf(() => assertPeriodActionStatus('lock', 'collecting'))).toBe('PERIOD_INVALID_STATUS')
  })
})

describe('ปลดล็อกรอบ locked (`30` §16)', () => {
  it('ไม่ใช่ผู้บริหาร → UNLOCK_REQUIRES_EXECUTIVE (403)', () => {
    expect(codeOf(() => assertUnlockAllowed(false))).toBe('UNLOCK_REQUIRES_EXECUTIVE')
  })

  it('ผู้บริหารผ่าน', () => {
    expect(() => assertUnlockAllowed(true)).not.toThrow()
  })
})

describe('Readiness Check 3 เงื่อนไข (`30` §6.2 · §16)', () => {
  it('ครบทั้ง 3 เงื่อนไข → ready', () => {
    const result = evaluateReadiness(readyInput)
    expect(result.ready).toBe(true)
    expect(result.checks.map((check) => check.key)).toEqual([
      'billing_revenue_sync',
      'bank_reconcile',
      'no_critical_exception',
    ])
    expect(() => assertReadyToSend(result)).not.toThrow()
  })

  it('มี critical เปิดอยู่ → NOT_READY_CRITICAL_OPEN พร้อมรายชื่อ', () => {
    const result = evaluateReadiness({
      ...readyInput,
      criticalOpen: [{ id: 'exc-1', title: 'ไม่มีใบเสร็จ', sourceModule: 'payout' }],
    })
    expect(result.ready).toBe(false)
    expect(codeOf(() => assertReadyToSend(result))).toBe('NOT_READY_CRITICAL_OPEN')
    try {
      assertReadyToSend(result)
    } catch (error) {
      if (!isAccountingError(error)) throw error
      expect(error.context?.criticalExceptions).toEqual([
        { id: 'exc-1', title: 'ไม่มีใบเสร็จ', sourceModule: 'payout' },
      ])
    }
  })

  it('กระทบยอดธนาคารไม่ครบ → NOT_READY_RECONCILE_INCOMPLETE', () => {
    const result = evaluateReadiness({ ...readyInput, unmatchedBankCount: 3 })
    expect(codeOf(() => assertReadyToSend(result))).toBe('NOT_READY_RECONCILE_INCOMPLETE')
    expect(result.checks.find((check) => check.key === 'bank_reconcile')?.passed).toBe(false)
  })

  it('ยอดบิลไม่ตรงรายได้ → NOT_READY_BILLING_REVENUE_MISMATCH', () => {
    const result = evaluateReadiness({
      ...readyInput,
      billingMismatches: [
        {
          billingBatchId: 'bb-1',
          batchNumber: 'BL-2569-001',
          companyName: 'ไฟแนนซ์ ก',
          batchTotalSatang: 10000,
          revenueTotalSatang: 12000,
          reason: 'total_mismatch',
        },
      ],
    })
    expect(codeOf(() => assertReadyToSend(result))).toBe('NOT_READY_BILLING_REVENUE_MISMATCH')
  })

  it('warning ผ่านได้แต่ต้องมีข้อความเตือน (`30` §6.2)', () => {
    const result = evaluateReadiness({ ...readyInput, warningOpenCount: 2 })
    expect(result.ready).toBe(true)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('2')
  })

  it('critical มาก่อนเสมอเมื่อผิดหลายข้อพร้อมกัน (ผู้ใช้ต้องเห็นตัวร้ายแรงสุดก่อน)', () => {
    const result = evaluateReadiness({
      criticalOpen: [{ id: 'exc-1', title: 'x', sourceModule: 'bank' }],
      warningOpenCount: 1,
      unmatchedBankCount: 5,
      billingMismatches: [
        {
          billingBatchId: 'bb-2',
          batchNumber: 'BL-2569-002',
          companyName: 'ไฟแนนซ์ ข',
          batchTotalSatang: 0,
          revenueTotalSatang: 5000,
          reason: 'total_mismatch',
        },
      ],
    })
    expect(codeOf(() => assertReadyToSend(result))).toBe('NOT_READY_CRITICAL_OPEN')
  })

  it('มติ PO U87: รายได้ค้างรับยังไม่วางบิล = เตือน ไม่บล็อก (ปิดงวดได้)', () => {
    const result = evaluateReadiness({
      ...readyInput,
      unbilledRevenue: {
        count: 3,
        totalSatang: 321000,
        inDraftCount: 1,
        byCompany: [{ companyName: 'ไฟแนนซ์ ก', count: 3, totalSatang: 321000 }],
      },
    })
    expect(result.ready).toBe(true)
    expect(result.checks.find((check) => check.key === 'billing_revenue_sync')?.passed).toBe(true)
    expect(codeOf(() => assertReadyToSend(result))).toBe('NO_ERROR')
    expect(result.warnings).toEqual([
      'มีรายได้ค้างรับยังไม่วางบิล 3 รายการ ฿3,210.00 (อยู่ในรอบวางบิลร่าง 1 รายการ) — ' +
        'ส่งให้สำนักงานบัญชีบันทึกรายได้ค้างรับ (รายละเอียดอยู่ใน 14_Unbilled_Revenue.csv ของชุดเอกสารบัญชี) · ปิดงวดได้',
    ])
    expect(result.unbilledRevenue.count).toBe(3)
  })

  it('มติ PO U87: ยอดรอบวางบิลไม่ตรงจริง ยังบล็อกแม้มีรายได้ค้างรับร่วมด้วย', () => {
    const result = evaluateReadiness({
      ...readyInput,
      billingMismatches: [
        {
          billingBatchId: 'bb-3',
          batchNumber: 'BL-2569-003',
          companyName: 'ไฟแนนซ์ ค',
          batchTotalSatang: 10700,
          revenueTotalSatang: 21400,
          reason: 'total_mismatch',
        },
      ],
      unbilledRevenue: { count: 1, totalSatang: 10700, inDraftCount: 0, byCompany: [] },
    })
    expect(result.ready).toBe(false)
    expect(codeOf(() => assertReadyToSend(result))).toBe('NOT_READY_BILLING_REVENUE_MISMATCH')
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).not.toContain('รอบวางบิลร่าง')
  })

  it('BUG-160: รอบวางบิลร่างค้าง = เตือน ไม่บล็อก + แสดงเลขรอบไม่เกิน 5 เลข', () => {
    const result = evaluateReadiness({
      ...readyInput,
      draftBillingBatches: {
        count: 7,
        totalSatang: 80250,
        batchNumbers: ['BL-2569-001', 'BL-2569-002', 'BL-2569-003', 'BL-2569-004', 'BL-2569-005', 'BL-2569-006', 'BL-2569-007'],
      },
    })
    expect(result.ready).toBe(true)
    expect(result.warnings).toEqual([
      'มีรอบวางบิลร่างที่ยังไม่ส่งลูกค้า 7 รอบ (BL-2569-001, BL-2569-002, BL-2569-003, BL-2569-004, BL-2569-005 และอีก 2 รอบ) ' +
        'รวม ฿802.50 — ปิดงวดได้ แต่ควรส่งลูกค้าหรือลบรอบร่างให้เรียบร้อยก่อน',
    ])
  })

  it('ไม่มีรายได้ค้างรับ/รอบร่าง ⇒ ไม่มีคำเตือนและสรุปเป็นศูนย์', () => {
    const result = evaluateReadiness(readyInput)
    expect(result.warnings).toEqual([])
    expect(result.unbilledRevenue).toEqual({ count: 0, totalSatang: 0, inDraftCount: 0, byCompany: [] })
    expect(result.draftBillingBatches).toEqual({ count: 0, totalSatang: 0, batchNumbers: [] })
  })
})

describe('ปุ่มบนแถวรอบบัญชี (`30` §8)', () => {
  const accountant = { canManagePeriod: true, canUnlockPeriod: false, canExportPack: true }
  const executive = { canManagePeriod: false, canUnlockPeriod: true, canExportPack: true }
  const viewer = { canManagePeriod: false, canUnlockPeriod: false, canExportPack: false }

  it('บัญชี: `collecting` ส่งได้ · `sent_to_accountant` ล็อกได้ · ปลดล็อกไม่ได้เลย (`30` §10)', () => {
    expect(periodActionsFor('collecting', accountant)).toMatchObject({ canSend: true, canLock: false, canUnlock: false })
    expect(periodActionsFor('sent_to_accountant', accountant)).toMatchObject({ canSend: false, canLock: true })
    expect(periodActionsFor('locked', accountant).canUnlock).toBe(false)
  })

  it('ผู้บริหาร: ล็อกงวดได้ (`30` §9 "บัญชี/Executive ยืนยันปิดงวด") และปลดล็อกได้คนเดียว', () => {
    expect(periodActionsFor('sent_to_accountant', executive).canLock).toBe(true)
    expect(periodActionsFor('locked', executive).canUnlock).toBe(true)
    // ส่งสำนักงานบัญชียังเป็นงานของบัญชี
    expect(periodActionsFor('collecting', executive).canSend).toBe(false)
  })

  it('คนที่ดูอย่างเดียว (การเงิน) ไม่มีปุ่มเปลี่ยนสถานะและ Export ไม่ได้', () => {
    for (const status of ['collecting', 'sent_to_accountant', 'locked'] as const) {
      expect(periodActionsFor(status, viewer)).toEqual({
        canSend: false,
        canLock: false,
        canUnlock: false,
        canExport: false,
        closeBlockedHint: null,
      })
    }
  })

  it('ปุ่มยึด state machine เดียวกับ API — ไม่มีทางลัดข้ามขั้น', () => {
    expect(periodActionsFor('locked', accountant).canLock).toBe(false)
    expect(periodActionsFor('collecting', executive).canUnlock).toBe(false)
  })
})

// ── มติ PO U51 — ส่ง/ล็อกได้ตั้งแต่ 00:00 น. วันที่ 1 ของเดือนถัดไป (เวลาไทย) ─────────────

describe('งวดสิ้นเดือนแล้วจึงส่ง/ล็อกได้ (U51)', () => {
  const october = { yearBe: 2569, month: 10 }
  const december = { yearBe: 2569, month: 12 }

  it('งวด ต.ค. 2569 เปิดให้ส่ง/ล็อกที่ 01/11/2569 00:00 น. ไทย = 2026-10-31T17:00Z', () => {
    expect(periodCloseAvailableFrom(october).toISOString()).toBe('2026-10-31T17:00:00.000Z')
    expect(periodCloseAvailableHint(october)).toBe('ส่ง/ล็อกได้ตั้งแต่ 01/11/2569')
  })

  it('งวด ธ.ค. ข้ามปี → 01/01 ของปีถัดไป', () => {
    expect(periodCloseAvailableFrom(december).toISOString()).toBe('2026-12-31T17:00:00.000Z')
    expect(periodCloseAvailableHint(december)).toBe('ส่ง/ล็อกได้ตั้งแต่ 01/01/2570')
  })

  it('เส้นขอบ: 31/10 23:59 น. ไทย ห้าม · 01/11 00:00 น. ได้', () => {
    const lastMinute = new Date('2026-10-31T16:59:00Z') // 31/10/2569 23:59 น.
    const lastMs = new Date('2026-10-31T16:59:59.999Z')
    const midnight = new Date('2026-10-31T17:00:00Z') // 01/11/2569 00:00 น.
    expect(isPeriodEnded(october, lastMinute)).toBe(false)
    expect(isPeriodEnded(october, lastMs)).toBe(false)
    expect(isPeriodEnded(october, midnight)).toBe(true)
    expect(() => assertPeriodEnded(october, midnight)).not.toThrow()
  })

  it('ยังไม่สิ้นเดือน ⇒ PERIOD_NOT_ENDED พร้อมวันที่ พ.ศ. ในข้อความ', () => {
    try {
      assertPeriodEnded(october, new Date('2026-10-31T16:59:00Z'))
      expect.unreachable()
    } catch (error) {
      expect(isAccountingError(error) && error.code).toBe('PERIOD_NOT_ENDED')
      if (!isAccountingError(error)) return
      expect(error.status).toBe(400)
      expect(error.userMessage).toContain('01/11/2569')
      expect(error.userMessage).not.toMatch(/§|`\d{2}`/)
      expect(error.context).toEqual({ availableFrom: '2026-10-31T17:00:00.000Z' })
    }
  })

  it('ปุ่มส่ง/ล็อกยังแสดงแต่มีข้อความบล็อกเมื่อยังไม่สิ้นเดือน · สิ้นเดือนแล้ว = null', () => {
    const accountant = { canManagePeriod: true, canUnlockPeriod: false, canExportPack: true }
    const notEnded = { key: october, periodEnded: false }
    expect(periodActionsFor('collecting', accountant, notEnded)).toMatchObject({
      canSend: true,
      closeBlockedHint: 'ส่ง/ล็อกได้ตั้งแต่ 01/11/2569',
    })
    expect(periodActionsFor('sent_to_accountant', accountant, notEnded).closeBlockedHint).not.toBeNull()
    expect(periodActionsFor('collecting', accountant, { key: october, periodEnded: true }).closeBlockedHint).toBeNull()
    // ไม่มีปุ่มให้กดอยู่แล้ว (locked) ⇒ ไม่ต้องแสดงข้อความ
    expect(periodActionsFor('locked', accountant, notEnded).closeBlockedHint).toBeNull()
  })

  it('Readiness มีข้อ "งวดสิ้นเดือนแล้ว" เป็นข้อแรก · ไม่ผ่าน ⇒ ไม่พร้อม + assertReadyToSend โยน PERIOD_NOT_ENDED', () => {
    const clean: ReadinessInput = {
      criticalOpen: [],
      warningOpenCount: 0,
      unmatchedBankCount: 0,
      billingMismatches: [],
    }
    const early = evaluateReadiness({ ...clean, periodEnd: { key: october, now: new Date('2026-10-31T16:59:00Z') } })
    expect(early.checks[0]).toMatchObject({ key: 'period_ended', passed: false, detail: 'ส่ง/ล็อกได้ตั้งแต่ 01/11/2569' })
    expect(early.ready).toBe(false)
    expect(() => assertReadyToSend(early)).toThrow(/PERIOD_NOT_ENDED/)

    const onTime = evaluateReadiness({ ...clean, periodEnd: { key: october, now: new Date('2026-10-31T17:00:00Z') } })
    expect(onTime.checks.map((check) => check.key)).toEqual([
      'period_ended',
      'billing_revenue_sync',
      'bank_reconcile',
      'no_critical_exception',
    ])
    expect(onTime.ready).toBe(true)
    expect(() => assertReadyToSend(onTime)).not.toThrow()
  })
})

describe('BUG-163 — หัว Modal ตรวจความพร้อมนับจำนวนข้อจากรายการจริง', () => {
  it('ใช้จำนวนรายการที่ได้จาก API', () => {
    expect(readinessDescription(4)).toBe('เงื่อนไข 4 ข้อ — ตรวจสดทุกครั้งที่เปิดหน้าต่างนี้ ไม่มีทางลัดข้าม')
    expect(readinessDescription(3)).toContain('เงื่อนไข 3 ข้อ')
  })
  it('ยังไม่มีผลตรวจ ⇒ ไม่ระบุจำนวน', () => {
    expect(readinessDescription(null)).not.toMatch(/\d/)
  })
})

describe('BUG-169 — ปุ่มยกเลิกเอกสารปิดเมื่องวดปิดแล้ว (สถานะงวดติดไปกับ DTO)', () => {
  const lookup = buildPeriodClosedLookup([
    { yearBe: 2569, month: 9, status: 'locked' },
    { yearBe: 2569, month: 10, status: 'sent_to_accountant' },
    { yearBe: 2569, month: 11, status: 'collecting' },
  ])

  it('ล็อก/ส่งบัญชีแล้ว ⇒ ปิด · เก็บข้อมูลอยู่หรือยังไม่มีงวด ⇒ เปิด', () => {
    expect(lookup(new Date('2026-09-15T05:00:00Z'))).toBe(true)
    expect(lookup(new Date('2026-10-06T05:00:00Z'))).toBe(true)
    expect(lookup(new Date('2026-11-02T05:00:00Z'))).toBe(false)
    expect(lookup(new Date('2026-12-02T05:00:00Z'))).toBe(false)
  })

  it('ยึดปฏิทินไทย — 30/09 23:30 น. (UTC 16:30) ยังเป็นงวด ก.ย.', () => {
    expect(lookup(new Date('2026-09-30T16:30:00Z'))).toBe(true)
    expect(lookup(new Date('2026-08-31T17:30:00Z'))).toBe(true)
    expect(lookup(new Date('2026-08-31T16:30:00Z'))).toBe(false)
  })

  it('ข้อความ tooltip ไม่มีเลขอ้างอิงสเปค', () => {
    expect(PERIOD_CLOSED_CANCEL_HINT).toBe('งวดปิดแล้ว ต้องทำผ่าน Adjustment')
  })
})

describe('มติ PO U112 — รอบจ่ายค้างบล็อกการส่ง/ล็อกงวด', () => {
  const batch = (name: string) => ({
    id: name,
    name,
    status: 'checking' as const,
    netSatang: 100,
    createdAt: new Date('2026-08-10T03:00:00Z'),
  })
  const base = { criticalOpen: [], warningOpenCount: 0, unmatchedBankCount: 0, billingMismatches: [] }

  it('มีรอบค้าง ⇒ ข้อ no_open_payouts ไม่ผ่าน · assertReadyToSend โยน PERIOD_HAS_OPEN_PAYOUTS พร้อมชื่อรอบ', () => {
    const result = evaluateReadiness({ ...base, openPayoutBatches: [batch('รอบ A')] })
    expect(result.ready).toBe(false)
    expect(result.checks.find((check) => check.key === 'no_open_payouts')?.detail).toContain('รอบ A (รอตรวจสอบ)')
    try {
      assertReadyToSend(result)
      expect.unreachable()
    } catch (error) {
      expect(isAccountingError(error) && error.code).toBe('PERIOD_HAS_OPEN_PAYOUTS')
    }
  })

  it('ไม่มีรอบค้าง ⇒ ผ่าน · ไม่ส่งข้อมูลรอบจ่าย = ไม่มีข้อนี้ (เทสต์เดิม)', () => {
    const ok = evaluateReadiness({ ...base, openPayoutBatches: [] })
    expect(ok.ready).toBe(true)
    expect(() => assertNoOpenPayouts([])).not.toThrow()
    expect(evaluateReadiness(base).checks.some((check) => check.key === 'no_open_payouts')).toBe(false)
  })

  it('ข้อความแสดงชื่อไม่เกิน 5 รอบ ที่เหลือบอกเป็นจำนวน', () => {
    const many = ['1', '2', '3', '4', '5', '6', '7'].map((n) => batch(`รอบ ${n}`))
    expect(() => assertNoOpenPayouts(many)).toThrow(/และอีก 2 รอบ/)
  })

  it('ช่วงงวดตามปฏิทินไทย', () => {
    expect(periodRangeOf({ yearBe: 2569, month: 8 })).toEqual({
      start: new Date('2026-07-31T17:00:00Z'),
      end: new Date('2026-08-31T17:00:00Z'),
    })
  })
})
