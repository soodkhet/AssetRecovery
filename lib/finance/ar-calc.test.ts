import { describe, expect, it } from 'vitest'
import {
  agingBucketIndex,
  arOutstandingSatang,
  daysOverdue,
  resolveBankFeeWriteOff,
  remainingAfterCustomerWhtSatang,
  resolveCustomerWhtForReceipt,
  settledSatang,
  summarizeArAging,
  totalArOutstandingSatang,
} from '@/lib/finance/ar-calc'
import { resolveBillingStatusAfterReceipt } from '@/lib/revenue/revenue'
import { DEFAULT_AR_AGING_BUCKETS } from '@/lib/settings/finance-policy'

/** `22` §6.11 · `19` §6.4 — ยอดค้างรับ + ช่วงอายุหนี้ */

const buckets = [...DEFAULT_AR_AGING_BUCKETS] // [30, 60, 90]

const noWht = { whtWithheldByCustomerSatang: 0, bankFeeWrittenOffSatang: 0 }

describe('§6.11 ยอดค้างรับ', () => {
  it('outstanding = total - received', () => {
    expect(arOutstandingSatang({ totalSatang: 1_000_000, receivedSatang: 400_000, ...noWht })).toBe(600_000)
  })

  it('จ่ายครบ = 0 · จ่ายเกิน = ติดลบ (ไม่ clamp เพื่อไม่ให้ยอดหาย)', () => {
    expect(arOutstandingSatang({ totalSatang: 1_000_000, receivedSatang: 1_000_000, ...noWht })).toBe(0)
    expect(arOutstandingSatang({ totalSatang: 1_000_000, receivedSatang: 1_100_000, ...noWht })).toBe(-100_000)
  })

  it('ค่าที่ไม่ใช่สตางค์จำนวนเต็ม = ล้ม', () => {
    expect(() => arOutstandingSatang({ totalSatang: 1_000.5, receivedSatang: 0, ...noWht })).toThrow(RangeError)
  })
})

describe('WHT ที่ลูกค้าหัก (A1) ถือว่าชำระแล้ว', () => {
  // บิล 1,000,000 สตางค์ · ลูกค้าหัก WHT 3% = 30,000 แล้วโอนที่เหลือ 970,000 ⇒ ต้องไม่เหลือหนี้ค้าง
  const withheld = { totalSatang: 1_000_000, receivedSatang: 970_000, whtWithheldByCustomerSatang: 30_000, bankFeeWrittenOffSatang: 0 }

  it('settled = received + wht', () => {
    expect(settledSatang(withheld)).toBe(1_000_000)
  })

  it('บิลที่ลูกค้าหัก WHT แล้วโอนส่วนที่เหลือ = ไม่ค้าง (เดิมค้างค้างเท่าอัตรา WHT ตลอดกาล)', () => {
    expect(arOutstandingSatang(withheld)).toBe(0)
  })

  it('ยอดค้างต้องสอดคล้องกับสถานะ `paid` ที่ resolveBillingStatusAfterReceipt ตัดสิน', () => {
    expect(
      resolveBillingStatusAfterReceipt({
        current: 'sent',
        totalSatang: withheld.totalSatang,
        receivedSatang: withheld.receivedSatang,
        whtWithheldByCustomerSatang: withheld.whtWithheldByCustomerSatang,
        bankFeeWrittenOffSatang: 0,
      }),
    ).toBe('paid')
    expect(arOutstandingSatang(withheld)).toBe(0)
  })

  it('รับบางส่วน + WHT ยังค้างส่วนต่าง', () => {
    expect(
      arOutstandingSatang({ totalSatang: 1_000_000, receivedSatang: 400_000, whtWithheldByCustomerSatang: 30_000, bankFeeWrittenOffSatang: 0 }),
    ).toBe(570_000)
  })

  it('WHT ที่ไม่ใช่สตางค์จำนวนเต็ม = ล้ม', () => {
    expect(() =>
      arOutstandingSatang({ totalSatang: 1_000_000, receivedSatang: 0, whtWithheldByCustomerSatang: 1.5, bankFeeWrittenOffSatang: 0 }),
    ).toThrow(RangeError)
  })
})

