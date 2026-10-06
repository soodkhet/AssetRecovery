import { describe, expect, it } from 'vitest'
import {
  advanceAgeDays,
  advanceAgingLines,
  advanceAgingStatusLabel,
  advancePaidAt,
  buildAdvanceAgingReport,
  isAdvanceClearOverdue,
  type AdvanceAgingEntry,
} from '@/lib/reports/finance/advance-aging-report'

/**
 * F5 อายุเงินทดรองคงค้าง (มติ PO U96 #18 · `96` §6-F5 · §13 ไม่หาย ไม่ซ้ำ · §14 ครบกำหนดวันนี้ยังไม่เกิน)
 */

/** 15 ส.ค. 2569 เวลาไทย 09:00 (= 02:00Z) — เลือกเวลาเช้าเพื่อดักบั๊ก timezone */
const NOW = new Date('2026-08-15T02:00:00.000Z')

function dateOnly(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}

function paidOn(iso: string) {
  // 10:00 เวลาไทยของวันนั้น
  return { status: 'completed' as const, paymentFileGeneratedAt: new Date(`${iso}T03:00:00.000Z`), updatedAt: NOW }
}

function entry(overrides: Partial<AdvanceAgingEntry> & { advanceId: string }): AdvanceAgingEntry {
  return {
    advanceNumber: `ADV-2569-${overrides.advanceId.slice(-4).toUpperCase()}`,
    payeeId: 'p1',
    payeeName: 'สมชาย ใจดี',
    teamName: 'ทีมเหนือ',
    status: 'approved',
    approvedAt: new Date('2026-07-01T03:00:00.000Z'),
    dueClearDate: dateOnly('2026-09-01'),
    approvedSatang: 500_000,
    usedSatang: 0,
    returnSatang: 500_000,
    collectedSatang: [],
    payoutBatches: [paidOn('2026-07-02')],
    ...overrides,
  }
}

describe('วันจ่าย / อายุ', () => {
  it('วันจ่าย = รอบจ่ายแรกที่โอนจริง · รอบที่ยังไม่โอน/ยกเลิกไม่นับ · ไม่มีวันสร้างไฟล์ใช้เวลาแก้ไขรอบ', () => {
    expect(
      advancePaidAt([
        { status: 'cancelled', paymentFileGeneratedAt: new Date('2026-07-01T03:00:00Z'), updatedAt: NOW },
        paidOn('2026-07-10'),
        paidOn('2026-07-05'),
      ])?.toISOString(),
    ).toBe('2026-07-05T03:00:00.000Z')
    expect(
      advancePaidAt([{ status: 'completed', paymentFileGeneratedAt: null, updatedAt: new Date('2026-07-09T03:00:00Z') }])
        ?.toISOString(),
    ).toBe('2026-07-09T03:00:00.000Z')
    expect(advancePaidAt([{ status: 'draft', paymentFileGeneratedAt: null, updatedAt: NOW }])).toBeNull()
  })

  it('อายุนับตามปฏิทินไทย — จ่าย 23:30 ไทยของเมื่อวาน = 1 วัน · 00:30 ไทยของวันนี้ = 0', () => {
    expect(advanceAgeDays(new Date('2026-08-14T16:30:00.000Z'), NOW)).toBe(1)
    expect(advanceAgeDays(new Date('2026-08-14T17:30:00.000Z'), NOW)).toBe(0)
    expect(advanceAgeDays(new Date('2026-07-16T03:00:00.000Z'), NOW)).toBe(30)
  })
})

