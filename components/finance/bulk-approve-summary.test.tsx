import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BULK_APPROVE_ESTIMATE_NOTE, BulkApproveSummary } from '@/components/finance/bulk-approve-summary'

/** mytester2 F2-01 — กล่องยืนยัน "อนุมัติที่เลือก (N)" บอกชัดว่ายอดสุทธิเป็นประมาณการ (ยอดมาจาก server ไม่รวมรายแถว) */
describe('<BulkApproveSummary>', () => {
  it('ระหว่างโหลดแสดงกำลังคำนวณ + ป้ายประมาณการ + คำอธิบายเหตุ · ไม่มีเลขอ้างอิงสเปค', () => {
    const html = renderToStaticMarkup(<BulkApproveSummary ids={['a', 'b']} grossSatang={120_000} />)
    expect(html).toContain('฿1,200.00')
    expect(html).toContain('ยอดสุทธิรวม (ประมาณการ)')
    expect(html).toContain('กำลังคำนวณ')
    expect(html).toContain(BULK_APPROVE_ESTIMATE_NOTE)
    expect(BULK_APPROVE_ESTIMATE_NOTE).not.toMatch(/§|ไฟล์ \d|E-0\d\d/)
  })
})