describe('§6.4 ของ `19` — จำนวนวันเลยกำหนดและช่วงอายุหนี้', () => {
  it('นับวันเลยกำหนดตามปฏิทินไทย (due_date เป็นคอลัมน์ DATE)', () => {
    const dueDate = new Date('2026-08-01T00:00:00Z')
    expect(daysOverdue(dueDate, new Date('2026-08-16T03:00:00Z'))).toBe(15)
    // 20:00Z ของวันที่ 15 = ตี 3 ของวันที่ 16 ตามเวลาไทย ⇒ ต้องนับเป็น 15 วัน ไม่ใช่ 14
    expect(daysOverdue(dueDate, new Date('2026-08-15T20:00:00Z'))).toBe(15)
  })

  it('ยังไม่ถึงกำหนด = ค่าติดลบ', () => {
    expect(daysOverdue(new Date('2026-09-01T00:00:00Z'), new Date('2026-08-15T03:00:00Z'))).toBe(-17)
  })

  it('ช่วงอายุหนี้ตามค่าตั้ง [30,60,90] → 0-30 / 31-60 / 61-90 / 90+', () => {
    expect(agingBucketIndex(-5, buckets)).toBe(0)
    expect(agingBucketIndex(30, buckets)).toBe(0)
    expect(agingBucketIndex(31, buckets)).toBe(1)
    expect(agingBucketIndex(60, buckets)).toBe(1)
    expect(agingBucketIndex(90, buckets)).toBe(2)
    expect(agingBucketIndex(91, buckets)).toBe(3)
  })

  it('ช่วงอายุหนี้ที่ตั้งเองได้ (ห้าม hardcode 30/60/90)', () => {
    expect(agingBucketIndex(20, [15, 45])).toBe(1)
    expect(agingBucketIndex(50, [15, 45])).toBe(2)
  })
})

describe('summarizeArAging', () => {
  const asOf = new Date('2026-08-15T03:00:00Z')
  const rows = [
    // เลยกำหนด 14 วัน — ช่วง 0-30
    { dueDate: new Date('2026-08-01T00:00:00Z'), totalSatang: 1_000_000, receivedSatang: 0, ...noWht },
    // เลยกำหนด 45 วัน — ช่วง 31-60
    { dueDate: new Date('2026-07-01T00:00:00Z'), totalSatang: 500_000, receivedSatang: 200_000, ...noWht },
    // เลยกำหนด 136 วัน — ช่วง 90+
    { dueDate: new Date('2026-04-01T00:00:00Z'), totalSatang: 300_000, receivedSatang: 0, ...noWht },
    // จ่ายครบแล้ว — ไม่เข้ารายงานค้างรับ
    { dueDate: new Date('2026-04-01T00:00:00Z'), totalSatang: 900_000, receivedSatang: 900_000, ...noWht },
    // ลูกค้าหัก WHT แล้วโอนส่วนที่เหลือ ⇒ ชำระครบ ไม่เข้าช่วงใดเลย
    {
      dueDate: new Date('2026-04-01T00:00:00Z'),
      totalSatang: 1_000_000,
      receivedSatang: 970_000,
      whtWithheldByCustomerSatang: 30_000,
      bankFeeWrittenOffSatang: 0,
    },
  ]

  it('แยกยอดเข้าช่วงถูกต้อง + ป้ายชื่อชุดเดียวกับ describeAgingBuckets()', () => {
    const summary = summarizeArAging(rows, buckets, asOf)
    expect(summary.map((bucket) => bucket.label)).toEqual(['0-30 วัน', '31-60 วัน', '61-90 วัน', '90+ วัน'])
    expect(summary[0]).toEqual({ label: '0-30 วัน', outstandingSatang: 1_000_000, batchCount: 1 })
    expect(summary[1]).toEqual({ label: '31-60 วัน', outstandingSatang: 300_000, batchCount: 1 })
    expect(summary[2]).toEqual({ label: '61-90 วัน', outstandingSatang: 0, batchCount: 0 })
    expect(summary[3]).toEqual({ label: '90+ วัน', outstandingSatang: 300_000, batchCount: 1 })
  })

  it('บิลที่จ่ายครบ/จ่ายเกินไม่ถูกนับเข้าช่วงใดเลย', () => {
    const summary = summarizeArAging(rows, buckets, asOf)
    expect(summary.reduce((sum, bucket) => sum + bucket.batchCount, 0)).toBe(3)
  })

  it('ค่าตั้งที่ซ้ำ/ไม่เรียง ต้องได้ผลเดียวกับที่เรียงแล้ว (ป้ายกับยอดต้องไม่สลับช่อง)', () => {
    expect(summarizeArAging(rows, [90, 30, 60, 30], asOf)).toEqual(summarizeArAging(rows, buckets, asOf))
  })

  it('ไม่มีช่วงอายุหนี้เลย = ล้ม', () => {
    expect(() => summarizeArAging(rows, [], asOf)).toThrow(RangeError)
  })

  it('ยอดค้างรับรวมนับเฉพาะยอดที่ยังค้าง (จ่ายเกินไม่มาหักยอดคนอื่น)', () => {
    expect(totalArOutstandingSatang(rows)).toBe(1_600_000)
  })
})