describe('ยอดคงค้าง', () => {
  it('ยังไม่เคลียร์ = ยอดจ่าย · เคลียร์แล้วคืนบางส่วน = ส่วนที่ยังไม่คืน · คืนครบ/ใช้เกินไม่เข้ารายงาน', () => {
    const lines = advanceAgingLines(
      [
        entry({ advanceId: 'a1' }),
        // เคลียร์: จ่าย 5,000 ใช้ 3,000 ⇒ ต้องคืน 2,000 · คืนแล้ว 500 (แถวที่กลับรายการไม่ถูกส่งเข้ามา)
        entry({ advanceId: 'a2', status: 'cleared', usedSatang: 300_000, returnSatang: 200_000, collectedSatang: [50_000] }),
        entry({ advanceId: 'a3', status: 'cleared', usedSatang: 300_000, returnSatang: 200_000, collectedSatang: [200_000] }),
        entry({ advanceId: 'a4', status: 'cleared', usedSatang: 600_000, returnSatang: 0 }),
        entry({ advanceId: 'a5', status: 'rejected' }),
      ],
      NOW,
    )
    const byId = new Map(lines.map((line) => [line.advanceId, line]))
    expect([...byId.keys()].sort()).toEqual(['a1', 'a2'])
    expect(byId.get('a1')).toMatchObject({ approvedSatang: 500_000, usedSatang: 0, returnedSatang: 0, outstandingSatang: 500_000 })
    expect(byId.get('a2')).toMatchObject({
      approvedSatang: 500_000,
      usedSatang: 300_000,
      returnedSatang: 50_000,
      outstandingSatang: 150_000,
    })
    // ยอดจ่าย = ใช้ + คืน + คงค้าง เสมอ
    for (const line of lines) {
      expect(line.usedSatang + line.returnedSatang + line.outstandingSatang).toBe(line.approvedSatang)
    }
  })

  it('ได้คืนเกินยอดคืน = ข้อมูลเพี้ยน ต้อง error ไม่ปัดเป็น 0', () => {
    expect(() =>
      advanceAgingLines([entry({ advanceId: 'x', status: 'cleared', returnSatang: 100, collectedSatang: [200] })], NOW),
    ).toThrow(RangeError)
  })

  it('ยังไม่ผ่านรอบจ่ายที่โอนแล้ว → นับอายุจากวันอนุมัติ และวันจ่ายว่าง · จ่ายหลังวันดูรายงานไม่นับ', () => {
    const lines = advanceAgingLines(
      [
        entry({ advanceId: 'unpaid', payoutBatches: [], approvedAt: new Date('2026-08-05T03:00:00Z') }),
        entry({ advanceId: 'future', payoutBatches: [paidOn('2026-08-20')] }),
      ],
      NOW,
    )
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ advanceId: 'unpaid', paidAt: null, ageDays: 10 })
  })
})

describe('ช่วงอายุ 0–30 / 31–60 / 61–90 / 90+ และเกินกำหนดเคลียร์', () => {
  it('ขอบช่วงตรงตามมติ', () => {
    const lines = advanceAgingLines(
      [
        entry({ advanceId: 'd30', payoutBatches: [paidOn('2026-07-16')] }),
        entry({ advanceId: 'd31', payoutBatches: [paidOn('2026-07-15')] }),
        entry({ advanceId: 'd60', payoutBatches: [paidOn('2026-06-16')] }),
        entry({ advanceId: 'd61', payoutBatches: [paidOn('2026-06-15')] }),
        entry({ advanceId: 'd90', payoutBatches: [paidOn('2026-05-17')] }),
        entry({ advanceId: 'd91', payoutBatches: [paidOn('2026-05-16')] }),
      ],
      NOW,
    )
    const bucketOf = Object.fromEntries(lines.map((line) => [line.advanceId, [line.ageDays, line.bucketIndex]]))
    expect(bucketOf).toEqual({
      d30: [30, 0],
      d31: [31, 1],
      d60: [60, 1],
      d61: [61, 2],
      d90: [90, 2],
      d91: [91, 3],
    })
  })

  it('ครบกำหนดวันนี้ยังไม่เกิน · เมื่อวานเกิน 1 วัน · เคลียร์แล้วไม่นับเกินกำหนด', () => {
    expect(isAdvanceClearOverdue({ status: 'approved', dueClearDate: dateOnly('2026-08-15') }, NOW)).toBe(false)
    expect(isAdvanceClearOverdue({ status: 'approved', dueClearDate: dateOnly('2026-08-14') }, NOW)).toBe(true)
    expect(isAdvanceClearOverdue({ status: 'overdue', dueClearDate: dateOnly('2026-08-14') }, NOW)).toBe(true)
    expect(isAdvanceClearOverdue({ status: 'cleared', dueClearDate: dateOnly('2026-08-01') }, NOW)).toBe(false)
    // เวลาไทยดึก ๆ ของวันครบกำหนด ต้องยังไม่พลิก
    expect(
      isAdvanceClearOverdue({ status: 'approved', dueClearDate: dateOnly('2026-08-15') }, new Date('2026-08-15T16:30:00Z')),
    ).toBe(false)
  })

  it('ป้ายสถานะ', () => {
    expect(advanceAgingStatusLabel({ status: 'approved', overdueDays: null })).toBe('อนุมัติแล้ว — รอเคลียร์ยอด')
    expect(advanceAgingStatusLabel({ status: 'approved', overdueDays: 5 })).toBe('เกินกำหนดเคลียร์ 5 วัน')
    expect(advanceAgingStatusLabel({ status: 'cleared', overdueDays: null })).toBe('เคลียร์ยอดแล้ว — รอรับคืนยอดคงเหลือ')
  })
})

