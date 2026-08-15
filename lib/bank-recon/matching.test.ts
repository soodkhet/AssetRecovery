import { describe, expect, it } from 'vitest'
import {
  allowedTargetKind,
  canTransition,
  daysAfter,
  findAutoMatch,
  hasNote,
  isExactMatchAmount,
  isMatched,
  isReconciled,
  manualMatchRequiresNote,
  nextBankMatchStatus,
  transactionSide,
  whtWithheldForReceipt,
  type MatchCandidate,
} from '@/lib/bank-recon/matching'

/** ไฟล์ 35 §6.2–6.4 · §16 · state machine `23` §6.14 */

const billDate = new Date('2026-08-01T00:00:00Z')

function billing(overrides: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    kind: 'billing',
    id: 'bb-1',
    ref: 'BB-2569-08-001',
    amountSatang: 802500,
    altAmountSatang: null,
    referenceDate: billDate,
    ...overrides,
  }
}

function payout(overrides: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    kind: 'payout',
    id: 'pb-1',
    ref: 'PB-2569-08-001',
    amountSatang: 12000000,
    altAmountSatang: null,
    referenceDate: billDate,
    ...overrides,
  }
}

describe('ฝั่งของรายการ', () => {
  it('บวก = เงินเข้าจับกับบิล · ลบ = เงินออกจับกับรอบจ่าย', () => {
    expect(transactionSide(802500)).toBe('in')
    expect(transactionSide(-802500)).toBe('out')
    expect(allowedTargetKind(802500)).toBe('billing')
    expect(allowedTargetKind(-802500)).toBe('payout')
  })
})

describe('findAutoMatch', () => {
  const base = { amountSatang: 802500, transactionDate: new Date('2026-08-05T00:00:00Z'), toleranceDays: 7 }

  it('ยอดตรงเป๊ะ + ในช่วง tolerance + ผู้สมัครรายเดียว ⇒ auto_matched (`35` §16)', () => {
    const outcome = findAutoMatch(base, [billing()])
    expect(outcome.matched).toBe(true)
    if (outcome.matched) {
      expect(outcome.candidate.id).toBe('bb-1')
      expect(outcome.matchedAmountSatang).toBe(802500)
    }
  })

  it('**ผู้สมัคร 2 รายยอดเท่ากัน ⇒ ไม่จับคู่** ปล่อยเป็น unmatched (DoD ของ 4.2)', () => {
    const outcome = findAutoMatch(base, [billing(), billing({ id: 'bb-2', ref: 'BB-2569-08-002' })])
    expect(outcome).toEqual({ matched: false, reason: 'ambiguous', candidateCount: 2 })
  })

  it('A1 — ลูกค้าหัก WHT ก่อนโอน: เทียบ total − wht ด้วย', () => {
    const outcome = findAutoMatch(
      { ...base, amountSatang: 780000 },
      [billing({ altAmountSatang: 780000 })],
    )
    expect(outcome.matched).toBe(true)
    if (outcome.matched) expect(outcome.matchedAmountSatang).toBe(780000)
  })

  it('เกิน tolerance หรือเงินเข้าก่อนวันวางบิล ⇒ ไม่จับคู่', () => {
    // วันวางบิล 01/08 + tolerance 7 วัน ⇒ รับได้ถึง 08/08 เท่านั้น
    expect(findAutoMatch({ ...base, transactionDate: new Date('2026-08-08T00:00:00Z') }, [billing()]).matched).toBe(
      true,
    )
    expect(findAutoMatch({ ...base, transactionDate: new Date('2026-08-09T00:00:00Z') }, [billing()]).matched).toBe(
      false,
    )
    expect(findAutoMatch({ ...base, transactionDate: new Date('2026-07-31T00:00:00Z') }, [billing()]).matched).toBe(
      false,
    )
  })

  it('ยอดต่างแม้ 1 สตางค์ ⇒ ไม่ auto (ต้องให้คนตัดสินพร้อมหมายเหตุ)', () => {
    expect(findAutoMatch({ ...base, amountSatang: 802501 }, [billing()]).matched).toBe(false)
  })

  it('เงินออกไม่จับกับรอบวางบิล แม้ยอดตรง', () => {
    const outcome = findAutoMatch({ ...base, amountSatang: -802500 }, [billing()])
    expect(outcome).toEqual({ matched: false, reason: 'no_candidate', candidateCount: 0 })
  })

  it('เงินออกจับกับรอบจ่ายที่ net ตรงกัน', () => {
    const outcome = findAutoMatch(
      { amountSatang: -12000000, transactionDate: new Date('2026-08-02T00:00:00Z'), toleranceDays: 7 },
      [payout(), billing()],
    )
    expect(outcome.matched).toBe(true)
    if (outcome.matched) expect(outcome.candidate.kind).toBe('payout')
  })

  it('เอกสารที่ไม่มีวันอ้างอิง ⇒ ไม่เข้าเกณฑ์อัตโนมัติ', () => {
    expect(findAutoMatch(base, [billing({ referenceDate: null })]).matched).toBe(false)
  })

  it('daysAfter นับเป็นวันเต็ม', () => {
    expect(daysAfter(billDate, new Date('2026-08-08T00:00:00Z'))).toBe(7)
    expect(daysAfter(billDate, new Date('2026-07-30T00:00:00Z'))).toBe(-2)
  })
})

