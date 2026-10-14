import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FormSubmitError, FormSubmitFooter } from '@/components/ui'

/** ตรวจซ้ำ staging SV5-R3-01 — ข้อความผิดพลาดใน footer ของ modal ต้องถูกอ่านออกเสียงทันที */
describe('<FormSubmitError>', () => {
  it('ไม่มีข้อความ ⇒ ไม่ render', () => {
    expect(renderToStaticMarkup(<FormSubmitError message={null} />)).toBe('')
  })

  it('มีข้อความ ⇒ role="alert" + aria-live', () => {
    const html = renderToStaticMarkup(<FormSubmitError message="แนบไฟล์ใบเสร็จก่อนส่ง" />)
    expect(html).toContain('role="alert"')
    expect(html).toContain('aria-live="assertive"')
    expect(html).toContain('แนบไฟล์ใบเสร็จก่อนส่ง')
  })
})

/** ตรวจซ้ำ staging SV5-R5-01 — footer ของ modal ฟอร์ม: ข้อความผิดพลาดอยู่เหนือปุ่มส่ง (ติดจอ) */
describe('<FormSubmitFooter>', () => {
  it('มีข้อความ ⇒ alert อยู่ก่อนปุ่ม', () => {
    const html = renderToStaticMarkup(
      <FormSubmitFooter message="วันที่เกิดรายการ: กรุณาเลือกวันที่" tick={1}>
        <button type="button">ส่งเข้าคิวอนุมัติ</button>
      </FormSubmitFooter>,
    )
    expect(html.indexOf('role="alert"')).toBeGreaterThan(-1)
    expect(html.indexOf('role="alert"')).toBeLessThan(html.indexOf('ส่งเข้าคิวอนุมัติ'))
    expect(html).toContain('วันที่เกิดรายการ: กรุณาเลือกวันที่')
  })

  it('ไม่มีข้อความ ⇒ มีแต่ปุ่ม', () => {
    const html = renderToStaticMarkup(
      <FormSubmitFooter message={null} tick={0}>
        <button type="button">ส่ง</button>
      </FormSubmitFooter>,
    )
    expect(html).not.toContain('role="alert"')
    expect(html).toContain('ส่ง')
  })
})
