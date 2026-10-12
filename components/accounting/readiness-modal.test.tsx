import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ReadinessWarnings } from '@/components/accounting/readiness-modal'

/** mytester3 H3-01 — หัวข้อคำเตือนแสดงครั้งเดียว แม้มีคำเตือนหลายกลุ่ม */
describe('<ReadinessWarnings>', () => {
  const title = 'คำเตือน — ผ่านได้แต่ควรตรวจก่อน'

  it('คำเตือน 2 กลุ่ม ⇒ หัวข้อเดียว รายการเรียงใต้หัวข้อ', () => {
    const html = renderToStaticMarkup(
      <ReadinessWarnings
        warnings={['มีข้อยกเว้นระดับคำเตือน 1 รายการ', 'มีบัญชีค่าใช้จ่ายยังไม่ระบุศูนย์ต้นทุน 72 รายการ']}
      />,
    )
    expect(html.split(title)).toHaveLength(2)
    expect(html).toContain('มีข้อยกเว้นระดับคำเตือน 1 รายการ')
    expect(html).toContain('ศูนย์ต้นทุน 72 รายการ')
    expect(html.match(/<li/g)).toHaveLength(2)
  })

  it('ไม่มีคำเตือน ⇒ ไม่แสดงกล่อง', () => {
    expect(renderToStaticMarkup(<ReadinessWarnings warnings={[]} />)).toBe('')
  })
})
