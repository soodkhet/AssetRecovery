import { describe, expect, it } from 'vitest'
import {
  allowedTargetKind,
  canTransition,
  daysAfter,
  debitNoteReferenceDate,
  findAutoMatch,
  findMatchProposals,
  hasNote,
  isExactMatchAmount,
  matchCandidateOptionText,
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

  it('whtWithheldForReceipt คืนส่วนต่างเฉพาะตอนรับยอด total − wht (A1) · เพดาน 0', () => {
    const none = { priorReceivedSatang: 0, priorWhtSatang: 0, toleranceSatang: 0 }
    // ลูกค้าหัก WHT ก่อนโอน ⇒ เข้าจริง 7,800.00 จากบิล 8,025.00 ⇒ เครดิตภาษี 225.00
    expect(whtWithheldForReceipt(780000, { amountSatang: 802500, altAmountSatang: 780000 }, none)).toBe(22500)
    expect(whtWithheldForReceipt(-780000, { amountSatang: 802500, altAmountSatang: 780000 }, none)).toBe(22500)
    // รับเต็มจำนวน = ไม่มีการหักภาษี
    expect(whtWithheldForReceipt(802500, { amountSatang: 802500, altAmountSatang: 780000 }, none)).toBe(0)
    expect(whtWithheldForReceipt(802500, { amountSatang: 802500, altAmountSatang: null }, none)).toBe(0)
    // ยอดไม่ตรงทั้งสองค่า + ไม่มีเพดาน — ห้ามเดาว่าเป็นภาษีหัก ณ ที่จ่าย
    expect(whtWithheldForReceipt(800000, { amountSatang: 802500, altAmountSatang: 780000 }, none)).toBe(0)
  })

  it('U163 — ภาษีลูกค้าหัก + ค่าธรรมเนียมโอน: ขาดจากยอดคาดรับไม่เกินเพดาน ⇒ ภาษีเต็ม', () => {
    const bill = { amountSatang: 321000, altAmountSatang: 312000 }
    const ctx = { priorReceivedSatang: 0, priorWhtSatang: 0, toleranceSatang: 5000 }
    expect(whtWithheldForReceipt(310500, bill, ctx)).toBe(9000)
    expect(whtWithheldForReceipt(306999, bill, ctx)).toBe(0)
    expect(whtWithheldForReceipt(321000, bill, ctx)).toBe(0)
    // ลูกค้าไม่ได้ตั้งให้หัก ⇒ ไม่มีภาษี (ส่วนต่างเป็นเรื่องค่าธรรมเนียมล้วน)
    expect(whtWithheldForReceipt(310500, { amountSatang: 321000, altAmountSatang: null }, ctx)).toBe(0)
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

describe('BUG-159 — ข้อความตัวเลือกจับคู่ Manual แสดงยอดที่ใช้เทียบจริง', () => {
  const batch = { label: 'BL-2569-003', amountSatang: 80250, altAmountSatang: 78000 }

  it('เงินเข้า ฿780.00 ตรงยอดหลังลูกค้าหัก ⇒ แสดง ฿780.00 นำ + ยอดเต็มเป็นข้อความรอง', () => {
    expect(matchCandidateOptionText(78000, batch)).toBe(
      'BL-2569-003 · ฿780.00 (ยอดตรงหลังลูกค้าหัก ณ ที่จ่าย · ยอดเต็ม ฿802.50)',
    )
  })

  it('ตรงยอดเต็ม ⇒ ยอดเต็ม (ยอดตรง)', () => {
    expect(matchCandidateOptionText(80250, batch)).toBe('BL-2569-003 · ฿802.50 (ยอดตรง)')
  })

  it('ไม่ตรงทั้งสองยอด ⇒ ยอดเต็ม + ยอดคาดรับหลังหัก · ไม่มียอดหลังหัก ⇒ ยอดเต็มอย่างเดียว', () => {
    expect(matchCandidateOptionText(50000, batch)).toBe('BL-2569-003 · ฿802.50 (คาดรับหลังลูกค้าหัก ณ ที่จ่าย ฿780.00)')
    expect(matchCandidateOptionText(-50000, { label: 'PB-1', amountSatang: 60000, altAmountSatang: null })).toBe(
      'PB-1 · ฿600.00',
    )
  })
})

describe('findMatchProposals — จับคู่ทางกลับแบบเสนอ (มติ PO U137)', () => {
  const sent = new Date('2026-08-01T00:00:00Z')
  const day = (offset: number): Date => new Date(sent.getTime() + offset * 86_400_000)
  const billing: MatchCandidate = {
    kind: 'billing',
    id: 'bill-1',
    ref: 'BL-1',
    amountSatang: 802500,
    altAmountSatang: 780000,
    referenceDate: sent,
  }
  const payout: MatchCandidate = {
    kind: 'payout',
    id: 'pay-1',
    ref: 'PB-1',
    amountSatang: 1200000,
    altAmountSatang: null,
    referenceDate: sent,
  }

  it('ยอดตรง + วันในช่วง tolerance ของบัญชี ⇒ เสนอ · ยอด total − wht (A1) ก็เสนอ', () => {
    const proposals = findMatchProposals(
      [billing],
      [
        { id: 'tx-full', amountSatang: 802500, transactionDate: day(3), toleranceDays: 7 },
        { id: 'tx-late', amountSatang: 802500, transactionDate: day(9), toleranceDays: 7 },
        { id: 'tx-early', amountSatang: 802500, transactionDate: day(-1), toleranceDays: 7 },
        { id: 'tx-other', amountSatang: 802400, transactionDate: day(1), toleranceDays: 7 },
      ],
    )
    expect(proposals.map((p) => p.transactionId)).toEqual(['tx-full'])
    expect(proposals[0]?.ambiguous).toBe(false)

    const alt = findMatchProposals([billing], [{ id: 'tx-alt', amountSatang: 780000, transactionDate: day(2), toleranceDays: 7 }])
    expect(alt[0]?.matchedAmountSatang).toBe(780000)
  })

  it('ฝั่งเงินต้องตรงชนิดเอกสาร — เงินออกไม่ถูกเสนอให้บิล · เงินเข้าไม่ถูกเสนอให้รอบจ่าย', () => {
    const proposals = findMatchProposals(
      [billing, payout],
      [
        { id: 'tx-out', amountSatang: -802500, transactionDate: day(1), toleranceDays: 7 },
        { id: 'tx-in', amountSatang: 1200000, transactionDate: day(1), toleranceDays: 7 },
        { id: 'tx-pay', amountSatang: -1200000, transactionDate: day(1), toleranceDays: 7 },
      ],
    )
    expect(proposals.map((p) => `${p.candidate.id}:${p.transactionId}`)).toEqual(['pay-1:tx-pay'])
  })

  it('มีหลายทางเลือก ⇒ เสนอทุกคู่แต่ติดธง ambiguous (ไม่เดาแทนคน) · ไม่มีวันอ้างอิง ⇒ ไม่เสนอ', () => {
    const proposals = findMatchProposals(
      [payout, { ...payout, id: 'pay-2', ref: 'PB-2' }],
      [{ id: 'tx-pay', amountSatang: -1200000, transactionDate: day(1), toleranceDays: 7 }],
    )
    expect(proposals).toHaveLength(2)
    expect(proposals.every((p) => p.ambiguous)).toBe(true)

    expect(
      findMatchProposals(
        [{ ...payout, referenceDate: null }],
        [{ id: 'tx-pay', amountSatang: -1200000, transactionDate: day(1), toleranceDays: 7 }],
      ),
    ).toEqual([])
  })
})

describe('มติ O75 — ยอดค้างที่เหลือของรอบที่รับเงินบางส่วนแล้ว (ใบเพิ่มหนี้หลังรับชำระครบ)', () => {
  const later = new Date('2026-08-05T00:00:00Z')

  it('เงินเข้าเท่ายอดค้างที่เหลือ ⇒ ตรง (auto/คู่ที่เสนอ/manual) โดยไม่อนุมานเป็น WHT', () => {
    const candidate = billing({ amountSatang: 1_294_700, remainingAmountSatang: 10_700 })
    expect(findAutoMatch({ amountSatang: 10_700, transactionDate: later, toleranceDays: 7 }, [candidate])).toMatchObject({
      matched: true,
      matchedAmountSatang: 10_700,
    })
    expect(
      findMatchProposals([candidate], [{ id: 'tx-1', amountSatang: 10_700, transactionDate: later, toleranceDays: 7 }]),
    ).toHaveLength(1)
    expect(isExactMatchAmount(10_700, candidate)).toBe(true)
    expect(whtWithheldForReceipt(10_700, candidate, { toleranceSatang: 0, priorReceivedSatang: 0, priorWhtSatang: 0 })).toBe(0)
    expect(matchCandidateOptionText(10_700, { ...candidate, label: 'BL-2569-001' })).toBe(
      'BL-2569-001 · ฿107.00 (ยอดตรงกับยอดค้างที่เหลือ · ยอดเต็ม ฿12,947.00)',
    )
  })

  it('ไม่มียอดค้างที่เหลือ ⇒ พฤติกรรมเดิม', () => {
    expect(isExactMatchAmount(10_700, billing({ remainingAmountSatang: null }))).toBe(false)
  })
})

describe('มติ O77 — คู่ที่ระบบเสนอ: ยอดค้างจากใบเพิ่มหนี้นับช่วงวันจากวันออกใบเพิ่มหนี้ล่าสุด', () => {
  const sentAt = new Date('2026-09-25T03:00:00Z')
  const debitDate = new Date('2026-10-03T00:00:00Z')
  const paidAfterDebit = new Date('2026-10-06T00:00:00Z')
  const candidate = billing({
    amountSatang: 1_294_700,
    referenceDate: sentAt,
    remainingAmountSatang: 10_700,
    remainingReferenceDate: debitNoteReferenceDate(sentAt, debitDate),
  })

  it('เงินเข้าเท่ายอดค้าง หลังวันวางบิลเกิน tolerance แต่อยู่ในช่วงของใบเพิ่มหนี้ ⇒ เสนอ (วันอ้างอิง = วันออกใบเพิ่มหนี้)', () => {
    const proposals = findMatchProposals(
      [candidate],
      [{ id: 'tx-dn', amountSatang: 10_700, transactionDate: paidAfterDebit, toleranceDays: 7 }],
    )
    expect(proposals).toHaveLength(1)
    expect(proposals[0]?.referenceDate).toEqual(debitDate)
    expect(proposals[0]?.matchedAmountSatang).toBe(10_700)
  })

  it('เงินเข้าก่อนวันออกใบเพิ่มหนี้ หรือเกิน tolerance จากใบเพิ่มหนี้ ⇒ ไม่เสนอ', () => {
    const before = new Date('2026-10-01T00:00:00Z')
    const tooLate = new Date('2026-10-20T00:00:00Z')
    expect(
      findMatchProposals([candidate], [{ id: 'a', amountSatang: 10_700, transactionDate: before, toleranceDays: 7 }]),
    ).toHaveLength(0)
    expect(
      findMatchProposals([candidate], [{ id: 'b', amountSatang: 10_700, transactionDate: tooLate, toleranceDays: 7 }]),
    ).toHaveLength(0)
  })

  it('ยอดเต็มยังนับจากวันวางบิลเดิม (ไม่ขยับตามใบเพิ่มหนี้)', () => {
    expect(
      findMatchProposals([candidate], [{ id: 'c', amountSatang: 1_294_700, transactionDate: paidAfterDebit, toleranceDays: 7 }]),
    ).toHaveLength(0)
    const onTime = findMatchProposals(
      [candidate],
      [{ id: 'd', amountSatang: 1_294_700, transactionDate: new Date('2026-09-28T00:00:00Z'), toleranceDays: 7 }],
    )
    expect(onTime[0]?.referenceDate).toEqual(sentAt)
  })

  it('debitNoteReferenceDate — ไม่มีใบเพิ่มหนี้ / ออกไม่หลังวันวางบิล ⇒ null (ใช้วันวางบิล)', () => {
    expect(debitNoteReferenceDate(sentAt, null)).toBeNull()
    expect(debitNoteReferenceDate(sentAt, new Date('2026-09-20T00:00:00Z'))).toBeNull()
    expect(debitNoteReferenceDate(null, debitDate)).toEqual(debitDate)
    expect(debitNoteReferenceDate(sentAt, debitDate)).toEqual(debitDate)
  })
})
