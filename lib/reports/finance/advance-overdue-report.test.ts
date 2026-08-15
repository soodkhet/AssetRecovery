import { describe, expect, it } from 'vitest'
import {
  buildAdvanceOverdueReport,
  isAdvanceOverdue,
  type AdvanceOverdueEntry,
} from '@/lib/reports/finance/advance-overdue-report'

/**
 * F5 (`96` §6-F5 · §13 "Advance ที่เกินกำหนดแสดงครบ ไม่หาย ไม่ซ้ำ"
 * · §14 "Advance due วันนี้ → ยังไม่ขึ้น overdue (นับตั้งแต่วันถัดไป)")
 */

/** 15 ส.ค. 2569 เวลาไทย 09:00 (= 02:00Z) — เลือกเวลาเช้าเพื่อดักบั๊ก timezone */
const NOW = new Date('2026-08-15T02:00:00.000Z')

function dateOnly(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}

function advance(overrides: Partial<AdvanceOverdueEntry> & { advanceId: string }): AdvanceOverdueEntry {
  return {
    payeeName: 'สมชาย ใจดี',
    teamName: 'ทีมเหนือ',
    status: 'overdue',
    approvedAt: new Date('2026-07-01T03:00:00.000Z'),
    dueClearDate: dateOnly('2026-08-01'),
    approvedSatang: 500_000,
    purpose: 'ค่าเดินทางลงพื้นที่',
    ...overrides,
  }
}

describe('F5 — เกณฑ์เกินกำหนด', () => {
  it('ครบกำหนดวันนี้ ⇒ ยังไม่เกินกำหนด (เริ่มนับวันถัดไป)', () => {
    expect(isAdvanceOverdue(dateOnly('2026-08-15'), NOW)).toBe(false)
    expect(isAdvanceOverdue(dateOnly('2026-08-14'), NOW)).toBe(true)
    // เวลาไทยดึก ๆ ของวันเดียวกัน (23:30 = 16:30Z) ต้องยังไม่พลิกเป็นเกินกำหนด
    expect(isAdvanceOverdue(dateOnly('2026-08-15'), new Date('2026-08-15T16:30:00.000Z'))).toBe(false)
  })

  it('รายการที่ครบกำหนดวันนี้ไม่เข้าตาราง — ของเมื่อวานเข้า 1 วัน', () => {
    const data = buildAdvanceOverdueReport({
      advances: [
        advance({ advanceId: 'a1', dueClearDate: dateOnly('2026-08-15'), status: 'approved' }),
        advance({ advanceId: 'a2', dueClearDate: dateOnly('2026-08-14'), status: 'approved' }),
      ],
      asOf: NOW,
    })

    expect(data.rows).toHaveLength(1)
    expect(data.rows[0]).toMatchObject({ overdueDays: 1, statusLabel: 'อนุมัติแล้ว — รอเคลียร์ยอด' })
  })
})

describe('F5 — ตารางและ KPI', () => {
  const data = buildAdvanceOverdueReport({
    advances: [
      advance({ advanceId: 'a1', dueClearDate: dateOnly('2026-08-10'), approvedSatang: 100_000 }),
      advance({
        advanceId: 'a2',
        payeeName: 'สมหญิง รักงาน',
        dueClearDate: dateOnly('2026-07-01'),
        approvedSatang: 250_000,
        status: 'approved',
      }),
      // ยังไม่ถึงกำหนด — ต้องไม่อยู่ในรายงาน
      advance({ advanceId: 'a3', dueClearDate: dateOnly('2026-09-01'), approvedSatang: 900_000 }),
    ],
    asOf: NOW,
  })

  it('ค้างนานสุดอยู่บนสุด และแสดงวันที่เป็น ISO ให้ชั้นแสดงผลแปลงเป็น พ.ศ.', () => {
    expect(data.rows.map((row) => row['payeeName'])).toEqual(['สมหญิง รักงาน', 'สมชาย ใจดี'])
    expect(data.rows[0]).toMatchObject({ overdueDays: 45, dueClearDate: '2026-07-01', amountSatang: 250_000 })
    expect(data.rows[0]?.['approvedAt']).toBe('2026-07-01T03:00:00.000Z')
  })

  it('รายการที่สถานะยังเป็น approved (job ยังไม่พลิก) ต้องไม่หายไปจากรายงาน', () => {
    expect(data.rows.some((row) => row['statusLabel'] === 'อนุมัติแล้ว — รอเคลียร์ยอด')).toBe(true)
    expect(data.rows.some((row) => row['statusLabel'] === 'เลยกำหนดเคลียร์')).toBe(true)
  })

  it('KPI: จำนวนรายการค้าง + ยอดรวม + ค้างนานที่สุด (ไม่รวมรายการที่ยังไม่ถึงกำหนด)', () => {
    const kpi = (key: string) => data.kpis?.find((item) => item.key === key)?.value

    expect(kpi('count')).toBe(2)
    expect(kpi('amount')).toBe(350_000)
    expect(kpi('longest')).toBe(45)
    expect(data.totalRow).toMatchObject({ amountSatang: 350_000 })
  })

  it('ไม่มีรายการค้าง ⇒ ไม่มีแถวรวม (ตารางว่างต้องไม่มีแถว "รวมทั้งหมด" ลอย ๆ)', () => {
    const empty = buildAdvanceOverdueReport({ advances: [], asOf: NOW })

    expect(empty.rows).toEqual([])
    expect(empty.totalRow).toBeNull()
    expect(empty.kpis?.find((kpi) => kpi.key === 'longest')?.value).toBeNull()
  })
})