describe('MATCH_NOTE_REQUIRED (`35` §11)', () => {
  it('ยอดตรงเป๊ะ + ไม่ใช่ re-match ⇒ ไม่บังคับหมายเหตุ', () => {
    expect(manualMatchRequiresNote({ exactAmount: true, isRematch: false })).toBe(false)
  })

  it('ยอดไม่ตรง หรือเปลี่ยนการจับคู่เดิม ⇒ บังคับ', () => {
    expect(manualMatchRequiresNote({ exactAmount: false, isRematch: false })).toBe(true)
    expect(manualMatchRequiresNote({ exactAmount: true, isRematch: true })).toBe(true)
  })

  it('isExactMatchAmount รับทั้งยอดเต็มและ total − wht (A1)', () => {
    expect(isExactMatchAmount(802500, { amountSatang: 802500, altAmountSatang: null })).toBe(true)
    expect(isExactMatchAmount(-780000, { amountSatang: 802500, altAmountSatang: 780000 })).toBe(true)
    expect(isExactMatchAmount(800000, { amountSatang: 802500, altAmountSatang: 780000 })).toBe(false)
  })

  it('whtWithheldForReceipt คืนส่วนต่างเฉพาะตอนรับยอด total − wht (A1)', () => {
    // ลูกค้าหัก WHT ก่อนโอน ⇒ เข้าจริง 7,800.00 จากบิล 8,025.00 ⇒ เครดิตภาษี 225.00
    expect(whtWithheldForReceipt(780000, { amountSatang: 802500, altAmountSatang: 780000 })).toBe(22500)
    expect(whtWithheldForReceipt(-780000, { amountSatang: 802500, altAmountSatang: 780000 })).toBe(22500)
    // รับเต็มจำนวน = ไม่มีการหักภาษี
    expect(whtWithheldForReceipt(802500, { amountSatang: 802500, altAmountSatang: 780000 })).toBe(0)
    expect(whtWithheldForReceipt(802500, { amountSatang: 802500, altAmountSatang: null })).toBe(0)
    // ยอดไม่ตรงทั้งสองค่า (จ่ายบางส่วน/ค่าธรรมเนียม) — ห้ามเดาว่าเป็นภาษีหัก ณ ที่จ่าย
    expect(whtWithheldForReceipt(800000, { amountSatang: 802500, altAmountSatang: 780000 })).toBe(0)
  })

  it('hasNote ตัดช่องว่างล้วนทิ้ง', () => {
    expect(hasNote('   ')).toBe(false)
    expect(hasNote(null)).toBe(false)
    expect(hasNote('ลูกค้าหักค่าธรรมเนียม')).toBe(true)
  })
})

describe('state machine `23` §6.14', () => {
  it('unmatched → auto/manual/resolved ได้', () => {
    expect(nextBankMatchStatus('unmatched', 'auto_match')).toBe('auto_matched')
    expect(nextBankMatchStatus('unmatched', 'manual_match')).toBe('manual_matched')
    expect(nextBankMatchStatus('unmatched', 'resolve_unmatched')).toBe('unmatched_resolved')
  })

  it('re-match ทำได้เฉพาะทาง manual (ระบบไม่ auto ทับของเดิม)', () => {
    expect(nextBankMatchStatus('auto_matched', 'manual_match')).toBe('manual_matched')
    expect(nextBankMatchStatus('manual_matched', 'manual_match')).toBe('manual_matched')
    expect(nextBankMatchStatus('auto_matched', 'auto_match')).toBeNull()
  })

  it('unmatched_resolved เป็น terminal — จับคู่ต่อไม่ได้', () => {
    expect(canTransition('unmatched_resolved', 'manual_match')).toBe(false)
    expect(nextBankMatchStatus('unmatched_resolved', 'resolve_unmatched')).toBeNull()
  })

  it('ปิดรายการที่จับคู่แล้วไม่ได้', () => {
    expect(canTransition('auto_matched', 'resolve_unmatched')).toBe(false)
  })

  it('Readiness นับ unmatched_resolved เป็นครบ (`35` §16 · `30`)', () => {
    expect(isReconciled('unmatched_resolved')).toBe(true)
    expect(isReconciled('auto_matched')).toBe(true)
    expect(isReconciled('unmatched')).toBe(false)
    expect(isMatched('unmatched_resolved')).toBe(false)
  })
})