describe('§6.11.1 ตัดส่วนต่างเป็นค่าธรรมเนียมธนาคาร (มติ PO U144)', () => {
  // บิล ฿10,700 · ลูกค้าหัก WHT ฿300 · เพดาน ฿50
  const bill = { totalSatang: 1_070_000, whtWithheldByCustomerSatang: 30_000, toleranceSatang: 5_000 }

  it('ขาด ฿25 (≤ เพดาน) ⇒ ตัด ฿25 · สถานะ paid · ยอดค้าง 0', () => {
    const fee = resolveBankFeeWriteOff({ ...bill, receivedSatang: 1_037_500 })
    expect(fee).toBe(2_500)
    const amounts = { totalSatang: bill.totalSatang, receivedSatang: 1_037_500, whtWithheldByCustomerSatang: 30_000, bankFeeWrittenOffSatang: fee }
    expect(arOutstandingSatang(amounts)).toBe(0)
    expect(resolveBillingStatusAfterReceipt({ current: 'sent', ...amounts })).toBe('paid')
  })

  it('ขาดเท่าเพดานพอดี ⇒ ตัด · เกิน 1 สตางค์ ⇒ ไม่ตัด (partially_paid ตามเดิม)', () => {
    expect(resolveBankFeeWriteOff({ ...bill, receivedSatang: 1_035_000 })).toBe(5_000)
    expect(resolveBankFeeWriteOff({ ...bill, receivedSatang: 1_034_999 })).toBe(0)
    expect(
      resolveBillingStatusAfterReceipt({
        current: 'sent',
        totalSatang: bill.totalSatang,
        receivedSatang: 1_034_999,
        whtWithheldByCustomerSatang: 30_000,
        bankFeeWrittenOffSatang: 0,
      }),
    ).toBe('partially_paid')
  })

  it('รับครบ/รับเกิน/ยังไม่รับเลย ⇒ ไม่ตัด', () => {
    expect(resolveBankFeeWriteOff({ ...bill, receivedSatang: 1_040_000 })).toBe(0)
    expect(resolveBankFeeWriteOff({ ...bill, receivedSatang: 1_100_000 })).toBe(0)
    expect(resolveBankFeeWriteOff({ ...bill, receivedSatang: 0 })).toBe(0)
  })

  it('เพดาน 0 = ปิดการตัด', () => {
    expect(resolveBankFeeWriteOff({ ...bill, toleranceSatang: 0, receivedSatang: 1_039_999 })).toBe(0)
  })

  it('คำนวณจากยอดสะสม — รับเพิ่มจนครบภายหลัง ⇒ ยอดตัดกลับเป็น 0 (ไม่สะสมทับ)', () => {
    expect(resolveBankFeeWriteOff({ ...bill, receivedSatang: 1_037_500 })).toBe(2_500)
    expect(resolveBankFeeWriteOff({ ...bill, receivedSatang: 1_040_000 })).toBe(0)
  })

  it('เพดานติดลบ/ไม่ใช่สตางค์จำนวนเต็ม = ล้ม', () => {
    expect(() => resolveBankFeeWriteOff({ ...bill, toleranceSatang: -1, receivedSatang: 1 })).toThrow(RangeError)
    expect(() => resolveBankFeeWriteOff({ ...bill, toleranceSatang: 0.5, receivedSatang: 1 })).toThrow(RangeError)
  })

  it('settled รวมค่าธรรมเนียมที่ตัด', () => {
    expect(
      settledSatang({ totalSatang: 0, receivedSatang: 1_037_500, whtWithheldByCustomerSatang: 30_000, bankFeeWrittenOffSatang: 2_500 }),
    ).toBe(1_070_000)
  })
})

