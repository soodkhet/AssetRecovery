import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FormSubmitError } from '@/components/ui'

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
