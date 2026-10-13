import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ReadinessWarnings } from '@/components/accounting/readiness-modal'
import { READINESS_WARNING_LINK } from '@/lib/accounting/period'

/** mytester3 H3-01 — หัวข้อคำเตือนแสดงครั้งเดียว แม้มีคำเตือนหลายกลุ่ม · known H-05 — แต่ละข้อมีลิงก์ไปหน้าที่แก้ */
describe('<ReadinessWarnings>', () => {
  const title = 'คำเตือน — ผ่านได้แต่ควรตรวจก่อน'

  it('คำเตือน 2 กลุ่ม ⇒ หัวข้อเดียว รายการเรียงใต้หัวข้อ พร้อมลิงก์ของแต่ละข้อ', () => {
    const html = renderToStaticMarkup(
      <ReadinessWarnings
        items={[
          { text: 'มีข้อยกเว้นระดับคำเตือน 1 รายการ', link: READINESS_WARNING_LINK.warningExceptions },
          { text: 'มีบัญชีค่าใช้จ่ายยังไม่ระบุศูนย์ต้นทุน 72 รายการ', link: READINESS_WARNING_LINK.expenses },
        ]}
      />,
    )
    expect(html.split(title)).toHaveLength(2)
    expect(html).toContain('มีข้อยกเว้นระดับคำเตือน 1 รายการ')
    expect(html).toContain('ศูนย์ต้นทุน 72 รายการ')
    expect(html.match(/<li/g)).toHaveLength(2)
    expect(html).toContain('href="/accounting?tab=documents"')
    expect(html).toContain('href="/accounting?tab=expenses"')
  })

  it('คำเตือนข้อเดียว ⇒ มีลิงก์ · ไม่มีหน้าที่แก้ ⇒ ไม่มีลิงก์', () => {
    expect(
      renderToStaticMarkup(<ReadinessWarnings items={[{ text: 'รอใบ 50 ทวิ', link: READINESS_WARNING_LINK.customerWht }]} />),
    ).toContain('href="/accounting?tab=customer-wht"')
    expect(renderToStaticMarkup(<ReadinessWarnings items={[{ text: 'เตือนทั่วไป', link: null }]} />)).not.toContain('href=')
  })

  it('ไม่มีคำเตือน ⇒ ไม่แสดงกล่อง', () => {
    expect(renderToStaticMarkup(<ReadinessWarnings items={[]} />)).toBe('')
  })
})
