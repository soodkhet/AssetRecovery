import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WHT_POLICY,
  WHT_FILING_METHOD_SUFFIX,
  LEGACY_WHT_POLICY,
  effectiveWhtPolicy,
  isEffectiveFromAllowed,
  isInWhtBase,
  normalizeBaseExpenseTypes,
  payoutBatchWhtPolicy,
  resolveWhtPolicyAt,
  toWhtPolicyAuditPayload,
  WHT_INCOME_CATEGORY_LABEL,
  WHT_TEAM_SIDE_INCOME_CATEGORIES,
  type WhtPolicyEntry,
} from '@/lib/settings/wht-policy'
import { whtPolicyCreateSchema } from '@/lib/settings/schemas'

/** ค่าตั้งภาษีหัก ณ ที่จ่าย — มติ PO 05/10/2569 (UAT U3/U4/U5/U8) */

const day = (iso: string) => new Date(`${iso}T00:00:00Z`)

function entry(id: string, effectiveFrom: string, createdAt: string, overrides: Partial<WhtPolicyEntry> = {}): WhtPolicyEntry {
  return {
    id,
    effectiveFrom: day(effectiveFrom),
    createdAt: new Date(createdAt),
    ...DEFAULT_WHT_POLICY,
    ...overrides,
  }
}

describe('ค่าเริ่มต้นตามมติ', () => {
  it('ฐาน = คอมมิชชัน/เบี้ยเสี่ยง/น้ำมัน/เบี้ยเลี้ยง · ไม่รวมค่าที่พัก/ใบเสร็จ/กรอกเอง', () => {
    expect(isInWhtBase(DEFAULT_WHT_POLICY, 'commission')).toBe(true)
    expect(isInWhtBase(DEFAULT_WHT_POLICY, 'no_success_fee')).toBe(true)
    expect(isInWhtBase(DEFAULT_WHT_POLICY, 'fuel')).toBe(true)
    expect(isInWhtBase(DEFAULT_WHT_POLICY, 'allowance')).toBe(true)
    expect(isInWhtBase(DEFAULT_WHT_POLICY, 'hotel')).toBe(false)
    expect(isInWhtBase(DEFAULT_WHT_POLICY, 'receipt')).toBe(false)
    expect(isInWhtBase(DEFAULT_WHT_POLICY, 'manual')).toBe(false)
    expect(isInWhtBase(DEFAULT_WHT_POLICY, null)).toBe(false)
  })

  it('50 ทวิ ต่อผู้รับต่อรอบ · 40(8)', () => {
    expect(DEFAULT_WHT_POLICY.certificateMode).toBe('per_payee_batch')
    expect(DEFAULT_WHT_POLICY.incomeTypeMode).toBe('all_40_8')
  })

  it('ไม่มีแถวในประวัติ → ใช้ค่าเริ่มต้น', () => {
    expect(effectiveWhtPolicy([], new Date())).toEqual(DEFAULT_WHT_POLICY)
  })
})

describe('(ช) effective-dated', () => {
  const history = [
    entry('a', '2026-10-01', '2026-09-20T03:00:00Z', { certificateMode: 'per_item' }),
    entry('b', '2026-11-01', '2026-10-05T03:00:00Z', { incomeTypeMode: 'by_team_side' }),
  ]

  it('ก่อนวันที่มีผลของแถวแรก → ไม่มีแถว (ค่าเริ่มต้น)', () => {
    expect(resolveWhtPolicyAt(history, new Date('2026-09-30T10:00:00Z'))).toBeNull()
  })

  it('เลือกแถวที่ effective_from ใหม่สุดที่ ≤ วันนั้น', () => {
    expect(resolveWhtPolicyAt(history, new Date('2026-10-15T10:00:00Z'))?.id).toBe('a')
    expect(resolveWhtPolicyAt(history, new Date('2026-11-01T01:00:00Z'))?.id).toBe('b')
  })

  it('เทียบวันตามปฏิทินไทย — 31/10 เวลา 18:00Z คือ 01/11 ตามเวลาไทย', () => {
    expect(resolveWhtPolicyAt(history, new Date('2026-10-31T18:00:00Z'))?.id).toBe('b')
    expect(resolveWhtPolicyAt(history, new Date('2026-10-31T16:59:00Z'))?.id).toBe('a')
  })

  it('วันเดียวกันหลายแถว (แก้ซ้ำในวัน) → แถวที่บันทึกล่าสุดชนะ', () => {
    const sameDay = [
      ...history,
      entry('a2', '2026-10-01', '2026-09-21T03:00:00Z', { certificateMode: 'per_payee_batch' }),
    ]
    expect(resolveWhtPolicyAt(sameDay, new Date('2026-10-02T00:00:00Z'))?.id).toBe('a2')
  })

  it('วันที่มีผลย้อนหลังไม่ได้ · วันนี้ (ไทย) ได้', () => {
    const now = new Date('2026-10-05T18:30:00Z') // = 06/10 01:30 เวลาไทย
    expect(isEffectiveFromAllowed(day('2026-10-06'), now)).toBe(true)
    expect(isEffectiveFromAllowed(day('2026-10-05'), now)).toBe(false)
    expect(isEffectiveFromAllowed(day('2026-12-01'), now)).toBe(true)
  })
})

