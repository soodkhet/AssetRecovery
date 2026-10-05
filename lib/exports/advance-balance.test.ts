import { describe, expect, it } from 'vitest'
import {
  advanceBalanceLine,
  advanceBalanceRows,
  type AdvanceBalanceEntry,
  type AdvanceBalanceReturn,
} from '@/lib/exports/advance-balance'

/**
 * `16_Advance_Balance.csv` (มติ PO U94 ข้อ 3) — ยอดยกมา + เคลื่อนไหว = คงเหลือ ทุกกรณี
 * งวดทดสอบ = กรกฎาคม 2569 (`[2026-07-01, 2026-08-01)`) · วันที่ timestamp ใช้เวลาไทย
 */

const JULY = { start: new Date('2026-07-01T00:00:00Z'), end: new Date('2026-08-01T00:00:00Z') }

/** 10:00 น. เวลาไทยของวันที่ (UTC+7) */
const at = (date: string): Date => new Date(`${date}T03:00:00Z`)
const day = (date: string): Date => new Date(`${date}T00:00:00Z`)

const paidBatch = (date: string) => ({ status: 'completed' as const, paymentFileGeneratedAt: at(date), updatedAt: at(date) })

function entry(overrides: Partial<AdvanceBalanceEntry> = {}): AdvanceBalanceEntry {
  return {
    advanceId: '3f2a9c1b-0000-4000-8000-000000000001',
    payeeId: 'p-1',
    payeeName: 'ประยุทธ์ บุญมี',
    payeeTaxId: '3100000004600',
    status: 'approved',
    approvedSatang: 300_000,
    returnSatang: 300_000,
    clearedAt: null,
    payoutBatches: [paidBatch('2026-06-20')],
    returns: [],
    ...overrides,
  }
}

function identity(line: ReturnType<typeof advanceBalanceLine>): number {
  return (
    line.openingSatang +
    line.paidSatang -
    line.clearedSatang -
    line.returnedOffsetSatang -
    line.returnedDirectSatang
  )
}

const offset = (amount: number, batchDate: string | null, reversedAt: Date | null = null): AdvanceBalanceReturn => ({
  channel: 'payout_offset',
  amountSatang: amount,
  receivedDate: null,
  payoutBatch: batchDate === null ? { status: 'draft', paymentFileGeneratedAt: null, updatedAt: at('2026-07-29') } : paidBatch(batchDate),
  reversedAt,
})

const cash = (amount: number, received: string, reversedAt: Date | null = null): AdvanceBalanceReturn => ({
  channel: 'cash',
  amountSatang: amount,
  receivedDate: day(received),
  payoutBatch: null,
  reversedAt,
})

