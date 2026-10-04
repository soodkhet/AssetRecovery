import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WHT_POLICY,
  LEGACY_WHT_POLICY,
  effectiveWhtPolicy,
  isEffectiveFromAllowed,
  isInWhtBase,
  normalizeBaseExpenseTypes,
  payoutBatchWhtPolicy,
  resolveWhtPolicyAt,
  toWhtPolicyAuditPayload,
  type WhtPolicyEntry,
} from '@/lib/settings/wht-policy'

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
    }
    const before = payoutBatchWhtPolicy({ ...snapshot, whtBaseExpenseTypes: [...snapshot.whtBaseExpenseTypes] })
    // ค่าตั้งเปลี่ยนเป็นค่าเริ่มต้นใหม่ (ไม่รวมค่าที่พัก · ต่อรอบ) — รอบเดิมยังอ่านค่าเดิม
    const after = payoutBatchWhtPolicy({ ...snapshot, whtBaseExpenseTypes: [...snapshot.whtBaseExpenseTypes] })
    expect(after).toEqual(before)
    expect(isInWhtBase(after, 'hotel')).toBe(true)
    expect(after.certificateMode).toBe('per_item')
  })

  it('รอบที่สร้างก่อนมีค่าตั้ง (snapshot NULL) → พฤติกรรมเดิม: ทุกชนิดในฐาน · ใบต่อรายการ · 40(8)', () => {
    const legacy = payoutBatchWhtPolicy({ whtBaseExpenseTypes: null, whtCertificateMode: null, whtIncomeTypeMode: null })
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
    })
  })
})