describe('§6.11.1 ภาษีลูกค้าหัก + ค่าธรรมเนียมโอนในรายการเดียว (มติ PO U163)', () => {
  // บิล ฿3,210 · ลูกค้าหัก ฿90 (ยอดคาดรับ ฿3,120) · เพดาน ฿50
  const bill = { totalSatang: 321_000, expectedWhtSatang: 9_000, priorReceivedSatang: 0, priorWhtSatang: 0, toleranceSatang: 5_000 }
  const settle = (receivedSatang: number) => {
    const wht = resolveCustomerWhtForReceipt({ ...bill, receiptSatang: receivedSatang })
    const fee = resolveBankFeeWriteOff({
      totalSatang: bill.totalSatang,
      receivedSatang,
      whtWithheldByCustomerSatang: wht,
      toleranceSatang: bill.toleranceSatang,
    })
    const amounts = { totalSatang: bill.totalSatang, receivedSatang, whtWithheldByCustomerSatang: wht, bankFeeWrittenOffSatang: fee }
    return { wht, fee, outstanding: arOutstandingSatang(amounts), status: resolveBillingStatusAfterReceipt({ current: 'sent', ...amounts }) }
  }

  it('ตัวอย่างมติ: บิล 3,210 · หัก 90 · เงินเข้า 3,105 ⇒ ภาษี 90 + ค่าธรรมเนียม 15 · paid', () => {
    expect(settle(310_500)).toEqual({ wht: 9_000, fee: 1_500, outstanding: 0, status: 'paid' })
  })

  it('เงินเข้า = ยอดคาดรับพอดี ⇒ ภาษีเต็ม ไม่มีค่าธรรมเนียม (กติกาเดิม)', () => {
    expect(settle(312_000)).toEqual({ wht: 9_000, fee: 0, outstanding: 0, status: 'paid' })
  })

  it('ขอบล่างของช่วง (ขาดเท่าเพดาน) ⇒ ภาษีเต็ม + ค่าธรรมเนียมเท่าเพดาน · ต่ำกว่า 1 สตางค์ ⇒ ไม่นับภาษี ค้างบางส่วน', () => {
    expect(settle(307_000)).toEqual({ wht: 9_000, fee: 5_000, outstanding: 0, status: 'paid' })
    expect(settle(306_999)).toMatchObject({ wht: 0, fee: 0, status: 'partially_paid' })
  })

  it('รับเต็มยอดบิล (ลูกค้าไม่หัก) ⇒ ภาษี 0 · paid', () => {
    expect(settle(321_000)).toEqual({ wht: 0, fee: 0, outstanding: 0, status: 'paid' })
  })

  it('เงินเข้าระหว่างยอดคาดรับกับยอดเต็ม ⇒ ไม่นับภาษี · ขาดไม่เกินเพดานตัดเป็นค่าธรรมเนียมตามเดิม', () => {
    expect(settle(318_000)).toMatchObject({ wht: 0, fee: 3_000, status: 'paid' })
    expect(settle(314_000)).toMatchObject({ wht: 0, fee: 0, status: 'partially_paid' })
  })

  it('ลูกค้าไม่ได้ตั้งให้หัก ⇒ ภาษี 0 (พฤติกรรมตัดค่าธรรมเนียมเดิม)', () => {
    expect(resolveCustomerWhtForReceipt({ ...bill, expectedWhtSatang: 0, receiptSatang: 310_500 })).toBe(0)
  })

  it('เพดาน 0 ⇒ เหลือเฉพาะเงินเข้า = ยอดคาดรับพอดี', () => {
    expect(resolveCustomerWhtForReceipt({ ...bill, toleranceSatang: 0, receiptSatang: 312_000 })).toBe(9_000)
    expect(resolveCustomerWhtForReceipt({ ...bill, toleranceSatang: 0, receiptSatang: 311_999 })).toBe(0)
  })

  it('ยอดสะสมหลายใบ: ใบแรกขาดมาก (ไม่นับภาษี) · ใบที่ทำให้ยอดสะสมเข้าช่วงได้ภาษีเต็ม · ใบก่อนบันทึกไว้แล้วไม่นับซ้ำ', () => {
    expect(resolveCustomerWhtForReceipt({ ...bill, receiptSatang: 200_000 })).toBe(0)
    expect(resolveCustomerWhtForReceipt({ ...bill, priorReceivedSatang: 200_000, receiptSatang: 110_500 })).toBe(9_000)
    expect(
      resolveCustomerWhtForReceipt({ ...bill, priorReceivedSatang: 310_000, priorWhtSatang: 9_000, receiptSatang: 500 }),
    ).toBe(0)
  })

  it('ค่าไม่ใช่สตางค์จำนวนเต็ม/ติดลบ = ล้ม', () => {
    expect(() => resolveCustomerWhtForReceipt({ ...bill, receiptSatang: 1.5 })).toThrow(RangeError)
    expect(() => resolveCustomerWhtForReceipt({ ...bill, toleranceSatang: -1, receiptSatang: 1 })).toThrow(RangeError)
  })
})

