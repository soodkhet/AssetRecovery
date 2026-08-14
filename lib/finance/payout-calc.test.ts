import { describe, expect, it } from 'vitest'
import { summarizePayoutBatch, type PayoutItemAmounts } from '@/lib/finance/payout-calc'

/** `22` §6.10 · `17` §6.2 — ยอดรวมของรอบจ่าย */

function item(grossSatang: number, whtSatang: number): PayoutItemAmounts {
  return { grossSatang, whtSatang, netSatang: grossSatang - whtSatang }
}

describe('summarizePayoutBatch', () => {
  it('รวม gross/wht แล้ว net = gross - wht (= SUM ของ net รายรายการ)', () => {
    const items = [item(1_000_000, 30_000), item(500_000, 15_000), item(250_000, 0)]
    const totals = summarizePayoutBatch(items)

    expect(totals.grossSatang).toBe(1_750_000)
    expect(totals.whtSatang).toBe(45_000)
    expect(totals.netSatang).toBe(1_705_000)
    expect(totals.netSatang).toBe(items.reduce((sum, row) => sum + row.netSatang, 0))
    expect(totals.itemCount).toBe(3)
  })

  it('batch ว่าง = ทุกยอด 0 ไม่ใช่ error (รอบที่เพิ่งสร้างยังไม่ดึงรายการ — สถานะ draft)', () => {
    expect(summarizePayoutBatch([])).toEqual({ grossSatang: 0, whtSatang: 0, netSatang: 0, itemCount: 0 })
  })

  it('รายการที่ไม่หัก WHT (ต่ำกว่าเกณฑ์) รวมเข้าได้ปกติ', () => {
    const totals = summarizePayoutBatch([item(99_999, 0), item(1_000_000, 30_000)])
    expect(totals.whtSatang).toBe(30_000)
    expect(totals.netSatang).toBe(1_069_999)
  })

  it('รายการที่ net ไม่ตรงกับ gross − wht ต้องล้มก่อนเงินออกจริง', () => {
    expect(() => summarizePayoutBatch([{ grossSatang: 1_000_000, whtSatang: 30_000, netSatang: 999_999 }])).toThrow(
      RangeError,
    )
  })

  it('ยอดติดลบ/ไม่ใช่จำนวนเต็ม = ล้ม', () => {
    expect(() => summarizePayoutBatch([{ grossSatang: -1, whtSatang: 0, netSatang: -1 }])).toThrow(RangeError)
    expect(() => summarizePayoutBatch([{ grossSatang: 100.5, whtSatang: 0, netSatang: 100.5 }])).toThrow(RangeError)
  })
})
