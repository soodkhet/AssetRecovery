import { describe, expect, it } from 'vitest'

import { REPORT_DEFINITIONS } from '@/lib/reports/catalog'
import { hasReportProvider } from '@/lib/reports/providers'

/**
 * Final Test ด่าน 5 (ความครบของ UI) — รายงานทั้ง 17 ตัว (`96`) ต้องมีตัวคำนวณจริงครบ
 * ไม่มีรายงานใดเหลือสถานะ "ยังไม่เปิดใช้งาน" ในหน้ารวมรายงาน/หน้ารายงาน
 */
describe('report catalog ↔ providers', () => {
  it('มีรายงาน 17 ตัว', () => {
    expect(REPORT_DEFINITIONS).toHaveLength(17)
  })

  it.each(REPORT_DEFINITIONS.map((r) => [r.code, r.id] as const))('%s มีตัวคำนวณ (provider)', (_code, id) => {
    expect(hasReportProvider(id)).toBe(true)
  })
})
