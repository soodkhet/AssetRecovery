import { describe, expect, it } from 'vitest'
import { isPreInvoiceDecrease, preInvoiceAmounts, preInvoiceSharesByRevenue } from '@/lib/adjustments/pre-invoice'

const at = (iso: string) => new Date(iso)
const base = {
  status: 'approved' as const,
  adjustmentType: 'decrease' as const,
  approvedAt: at('2026-10-01T03:00:00Z'),
  hasActiveNote: false,
  waived: false,
}

describe('isPreInvoiceDecrease (มติชั่วคราว M3 G-02)', () => {
  it('ลดยอดอนุมัติแล้ว + ยังไม่มีใบกำกับ ⇒ ลดยอดเรียกเก็บได้ทันที', () => {
    expect(isPreInvoiceDecrease(base, null)).toBe(true)
  })
  it('อนุมัติก่อนใบกำกับใบแรก ⇒ ใช่ · หลัง/พร้อมกัน ⇒ ไม่ใช่ (ต้องใบลดหนี้)', () => {
    expect(isPreInvoiceDecrease(base, at('2026-10-02T00:00:00Z'))).toBe(true)
    expect(isPreInvoiceDecrease(base, at('2026-10-01T03:00:00Z'))).toBe(false)
    expect(isPreInvoiceDecrease(base, at('2026-09-30T00:00:00Z'))).toBe(false)
  })
  it('เพิ่มยอด / ยังไม่อนุมัติ / มีใบลดหนี้ / ปิดป้ายนอกระบบ / ไม่มีเวลาอนุมัติ ⇒ ไม่ใช่', () => {
    expect(isPreInvoiceDecrease({ ...base, adjustmentType: 'increase' }, null)).toBe(false)
    expect(isPreInvoiceDecrease({ ...base, status: 'pending_approval' }, null)).toBe(false)
    expect(isPreInvoiceDecrease({ ...base, hasActiveNote: true }, null)).toBe(false)
    expect(isPreInvoiceDecrease({ ...base, waived: true }, null)).toBe(false)
    expect(isPreInvoiceDecrease({ ...base, approvedAt: null }, null)).toBe(false)
  })
  it('asOf — อนุมัติหลังวันที่อ้างอิงไม่นับ', () => {
    expect(isPreInvoiceDecrease(base, null, at('2026-09-30T00:00:00Z'))).toBe(false)
    expect(isPreInvoiceDecrease(base, null, at('2026-10-05T00:00:00Z'))).toBe(true)
  })
})

describe('preInvoiceAmounts', () => {
  const revenues = [
    { id: 'a', billingBatchId: 'B', grossSatang: 30_000, vatRatePct: 7 },
    { id: 'b', billingBatchId: 'B', grossSatang: 10_000, vatRatePct: 7 },
    { id: 'z', billingBatchId: 'B', grossSatang: 10_000, vatRatePct: 0 },
  ]

  it('ระดับรายได้: VAT ตามอัตรา snapshot ของใบนั้น (ปัดครึ่งขึ้น)', () => {
    expect(preInvoiceAmounts('B', [{ amountSatang: 10_000, revenueId: 'a' }], revenues)).toEqual({
      beforeVatSatang: 10_000,
      vatSatang: 700,
      totalSatang: 10_700,
    })
    expect(preInvoiceAmounts('B', [{ amountSatang: 1_005, revenueId: 'z' }], revenues).vatSatang).toBe(0)
  })

  it('ระดับรอบ: กระจายตามสัดส่วน gross แล้วคิด VAT รายใบ · ผลรวมก่อน VAT = ยอดรายการ', () => {
    const shares = preInvoiceSharesByRevenue('B', [{ amountSatang: 5_000, revenueId: null }], revenues)
    expect(shares.reduce((sum, row) => sum + row.amountSatang, 0)).toBe(5_000)
    expect(shares).toEqual([
      { revenueId: 'a', amountSatang: 3_000 },
      { revenueId: 'b', amountSatang: 1_000 },
      { revenueId: 'z', amountSatang: 1_000 },
    ])
    expect(preInvoiceAmounts('B', [{ amountSatang: 5_000, revenueId: null }], revenues)).toEqual({
      beforeVatSatang: 5_000,
      vatSatang: 210 + 70,
      totalSatang: 5_280,
    })
  })

  it('ไม่มีรายการ ⇒ 0', () => {
    expect(preInvoiceAmounts('B', [], revenues)).toEqual({ beforeVatSatang: 0, vatSatang: 0, totalSatang: 0 })
  })
})
