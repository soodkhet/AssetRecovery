import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  BULK_APPROVE_ESTIMATE_NOTE,
  BULK_APPROVE_EXISTING_WHT_NOTE,
  BulkApproveSummary,
  BulkApproveSummaryView,
} from '@/components/finance/bulk-approve-summary'

/** mytester2 F2-01 — กล่องยืนยัน "อนุมัติที่เลือก (N)" บอกชัดว่ายอดสุทธิเป็นประมาณการ (ยอดมาจาก server ไม่รวมรายแถว) */
describe('<BulkApproveSummary>', () => {
  it('ระหว่างโหลดแสดงกำลังคำนวณ + ป้ายประมาณการ + คำอธิบายเหตุ · ไม่มีเลขอ้างอิงสเปค', () => {
    const html = renderToStaticMarkup(<BulkApproveSummary ids={['a', 'b']} grossSatang={120_000} />)
    expect(html).toContain('฿1,200.00')
    expect(html).toContain('ยอดสุทธิของรายการที่เลือก (ประมาณการ)')
    expect(html).toContain('กำลังคำนวณ')
    expect(html).toContain(BULK_APPROVE_ESTIMATE_NOTE)
    expect(BULK_APPROVE_ESTIMATE_NOTE).not.toMatch(/§|ไฟล์ \d|E-0\d\d/)
  })

  it('รีวิว F2-01: ชุดที่เลือกดันรายการเดิมข้ามเกณฑ์ ⇒ ภาษีของรายการที่เลือกกับภาษีที่รายการเดิมถูกหักเพิ่มแยกบรรทัด', () => {
    const preview = { count: 1, grossSatang: 2_000, whtDeductedSatang: 60, netSatang: 1_940, existingWhtIncreaseSatang: 2_970 }
    const html = renderToStaticMarkup(<BulkApproveSummaryView grossSatang={2_000} state={{ kind: 'ready', preview }} />)
    expect(html).toContain('฿0.60')
    expect(html).toContain('฿19.40')
    expect(html).toContain('ภาษีที่รายการอนุมัติแล้วรอเข้ารอบถูกหักเพิ่ม')
    expect(html).toContain('฿29.70')
    expect(html).toContain(BULK_APPROVE_EXISTING_WHT_NOTE)
    expect(BULK_APPROVE_EXISTING_WHT_NOTE).not.toMatch(/§|ไฟล์ \d|E-0\d\d/)
  })

  it('ไม่มีรายการเดิมถูกหักเพิ่ม ⇒ ไม่แสดงบรรทัดนี้', () => {
    const preview = { count: 2, grossSatang: 120_000, whtDeductedSatang: 3_600, netSatang: 116_400, existingWhtIncreaseSatang: 0 }
    const html = renderToStaticMarkup(<BulkApproveSummaryView grossSatang={120_000} state={{ kind: 'ready', preview }} />)
    expect(html).not.toContain('ถูกหักเพิ่ม')
    expect(html).toContain('฿1,164.00')
  })
})