describe('buildAdvanceAgingReport — รายใบ / รายพนักงาน', () => {
  const advances = [
    entry({ advanceId: 'a1', payoutBatches: [paidOn('2026-05-01')], dueClearDate: dateOnly('2026-06-01'), status: 'overdue' }),
    entry({ advanceId: 'a2', payoutBatches: [paidOn('2026-08-10')], approvedSatang: 100_000, returnSatang: 100_000 }),
    entry({
      advanceId: 'b1',
      payeeId: 'p2',
      payeeName: 'สมหญิง ดีมาก',
      teamName: 'ทีมใต้',
      status: 'cleared',
      usedSatang: 300_000,
      returnSatang: 200_000,
      collectedSatang: [50_000],
      payoutBatches: [paidOn('2026-06-20')],
    }),
  ]

  it('รายใบ: เรียงอายุมากสุดก่อน · ไม่หายไม่ซ้ำ · KPI และแถวรวม', () => {
    const data = buildAdvanceAgingReport({ advances, asOf: NOW, groupBy: 'advance' })
    expect(data.rows.map((row) => row['__key'])).toEqual(['a1', 'b1', 'a2'])
    expect(data.columns.map((column) => column.header)).toEqual([
      'พนักงาน',
      'ทีม',
      'เลขที่',
      'วันจ่าย',
      'กำหนดเคลียร์',
      'ยอดจ่าย',
      'ใช้แล้ว',
      'คืนแล้ว',
      'คงค้าง',
      'อายุ (วัน)',
      'ช่วงอายุ',
      'สถานะ',
    ])
    expect(data.rows[0]).toMatchObject({
      outstandingSatang: 500_000,
      ageDays: 106,
      bucketLabel: '90+ วัน',
      statusLabel: 'เกินกำหนดเคลียร์ 75 วัน',
      dueClearDate: '2026-06-01',
    })
    expect(String(data.rows[0]?.['ref'])).toMatch(/^ADV-/)
    const kpi = Object.fromEntries((data.kpis ?? []).map((item) => [item.key, item.value]))
    expect(kpi).toEqual({ count: 3, amount: 750_000, overdueAmount: 500_000, over90: 500_000 })
    expect(data.totalRow).toMatchObject({ approvedSatang: 1_100_000, usedSatang: 300_000, returnedSatang: 50_000, outstandingSatang: 750_000 })
  })

  it('รายพนักงาน: รวมยอดต่อคน + แยกยอดคงค้างตามช่วงอายุ', () => {
    const data = buildAdvanceAgingReport({ advances, asOf: NOW, groupBy: 'payee' })
    expect(data.columns.map((column) => column.header)).toContain('90+ วัน')
    expect(data.rows).toHaveLength(2)
    expect(data.rows[0]).toMatchObject({
      payeeName: 'สมชาย ใจดี',
      advanceCount: 2,
      outstandingSatang: 600_000,
      bucket0: 100_000,
      bucket3: 500_000,
      overdueCount: 1,
      maxAgeDays: 106,
    })
    expect(data.rows[1]).toMatchObject({ payeeName: 'สมหญิง ดีมาก', outstandingSatang: 150_000, bucket1: 150_000 })
    expect(data.totalRow).toMatchObject({ advanceCount: 3, outstandingSatang: 750_000, bucket3: 500_000 })
  })

  it('ไม่มีรายการคงค้าง → ไม่มีแถวรวม · KPI เป็นศูนย์', () => {
    const data = buildAdvanceAgingReport({ advances: [], asOf: NOW, groupBy: 'advance' })
    expect(data.rows).toEqual([])
    expect(data.totalRow).toBeNull()
    expect(data.kpis?.find((item) => item.key === 'amount')?.value).toBe(0)
  })
})