describe('advanceBalanceLine — ยกมา/เคลื่อนไหว/คงเหลือ', () => {
  it('จ่ายก่อนงวด ยังไม่เคลียร์ ⇒ ยกมาเต็มยอด ไม่มีเคลื่อนไหว', () => {
    const line = advanceBalanceLine(entry(), JULY)
    expect(line).toMatchObject({ openingSatang: 300_000, paidSatang: 0, clearedSatang: 0, closingSatang: 300_000 })
    expect(identity(line)).toBe(line.closingSatang)
  })

  it('จ่ายในงวด เคลียร์ในงวด (ใช้ 2,450 คืน 550) รับคืนหักกลบในรอบจ่ายที่โอนในงวด ⇒ คงเหลือ 0', () => {
    const line = advanceBalanceLine(
      entry({
        status: 'cleared',
        payoutBatches: [paidBatch('2026-07-05')],
        clearedAt: at('2026-07-15'),
        returnSatang: 55_000,
        returns: [offset(55_000, '2026-07-25')],
      }),
      JULY,
    )
    expect(line).toEqual({
      advanceId: '3f2a9c1b-0000-4000-8000-000000000001',
      openingSatang: 0,
      paidSatang: 300_000,
      clearedSatang: 245_000,
      returnedOffsetSatang: 55_000,
      returnedDirectSatang: 0,
      closingSatang: 0,
    })
    expect(identity(line)).toBe(line.closingSatang)
  })

  it('เคลียร์ก่อนงวด ยอดคืนค้างยกมา · รับเงินสดในงวดบางส่วน · หักกลบในรอบที่ยังไม่โอน ⇒ ยังไม่นับ', () => {
    const line = advanceBalanceLine(
      entry({
        status: 'cleared',
        clearedAt: at('2026-06-25'),
        returnSatang: 55_000,
        returns: [cash(20_000, '2026-07-10'), offset(35_000, null)],
      }),
      JULY,
    )
    expect(line).toMatchObject({ openingSatang: 55_000, returnedDirectSatang: 20_000, returnedOffsetSatang: 0, closingSatang: 35_000 })
    expect(identity(line)).toBe(line.closingSatang)
  })

  it('กลับรายการในงวดของรับคืนงวดก่อน ⇒ ยอดคืนในงวดติดลบ · คงเหลือกลับมาค้าง', () => {
    const line = advanceBalanceLine(
      entry({
        status: 'cleared',
        clearedAt: at('2026-06-10'),
        returnSatang: 55_000,
        returns: [cash(55_000, '2026-06-20', at('2026-07-03'))],
      }),
      JULY,
    )
    expect(line).toMatchObject({ openingSatang: 0, returnedDirectSatang: -55_000, closingSatang: 55_000 })
    expect(identity(line)).toBe(line.closingSatang)
  })

  it('เหตุการณ์หลังสิ้นงวดไม่นับ (จ่าย/เคลียร์/รับคืน เดือนสิงหาคม) · ขอบวันใช้เวลาไทย', () => {
    const line = advanceBalanceLine(
      entry({
        status: 'cleared',
        payoutBatches: [paidBatch('2026-07-31')],
        // 01/08/2569 00:30 น. ไทย = 31/07 17:30 UTC — ยังเป็นงวดถัดไป
        clearedAt: new Date('2026-07-31T17:30:00Z'),
        returnSatang: 50_000,
        returns: [cash(50_000, '2026-08-02')],
      }),
      JULY,
    )
    expect(line).toMatchObject({ openingSatang: 0, paidSatang: 300_000, clearedSatang: 0, closingSatang: 300_000 })
    expect(identity(line)).toBe(line.closingSatang)
  })

  it('ยังไม่เคยโอน (อนุมัติแล้วแต่รอบจ่ายยังไม่ completed) ⇒ ยังไม่ใช่ลูกหนี้', () => {
    const line = advanceBalanceLine(
      entry({ payoutBatches: [{ status: 'file_generated', paymentFileGeneratedAt: at('2026-07-10'), updatedAt: at('2026-07-10') }] }),
      JULY,
    )
    expect(line).toMatchObject({ openingSatang: 0, paidSatang: 0, closingSatang: 0 })
  })

  it('ได้คืนเกินยอดคืน = ข้อมูลเพี้ยน ⇒ ดัง (สูตรยอดคืนค้างเดิม) ไม่ปัด', () => {
    expect(() =>
      advanceBalanceLine(
        entry({ status: 'cleared', clearedAt: at('2026-07-02'), returnSatang: 10_000, returns: [cash(20_000, '2026-07-05')] }),
        JULY,
      ),
    ).toThrow(RangeError)
  })
})

describe('advanceBalanceRows — รวมต่อคน', () => {
  it('รวมหลายใบของคนเดียว + เลขที่ ADV · ข้ามใบที่ไม่มียอด/สถานะที่ไม่เคยจ่าย · เรียงชื่อ', () => {
    const rows = advanceBalanceRows(
      [
        entry(),
        entry({
          advanceId: '7d41e0aa-0000-4000-8000-000000000002',
          status: 'cleared',
          payoutBatches: [paidBatch('2026-07-05')],
          clearedAt: at('2026-07-15'),
          returnSatang: 0,
        }),
        // เคลียร์และคืนครบก่อนงวด ⇒ ไม่มียอดไม่เคลื่อนไหว
        entry({
          advanceId: 'aaaaaaaa-0000-4000-8000-000000000003',
          status: 'cleared',
          clearedAt: at('2026-06-21'),
          returnSatang: 0,
        }),
        entry({ advanceId: 'bbbbbbbb-0000-4000-8000-000000000004', status: 'rejected' }),
        entry({ advanceId: 'cccccccc-0000-4000-8000-000000000005', payeeId: 'p-2', payeeName: 'กมล ทดสอบ' }),
      ],
      JULY,
    )
    expect(rows.map((row) => row.payeeName)).toEqual(['กมล ทดสอบ', 'ประยุทธ์ บุญมี'])
    expect(rows[1]).toEqual({
      payeeName: 'ประยุทธ์ บุญมี',
      payeeTaxId: '3100000004600',
      openingSatang: 300_000,
      paidSatang: 300_000,
      clearedSatang: 300_000,
      returnedOffsetSatang: 0,
      returnedDirectSatang: 0,
      closingSatang: 300_000,
      advanceRefs: ['ADV-3F2A9C1B', 'ADV-7D41E0AA'],
    })
    for (const row of rows) {
      expect(
        row.openingSatang + row.paidSatang - row.clearedSatang - row.returnedOffsetSatang - row.returnedDirectSatang,
      ).toBe(row.closingSatang)
    }
  })
})
