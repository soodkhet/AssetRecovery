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

/** ตรวจซ้ำ staging SV5-R4-01 — ข้อผิดของรายการแสดงใต้แถวที่ผิด และชี้ id ของช่องที่ผิดจริงให้ `revealFirstFieldError()` โฟกัส */
describe('<NoReceiptLinesEditor error>', () => {
  const lines = [emptySubstituteLine('a', '2026-10-03'), emptySubstituteLine('b', '2026-10-03')]

  it('แถว 2 ช่องจำนวนเงิน ⇒ ข้อความชี้ช่องจำนวนเงินของแถว 2 + ช่องนั้นเป็น aria-invalid', () => {
    const html = renderToStaticMarkup(
      <NoReceiptLinesEditor
        lines={lines}
        onChange={() => undefined}
        defaultDate="2026-10-03"
        error={{ lineIndex: 1, lineKey: 'b', field: 'amount', message: 'รายการที่ 2: จำนวนเงินต้องมากกว่า 0' }}
      />,
    )
    const forId = /data-field-error-for="([^"]+)"/.exec(html)?.[1]
    expect(forId).toMatch(/-line-1-amount$/)
    expect(html.match(/data-field-error(?!-)/g)).toHaveLength(1)
    // ช่องที่ข้อความชี้ไปมีอยู่จริงและถูกทำเครื่องหมายว่าผิด
    const input = new RegExp(`<input[^>]*id="${(forId ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`).exec(html)?.[0] ?? ''
    expect(input).toContain('aria-invalid="true"')
    expect(input).toContain('รายการที่ 2')
    expect(html.match(/aria-invalid="true"/g)).toHaveLength(1)
  })

  it('แถวที่ผิดถูกลบไปแล้ว (key ไม่ตรงแถวใด) ⇒ ไม่แปะข้อความใต้แถวอื่น', () => {
    const html = renderToStaticMarkup(
      <NoReceiptLinesEditor
        lines={lines}
        onChange={() => undefined}
        defaultDate="2026-10-03"
        error={{ lineIndex: 0, lineKey: 'removed', field: 'description', message: 'รายการที่ 1: ระบุรายละเอียด' }}
      />,
    )
    expect(html).not.toContain('data-field-error')
  })

  it('ไม่มี error ⇒ ไม่มีข้อความผิด', () => {
    const html = renderToStaticMarkup(<NoReceiptLinesEditor lines={lines} onChange={() => undefined} defaultDate="2026-10-03" />)
    expect(html).not.toContain('data-field-error')
    expect(html).not.toContain('aria-invalid')
  })
})
