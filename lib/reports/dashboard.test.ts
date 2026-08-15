import { describe, expect, it } from 'vitest'
import {
  DASHBOARD_KPI_IDS,
  DASHBOARD_KPI_META,
  KPI_TONE_CLASS,
  compareExceptionLevel,
  countExceptionLevels,
  exceptionLinkOf,
  exceptionModuleLabel,
} from '@/lib/reports/dashboard'

describe('KPI meta (`14` §6.1/§8)', () => {
  it('มีครบ 4 ตัวและเรียงตามสเปค (รออนุมัติ → รอจ่าย → ค้างรับ → กำไรเดือนนี้)', () => {
    expect(DASHBOARD_KPI_META.map((kpi) => kpi.id)).toEqual([...DASHBOARD_KPI_IDS])
    expect(DASHBOARD_KPI_META).toHaveLength(4)
  })

  it('โทนสีตรงตาม `14` §8 — amber/blue/red/emerald', () => {
    expect(DASHBOARD_KPI_META.map((kpi) => kpi.tone)).toEqual(['amber', 'blue', 'red', 'emerald'])
    for (const kpi of DASHBOARD_KPI_META) expect(KPI_TONE_CLASS[kpi.tone]).toBeTruthy()
  })

  it('การ์ดที่ 4 เป็น "กำไรขั้นต้นเดือนนี้" ตามสเปค (ไม่ใช่ "รายได้รวม" แบบ mockup)', () => {
    expect(DASHBOARD_KPI_META[3]).toMatchObject({ id: 'gross_profit', source: 'ไฟล์ 21' })
  })
})

describe('countExceptionLevels', () => {
  it('นับแยกตามระดับ + ยอดรวม', () => {
    const counts = countExceptionLevels([
      { level: 'critical' },
      { level: 'critical' },
      { level: 'warning' },
      { level: 'info' },
    ])
    expect(counts).toEqual({ critical: 2, warning: 1, info: 1, total: 4 })
  })

  it('ไม่มี exception ⇒ ศูนย์ทุกช่อง', () => {
    expect(countExceptionLevels([])).toEqual({ critical: 0, warning: 0, info: 0, total: 0 })
  })
})

describe('compareExceptionLevel', () => {
  it('critical ขึ้นก่อน warning ก่อน info', () => {
    const sorted = (['info', 'critical', 'warning'] as const).slice().sort(compareExceptionLevel)
    expect(sorted).toEqual(['critical', 'warning', 'info'])
  })
})

describe('exceptionLinkOf (`14` §15 — คลิกแล้วต้องไปถึงหน้าที่เกี่ยวข้องจริง)', () => {
  it('โมดูลการเงินลิงก์เข้าแท็บที่เปิดใช้งานแล้ว', () => {
    expect(exceptionLinkOf('billing')).toBe('/finance?tab=revenue')
    expect(exceptionLinkOf('payout')).toBe('/finance?tab=payout')
    expect(exceptionLinkOf('expense')).toBe('/finance?tab=approval')
    expect(exceptionLinkOf('advance')).toBe('/finance?tab=advances')
    expect(exceptionLinkOf('adjustment')).toBe('/finance?tab=adjustment')
  })

  it('โมดูลบัญชีลิงก์เข้าหน้าบัญชี · โมดูลไม่รู้จัก ⇒ null (ไม่เดาเส้นทาง)', () => {
    expect(exceptionLinkOf('bank')).toBe('/accounting')
    expect(exceptionLinkOf('wht')).toBe('/accounting')
    expect(exceptionLinkOf('โมดูลที่ยังไม่มี')).toBeNull()
  })
})

describe('exceptionModuleLabel', () => {
  it('แปลงเป็นป้ายไทย · โมดูลนอกทะเบียนคืนค่าดิบ', () => {
    expect(exceptionModuleLabel('billing')).toBe('วางบิล (19)')
    expect(exceptionModuleLabel('unknown_module')).toBe('unknown_module')
  })
})
