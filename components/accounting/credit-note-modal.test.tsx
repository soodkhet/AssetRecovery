import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CreditNoteBlockedAlert } from '@/components/accounting/credit-note-modal'

/** mytester3 LR3-01 — เหตุที่บันทึกใบลดหนี้ไม่ได้ต้องตรงกรณีจริง */
describe('<CreditNoteBlockedAlert>', () => {
  it('ส่วนที่ลดยังไม่ออกใบ ⇒ "ไม่ต้องออกใบลดหนี้" ไม่ใช่ "ไม่มียอดค้างชำระ"', () => {
    const html = renderToStaticMarkup(<CreditNoteBlockedAlert reason="uninvoiced" />)
    expect(html).toContain('ไม่ต้องออกใบลดหนี้')
    expect(html).toContain('ส่วนที่ลดยังไม่ได้ออกใบกำกับภาษี')
    expect(html).not.toContain('ไม่มียอดค้างชำระ')
  })

  it('ยอดค้าง 0 ⇒ คำเตือนเดิม (คืนเงินนอกระบบ) · ไม่บล็อก ⇒ ไม่แสดง', () => {
    expect(renderToStaticMarkup(<CreditNoteBlockedAlert reason="outstanding" />)).toContain('ไม่มียอดค้างชำระ')
    expect(renderToStaticMarkup(<CreditNoteBlockedAlert reason={null} />)).toBe('')
  })
})
