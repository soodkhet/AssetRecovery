import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ModalCancelButton } from '@/components/ui'
import { Tr, rowKeyActivates } from '@/components/ui/table'

/** ตรวจ staging SV5-A11Y-K-07 — แถวตารางที่กดเปิดได้ใช้คีย์บอร์ดได้ */
describe('<Tr interactive onClick> ใช้คีย์บอร์ดได้', () => {
  const open = { keyboardOpen: true, defaultPrevented: false, onRowItself: true }

  it('แถวที่กดเปิดได้ Tab ถึง (tabIndex=0) · แถวธรรมดา/ไม่มี onClick ไม่อยู่ในลำดับ Tab', () => {
    const table = (row: React.ReactNode) => renderToStaticMarkup(<table><tbody>{row}</tbody></table>)
    expect(table(<Tr interactive onClick={() => {}}><td>a</td></Tr>)).toMatch(/<tr[^>]*tabindex="0"/)
    expect(table(<Tr interactive><td>a</td></Tr>)).not.toContain('tabindex')
    expect(table(<Tr onClick={() => {}}><td>a</td></Tr>)).not.toContain('tabindex')
  })

  it('Enter/Space บนแถว = คลิก · ปุ่มอื่นไม่ทำอะไร', () => {
    expect(rowKeyActivates({ ...open, key: 'Enter' })).toBe(true)
    expect(rowKeyActivates({ ...open, key: ' ' })).toBe(true)
    expect(rowKeyActivates({ ...open, key: 'Tab' })).toBe(false)
    expect(rowKeyActivates({ ...open, key: 'a' })).toBe(false)
  })

  it('กดบนปุ่ม/ลิงก์ข้างในแถว ⇒ ไม่เปิดแถวซ้ำ · ถูกจัดการแล้ว/แถวไม่ได้กดได้ ⇒ ไม่ทำ', () => {
    expect(rowKeyActivates({ ...open, key: 'Enter', onRowItself: false })).toBe(false)
    expect(rowKeyActivates({ ...open, key: 'Enter', defaultPrevented: true })).toBe(false)
    expect(rowKeyActivates({ ...open, key: 'Enter', keyboardOpen: false })).toBe(false)
  })
})

/** ตรวจ staging SV5-A11Y-K-01 — ปุ่มยกเลิกของ modal รับ prop ปุ่มเดิมได้ (size/disabled) แทน <Button> เขียนเอง */
describe('<ModalCancelButton> ส่งต่อ prop ของปุ่ม', () => {
  it('ค่าเริ่มต้น "ยกเลิก" secondary · ส่ง disabled/ข้อความได้', () => {
    expect(renderToStaticMarkup(<ModalCancelButton onClose={() => {}} />)).toContain('ยกเลิก')
    const html = renderToStaticMarkup(
      <ModalCancelButton onClose={() => {}} disabled>
        ปิด
      </ModalCancelButton>,
    )
    expect(html).toContain('ปิด')
    expect(html).toMatch(/<button[^>]*disabled/)
  })
})
