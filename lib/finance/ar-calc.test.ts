import { describe, expect, it } from 'vitest'
import {
  agingBucketIndex,
  arOutstandingSatang,
  daysOverdue,
  summarizeArAging,
  totalArOutstandingSatang,
} from '@/lib/finance/ar-calc'
import { DEFAULT_AR_AGING_BUCKETS } from '@/lib/settings/finance-policy'

/** `22` §6.11 · `19` §6.4 — ยอดค้างรับ + ช่วงอายุหนี้ */

const buckets = [...DEFAULT_AR_AGING_BUCKETS] // [30, 60, 90]

describe('§6.11 ยอดค้างรับ', () => {
  it('outstanding = total - received', () => {
    expect(arOutstandingSatang({ totalSatang: 1_000_000, receivedSatang: 400_000 })).toBe(600_000)
  })

  it('จ่ายครบ = 0 · จ่ายเกิน = ติดลบ (ไม่ clamp เพื่อไม่ให้ยอดหาย)', () => {
    expect(arOutstandingSatang({ totalSatang: 1_000_000, receivedSatang: 1_000_000 })).toBe(0)
    expect(arOutstandingSatang({ totalSatang: 1_000_000, receivedSatang: 1_100_000 })).toBe(-100_000)
  })

  it('ค่าที่ไม่ใช่สตางค์จำนวนเต็ม = ล้ม', () => {
    expect(() => arOutstandingSatang({ totalSatang: 1_000.5, receivedSatang: 0 })).toThrow(RangeError)
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
    { dueDate: new Date('2026-08-01T00:00:00Z'), totalSatang: 1_000_000, receivedSatang: 0 },
    // เลยกำหนด 45 วัน — ช่วง 31-60
    { dueDate: new Date('2026-07-01T00:00:00Z'), totalSatang: 500_000, receivedSatang: 200_000 },
    // เลยกำหนด 136 วัน — ช่วง 90+
    { dueDate: new Date('2026-04-01T00:00:00Z'), totalSatang: 300_000, receivedSatang: 0 },
    // จ่ายครบแล้ว — ไม่เข้ารายงานค้างรับ
    { dueDate: new Date('2026-04-01T00:00:00Z'), totalSatang: 900_000, receivedSatang: 900_000 },
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