describe('(ฉ) snapshot ของรอบจ่าย', () => {
  it('รอบที่ snapshot ไว้ใช้ค่าของตัวเองเสมอ — ไม่ดูค่าตั้งปัจจุบัน', () => {
    const snapshot = {
      whtBaseExpenseTypes: ['commission', 'fuel', 'allowance', 'no_success_fee', 'hotel'] as const,
      whtCertificateMode: 'per_item' as const,
      whtIncomeTypeMode: 'all_40_8' as const,
      whtIssueZeroRate402Certificate: false,
      whtInhouseIncomeCategory: 'sec_40_1' as const,
      whtOutsourceIncomeCategory: 'sec_40_2' as const,
    }
    const before = payoutBatchWhtPolicy({ ...snapshot, whtBaseExpenseTypes: [...snapshot.whtBaseExpenseTypes] })
    // ค่าตั้งเปลี่ยนเป็นค่าเริ่มต้นใหม่ (ไม่รวมค่าที่พัก · ต่อรอบ) — รอบเดิมยังอ่านค่าเดิม
    const after = payoutBatchWhtPolicy({ ...snapshot, whtBaseExpenseTypes: [...snapshot.whtBaseExpenseTypes] })
    expect(after).toEqual(before)
    expect(isInWhtBase(after, 'hotel')).toBe(true)
    expect(after.certificateMode).toBe('per_item')
    expect(after.inhouseIncomeCategory).toBe('sec_40_1')
    expect(after.outsourceIncomeCategory).toBe('sec_40_2')
  })

  it('รอบที่สร้างก่อนมีค่าตั้ง (snapshot NULL) → พฤติกรรมเดิม: ทุกชนิดในฐาน · ใบต่อรายการ · 40(8)', () => {
    const legacy = payoutBatchWhtPolicy({
      whtBaseExpenseTypes: null,
      whtCertificateMode: null,
      whtIncomeTypeMode: null,
      whtIssueZeroRate402Certificate: null,
      whtInhouseIncomeCategory: null,
      whtOutsourceIncomeCategory: null,
    })
    expect(legacy).toEqual(LEGACY_WHT_POLICY)
    expect(isInWhtBase(legacy, 'hotel')).toBe(true)
    expect(legacy.certificateMode).toBe('per_item')
  })
})

describe('normalize/audit', () => {
  it('เรียงตามลำดับมาตรฐาน + ตัดซ้ำ', () => {
    expect(normalizeBaseExpenseTypes(['fuel', 'commission', 'fuel'])).toEqual(['commission', 'fuel'])
  })

  it('payload audit เป็น snake_case', () => {
    expect(toWhtPolicyAuditPayload({ ...DEFAULT_WHT_POLICY, effectiveFrom: '2026-10-06' })).toEqual({
      effective_from: '2026-10-06',
      base_expense_types: ['commission', 'no_success_fee', 'fuel', 'allowance'],
      certificate_mode: 'per_payee_batch',
      income_type_mode: 'all_40_8',
      issue_zero_rate_40_2_certificate: true,
      inhouse_income_category: 'sec_40_2',
      outsource_income_category: 'sec_40_8',
      filing_method: 'online',
    })
  })
})

describe('U45 — วิธียื่น ภ.ง.ด. (มติ PO 05/10/2569)', () => {
  it('ค่าเริ่มต้น = ออนไลน์ · ป้ายระบุวันกำหนดตามวิธี', () => {
    expect(DEFAULT_WHT_POLICY.filingMethod).toBe('online')
    expect(effectiveWhtPolicy([], new Date()).filingMethod).toBe('online')
    expect(WHT_FILING_METHOD_SUFFIX).toEqual({ online: '(ยื่นออนไลน์)', paper: '(ยื่นแบบกระดาษ)' })
  })

  it('effective-dated: ชุดที่ตั้งเป็นกระดาษมีผลตั้งแต่วันที่มีผล', () => {
    const entries = [
      entry('a', '2026-01-01', '2026-01-01T00:00:00Z'),
      entry('b', '2026-11-01', '2026-10-05T00:00:00Z', { filingMethod: 'paper' }),
    ]
    expect(effectiveWhtPolicy(entries, new Date('2026-10-31T10:00:00Z')).filingMethod).toBe('online')
    expect(effectiveWhtPolicy(entries, new Date('2026-11-01T00:00:00Z')).filingMethod).toBe('paper')
  })
})

