import { describe, expect, it } from 'vitest'
import { KPI_UNAVAILABLE, kpiValue } from '@/components/ui/kpi-value'

describe('kpiValue', () => {
  it('ไม่มีข้อมูล (กำลังโหลด/โหลดไม่สำเร็จ) ⇒ "—" ไม่ใช่ 0', () => {
    expect(kpiValue(null)).toBe(KPI_UNAVAILABLE)
    expect(kpiValue(undefined)).toBe(KPI_UNAVAILABLE)
  })

  it('ค่า 0 จริงยังแสดง 0', () => {
    expect(kpiValue(0)).toBe('0')
  })

  it('ใช้ตัวจัดรูปแบบเฉพาะเมื่อมีค่า', () => {
    const baht = (satang: number) => `฿${(satang / 100).toFixed(2)}`
    expect(kpiValue(12_345, baht)).toBe('฿123.45')
    expect(kpiValue(null, baht)).toBe(KPI_UNAVAILABLE)
  })
})
