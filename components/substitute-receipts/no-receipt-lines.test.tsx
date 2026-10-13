import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { NoReceiptLinesEditor, noReceiptVariantOf } from '@/components/substitute-receipts/no-receipt-lines'
import { emptySubstituteLine } from '@/lib/substitute-receipts/form'

/** mytester5 D-OUT5-01 — ตัวอย่างรายการของฟอร์มค่าที่พักต้องเป็นค่าที่พัก (ไม่ใช่ค่าผ่านทางพิเศษ) */
describe('<NoReceiptLinesEditor>', () => {
  const lines = [emptySubstituteLine('line-1', '2026-10-13')]

  it('ค่าที่พัก ⇒ ตัวอย่างค่าห้องพัก', () => {
    const html = renderToStaticMarkup(
      <NoReceiptLinesEditor lines={lines} onChange={() => undefined} defaultDate="2026-10-13" variant="hotel" />,
    )
    expect(html).toContain('ค่าห้องพัก')
    expect(html).not.toContain('ค่าผ่านทางพิเศษ')
    expect(html).not.toContain('ค่าทางด่วน')
  })

  it('ค่าตั้งต้น (รายจ่ายทั่วไป) ⇒ ตัวอย่างเดิม', () => {
    const html = renderToStaticMarkup(
      <NoReceiptLinesEditor lines={lines} onChange={() => undefined} defaultDate="2026-10-13" />,
    )
    expect(html).toContain('ค่าผ่านทางพิเศษ')
  })
})

describe('ตรวจซ้ำ staging SV5-R-04 — ตัวอย่างของฟอร์มออกใบใหม่แทนตามประเภทใบเบิก', () => {
  it('ค่าที่พัก ⇒ hotel · ชนิดอื่น/เงินทดรอง ⇒ general', () => {
    expect(noReceiptVariantOf('hotel')).toBe('hotel')
    expect(noReceiptVariantOf('receipt')).toBe('general')
    expect(noReceiptVariantOf('manual')).toBe('general')
    expect(noReceiptVariantOf(null)).toBe('general')
  })
})