describe('U16 — 40(2) อัตรา 0% ออก 50 ทวิ (มติ PO 05/10/2569)', () => {
  it('ค่าเริ่มต้น = ออก · พฤติกรรมเดิม (รอบเก่า) = ไม่ออก', () => {
    expect(DEFAULT_WHT_POLICY.issueZeroRate402Certificate).toBe(true)
    expect(LEGACY_WHT_POLICY.issueZeroRate402Certificate).toBe(false)
  })

  it('snapshot ของรอบ: true/false ใช้ตามรอบ · NULL (รอบก่อนมีค่าตั้ง) = ไม่ออก', () => {
    const base = {
      whtBaseExpenseTypes: null,
      whtCertificateMode: 'per_payee_batch' as const,
      whtIncomeTypeMode: 'all_40_2' as const,
      whtInhouseIncomeCategory: null,
      whtOutsourceIncomeCategory: null,
    }
    expect(payoutBatchWhtPolicy({ ...base, whtIssueZeroRate402Certificate: true }).issueZeroRate402Certificate).toBe(true)
    expect(payoutBatchWhtPolicy({ ...base, whtIssueZeroRate402Certificate: false }).issueZeroRate402Certificate).toBe(false)
    expect(payoutBatchWhtPolicy({ ...base, whtIssueZeroRate402Certificate: null }).issueZeroRate402Certificate).toBe(false)
  })

  it('effective-dated — แถวที่มีผลกำหนดค่า', () => {
    const entries = [
      entry('a', '2026-10-01', '2026-10-01T03:00:00Z'),
      entry('b', '2026-11-01', '2026-10-05T03:00:00Z', { issueZeroRate402Certificate: false }),
    ]
    expect(effectiveWhtPolicy(entries, new Date('2026-10-20T03:00:00Z')).issueZeroRate402Certificate).toBe(true)
    expect(effectiveWhtPolicy(entries, new Date('2026-11-02T03:00:00Z')).issueZeroRate402Certificate).toBe(false)
  })
})

describe('U33 — การจับคู่ประเภทเงินได้ต่อประเภททีม (มติ PO 05/10/2569)', () => {
  it('ค่าเริ่มต้นไม่เปลี่ยน: โหมด 40(8) ทั้งหมด · การจับคู่ inhouse 40(2) · outsource 40(8) (= พฤติกรรมเดิม)', () => {
    expect(DEFAULT_WHT_POLICY.incomeTypeMode).toBe('all_40_8')
    expect(DEFAULT_WHT_POLICY.inhouseIncomeCategory).toBe('sec_40_2')
    expect(DEFAULT_WHT_POLICY.outsourceIncomeCategory).toBe('sec_40_8')
    expect(LEGACY_WHT_POLICY.inhouseIncomeCategory).toBe('sec_40_2')
    expect(LEGACY_WHT_POLICY.outsourceIncomeCategory).toBe('sec_40_8')
  })

  it('ตัวเลือกต่อประเภททีม = 40(1)/40(2)/40(8) · ป้ายครบทุกค่า', () => {
    expect([...WHT_TEAM_SIDE_INCOME_CATEGORIES]).toEqual(['sec_40_1', 'sec_40_2', 'sec_40_8'])
    for (const category of WHT_TEAM_SIDE_INCOME_CATEGORIES) {
      expect(WHT_INCOME_CATEGORY_LABEL[category]).toMatch(/^มาตรา 40\((1|2|8)\)$/)
    }
  })

  it('schema: ไม่ส่งการจับคู่ = ค่าเริ่มต้น · ค่านอกตัวเลือกถูกปัด', () => {
    const base = {
      effectiveFrom: '2026-10-06',
      baseExpenseTypes: ['commission'],
      certificateMode: 'per_payee_batch',
      incomeTypeMode: 'by_team_side',
      reason: 'สำนักงานบัญชีแนะนำ',
    }
    const parsed = whtPolicyCreateSchema.parse(base)
    expect(parsed.inhouseIncomeCategory).toBe('sec_40_2')
    expect(parsed.outsourceIncomeCategory).toBe('sec_40_8')
    const custom = whtPolicyCreateSchema.parse({
      ...base,
      inhouseIncomeCategory: 'sec_40_1',
      outsourceIncomeCategory: 'sec_40_1',
    })
    expect(custom.inhouseIncomeCategory).toBe('sec_40_1')
    expect(custom.outsourceIncomeCategory).toBe('sec_40_1')
    expect(whtPolicyCreateSchema.safeParse({ ...base, inhouseIncomeCategory: 'sec_40_3' }).success).toBe(false)
  })

  it('snapshot ของรอบ: การจับคู่ NULL (รอบก่อน U33) = การจับคู่เดิม · มีค่า = ใช้ค่าของรอบ', () => {
    const base = {
      whtBaseExpenseTypes: null,
      whtCertificateMode: 'per_payee_batch' as const,
      whtIncomeTypeMode: 'by_team_side' as const,
      whtIssueZeroRate402Certificate: true,
    }
    const old = payoutBatchWhtPolicy({ ...base, whtInhouseIncomeCategory: null, whtOutsourceIncomeCategory: null })
    expect([old.inhouseIncomeCategory, old.outsourceIncomeCategory]).toEqual(['sec_40_2', 'sec_40_8'])
    const fresh = payoutBatchWhtPolicy({
      ...base,
      whtInhouseIncomeCategory: 'sec_40_1',
      whtOutsourceIncomeCategory: 'sec_40_2',
    })
    expect([fresh.inhouseIncomeCategory, fresh.outsourceIncomeCategory]).toEqual(['sec_40_1', 'sec_40_2'])
  })
})