describe('remainingAfterCustomerWhtSatang — ยอดค้างหลังลูกค้าหัก ณ ที่จ่าย (staging E-064)', () => {
  it('รับแล้วบางส่วน ยังไม่บันทึกภาษี ⇒ ค้าง − ภาษีที่คาด · โอนเท่ายอดนี้ ⇒ ภาษีเต็มจำนวน', () => {
    const remaining = remainingAfterCustomerWhtSatang({ remainingSatang: 95_458, expectedWhtSatang: 6_882, priorWhtSatang: 0 })
    expect(remaining).toBe(88_576)
    expect(
      resolveCustomerWhtForReceipt({
        totalSatang: 245_458,
        expectedWhtSatang: 6_882,
        priorReceivedSatang: 150_000,
        priorWhtSatang: 0,
        receiptSatang: remaining ?? 0,
        toleranceSatang: 0,
      }),
    ).toBe(6_882)
  })

  it('ภาษีบันทึกครบแล้ว / ไม่ได้ตั้งให้หัก / ผลไม่เป็นบวก ⇒ null', () => {
    expect(remainingAfterCustomerWhtSatang({ remainingSatang: 10_000, expectedWhtSatang: 300, priorWhtSatang: 300 })).toBeNull()
    expect(remainingAfterCustomerWhtSatang({ remainingSatang: 10_000, expectedWhtSatang: 0, priorWhtSatang: 0 })).toBeNull()
    expect(remainingAfterCustomerWhtSatang({ remainingSatang: 300, expectedWhtSatang: 300, priorWhtSatang: 0 })).toBeNull()
  })

  it('บันทึกภาษีไปบางส่วน ⇒ หักเฉพาะส่วนที่ยังไม่บันทึก', () => {
    expect(remainingAfterCustomerWhtSatang({ remainingSatang: 10_000, expectedWhtSatang: 300, priorWhtSatang: 100 })).toBe(9_800)
  })
})
