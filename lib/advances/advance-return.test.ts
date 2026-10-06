import { describe, expect, it } from 'vitest'
import {
  advanceOffsetLineLabel,
  advanceReturnState,
  assertCanChangeReturnMethod,
  assertSeparateReturnAllowed,
  resolveSettleReturnMethod,
} from '@/lib/advances/advance'
import { canChangeAdvanceReturnMethod, canRecordAdvanceSeparateReturn } from '@/lib/advances/advance-ui'
import { advanceSeparateReturnSchema, advanceSettleSchema } from '@/lib/advances/schemas'

/** มติ PO 05/10/2569 (UAT U30 · BUG-109) — กติกา pure ของการปิดยอดคืนเงินทดรอง */

function codeOf(run: () => unknown): string | null {
  try {
    run()
    return null
  } catch (error) {
    return (error as { code?: string }).code ?? String(error)
  }
}

describe('ป้ายบรรทัดหัก', () => {
  it('ใช้เลขที่ใบเบิกเงินทดรองที่ระบบออก (มติ PO U102)', () => {
    expect(advanceOffsetLineLabel('ADV-2569-0007')).toBe('หักคืนเงินทดรอง ADV-2569-0007')
  })
})

describe('วิธีคืนตอนเคลียร์ยอด', () => {
  it('มียอดคืน ไม่ระบุ ⇒ หักกลบในรอบจ่ายถัดไป (ค่าเริ่มต้น)', () => {
    expect(resolveSettleReturnMethod(55_000, undefined)).toBe('payout_offset')
    expect(advanceSettleSchema.parse({ usedSatang: 245_000 }).returnMethod).toBe('payout_offset')
  })
  it('เลือกรับคืนแยกได้', () => {
    expect(resolveSettleReturnMethod(55_000, 'separate')).toBe('separate')
  })
  it('ไม่มียอดคืน ⇒ null ไม่ว่าจะเลือกอะไร', () => {
    expect(resolveSettleReturnMethod(0, 'separate')).toBeNull()
  })
})

describe('เปลี่ยนวิธีคืน', () => {
  it('ยังค้าง + เปลี่ยนเป็นอีกวิธี ⇒ ผ่าน', () => {
    expect(
      codeOf(() =>
        assertCanChangeReturnMethod({ status: 'cleared', current: 'payout_offset', target: 'separate', outstandingSatang: 1 }),
      ),
    ).toBeNull()
  })
  it('ไม่มียอดค้าง (ถูกหักในรอบจ่ายครบแล้ว) / ไม่ใช่ cleared / วิธีเดิม ⇒ ADVANCE_INVALID_STATUS', () => {
    expect(
      codeOf(() =>
        assertCanChangeReturnMethod({ status: 'cleared', current: 'payout_offset', target: 'separate', outstandingSatang: 0 }),
      ),
    ).toBe('ADVANCE_INVALID_STATUS')
    expect(
      codeOf(() => assertCanChangeReturnMethod({ status: 'approved', current: null, target: 'separate', outstandingSatang: 5 })),
    ).toBe('ADVANCE_INVALID_STATUS')
    expect(
      codeOf(() =>
        assertCanChangeReturnMethod({ status: 'cleared', current: 'separate', target: 'separate', outstandingSatang: 5 }),
      ),
    ).toBe('ADVANCE_INVALID_STATUS')
  })
})

describe('รับคืนแยก', () => {
  const base = { status: 'cleared' as const, method: 'separate' as const, outstandingSatang: 55_000 }
  it('ยอดไม่เกินค้าง ⇒ ผ่าน', () => {
    expect(codeOf(() => assertSeparateReturnAllowed({ ...base, amountSatang: 55_000 }))).toBeNull()
    expect(codeOf(() => assertSeparateReturnAllowed({ ...base, amountSatang: 10_000 }))).toBeNull()
  })
  it('เกินยอดค้าง ⇒ ADVANCE_RETURN_EXCEEDS_OUTSTANDING', () => {
    expect(codeOf(() => assertSeparateReturnAllowed({ ...base, amountSatang: 55_001 }))).toBe(
      'ADVANCE_RETURN_EXCEEDS_OUTSTANDING',
    )
  })
  it('วิธีคืนยังเป็นหักกลบ / ปิดยอดแล้ว ⇒ ADVANCE_INVALID_STATUS (ไม่รับซ้ำ)', () => {
    expect(codeOf(() => assertSeparateReturnAllowed({ ...base, method: 'payout_offset', amountSatang: 1 }))).toBe(
      'ADVANCE_INVALID_STATUS',
    )
    expect(codeOf(() => assertSeparateReturnAllowed({ ...base, outstandingSatang: 0, amountSatang: 1 }))).toBe(
      'ADVANCE_INVALID_STATUS',
    )
  })
  it('schema: ต้องมีหลักฐาน + ยอด > 0 + วันที่ ISO', () => {
    const ok = {
      channel: 'cash',
      amountSatang: 55_000,
      receivedDate: '2026-10-05',
      evidenceFilePath: 'advances/x/returns/y.pdf',
    }
    expect(advanceSeparateReturnSchema.safeParse(ok).success).toBe(true)
    expect(advanceSeparateReturnSchema.safeParse({ ...ok, evidenceFilePath: '' }).success).toBe(false)
    expect(advanceSeparateReturnSchema.safeParse({ ...ok, amountSatang: 0 }).success).toBe(false)
    expect(advanceSeparateReturnSchema.safeParse({ ...ok, channel: 'payout_offset' }).success).toBe(false)
  })
})

describe('สถานะการคืนยอด (อนุมาน — ไม่ใช่ state ใหม่)', () => {
  it('none / pending_offset / pending_separate / closed', () => {
    expect(advanceReturnState({ returnSatang: 0, outstandingSatang: 0, method: null })).toBe('none')
    expect(advanceReturnState({ returnSatang: 55_000, outstandingSatang: 25_000, method: 'payout_offset' })).toBe(
      'pending_offset',
    )
    expect(advanceReturnState({ returnSatang: 55_000, outstandingSatang: 55_000, method: 'separate' })).toBe(
      'pending_separate',
    )
    expect(advanceReturnState({ returnSatang: 55_000, outstandingSatang: 0, method: 'separate' })).toBe('closed')
  })
  it('ปุ่มบนหน้าจอตามสถานะ', () => {
    expect(canChangeAdvanceReturnMethod({ returnState: 'pending_offset' })).toBe(true)
    expect(canChangeAdvanceReturnMethod({ returnState: 'closed' })).toBe(false)
    expect(canRecordAdvanceSeparateReturn({ returnState: 'pending_separate' })).toBe(true)
    expect(canRecordAdvanceSeparateReturn({ returnState: 'pending_offset' })).toBe(false)
  })
})
