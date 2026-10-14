import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  chooseInitialFocus,
  decideFocusRecovery,
  decideTabTarget,
  pickRestoreTarget,
  pickOpener,
  selectTabbable,
  shouldRestoreFocus,
  type TabCandidate,
} from '@/components/ui/focus-trap'
import { Button } from '@/components/ui/button'
import { ConfirmModal, Modal } from '@/components/ui/modal'

function candidate(overrides: Partial<TabCandidate> & { name?: string } = {}): TabCandidate & { name: string } {
  return { name: 'x', tabIndex: 0, disabled: false, hidden: false, radioGroup: null, checked: false, ...overrides }
}

/** ตรวจ a11y staging SV5-C1-01 — โมดัล aria-modal ต้องกักโฟกัส */
describe('selectTabbable — ตัวที่ Tab ถึงในแผง', () => {
  it('ตัด tabindex=-1 / disabled / ซ่อน ออก คงลำดับเอกสาร', () => {
    const items = [
      candidate({ name: 'close' }),
      candidate({ name: 'panel', tabIndex: -1 }),
      candidate({ name: 'locked', disabled: true }),
      candidate({ name: 'hidden-file', hidden: true }),
      candidate({ name: 'save' }),
    ]
    expect(selectTabbable(items).map((item) => item.name)).toEqual(['close', 'save'])
  })

  it('กลุ่ม radio เหลือตัวที่เลือก · ไม่มีตัวที่เลือก ⇒ ตัวแรกของกลุ่ม', () => {
    const items = [
      candidate({ name: 'a1', radioGroup: 'a' }),
      candidate({ name: 'a2', radioGroup: 'a', checked: true }),
      candidate({ name: 'b1', radioGroup: 'b' }),
      candidate({ name: 'b2', radioGroup: 'b' }),
      candidate({ name: 'ok' }),
    ]
    expect(selectTabbable(items).map((item) => item.name)).toEqual(['a2', 'b1', 'ok'])
  })
})

describe('decideTabTarget — Tab/Shift+Tab วนในแผง', () => {
  it('Tab จากตัวสุดท้าย ⇒ กลับตัวแรก (เดิมหลุดไปโลโก้/เมนูหลังโมดัล)', () => {
    expect(decideTabTarget(3, { kind: 'item', index: 2 }, false)).toBe('first')
  })

  it('Shift+Tab จากตัวแรก ⇒ ไปตัวสุดท้าย (เดิมหลุดไปปุ่มในตารางหลังโมดัล)', () => {
    expect(decideTabTarget(3, { kind: 'item', index: 0 }, true)).toBe('last')
  })

  it('ตัวกลาง ⇒ ปล่อย browser เลื่อนตามปกติ', () => {
    expect(decideTabTarget(3, { kind: 'item', index: 1 }, false)).toBeNull()
    expect(decideTabTarget(3, { kind: 'item', index: 1 }, true)).toBeNull()
    expect(decideTabTarget(3, { kind: 'item', index: 0 }, false)).toBeNull()
    expect(decideTabTarget(3, { kind: 'item', index: 2 }, true)).toBeNull()
    expect(decideTabTarget(3, { kind: 'between' }, false)).toBeNull()
  })

  it('โฟกัสอยู่ที่แผงเอง (ตอนเพิ่งเปิด) ⇒ Tab ตัวแรก · Shift+Tab ตัวสุดท้าย', () => {
    expect(decideTabTarget(3, { kind: 'before' }, false)).toBe('first')
    expect(decideTabTarget(3, { kind: 'before' }, true)).toBe('last')
  })

  it('จุดหลังตัวสุดท้ายในแผง ⇒ ไม่หลุดออก', () => {
    expect(decideTabTarget(3, { kind: 'after' }, false)).toBe('first')
    expect(decideTabTarget(3, { kind: 'after' }, true)).toBe('last')
  })

  it('โฟกัสหลุดนอกแผง (body/หน้าหลัง) ⇒ ดึงกลับเข้าแผง', () => {
    expect(decideTabTarget(2, { kind: 'outside' }, false)).toBe('first')
    expect(decideTabTarget(2, { kind: 'outside' }, true)).toBe('last')
  })

  it('ตัวเดียว ⇒ Tab ทั้งสองทิศค้างที่ตัวนั้น · ไม่มีอะไรให้ Tab ⇒ ค้างที่แผง', () => {
    expect(decideTabTarget(1, { kind: 'item', index: 0 }, false)).toBe('first')
    expect(decideTabTarget(1, { kind: 'item', index: 0 }, true)).toBe('last')
    expect(decideTabTarget(0, { kind: 'outside' }, false)).toBe('container')
  })
})

describe('chooseInitialFocus — โฟกัสแรกตอนเปิด', () => {
  it('ข้ามปุ่มปิดที่หัว ⇒ ช่องแรกของฟอร์ม', () => {
    expect(
      chooseInitialFocus(
        [
          { skip: true, kind: 'other' },
          { skip: false, kind: 'text' },
        ],
        { coarsePointer: false },
      ),
    ).toBe(1)
  })

  it('ConfirmModal ที่ไม่มีช่องกรอก ⇒ ปุ่มแรกใน footer (ยกเลิก — ไม่ใช่ปุ่มยืนยัน)', () => {
    expect(
      chooseInitialFocus(
        [
          { skip: true, kind: 'other' },
          { skip: false, kind: 'other' },
          { skip: false, kind: 'other' },
        ],
        { coarsePointer: false },
      ),
    ).toBe(1)
  })

  it('จอสัมผัส + ช่องพิมพ์ ⇒ โฟกัสแผง (คีย์บอร์ดไม่เด้งบังฟอร์ม)', () => {
    expect(chooseInitialFocus([{ skip: false, kind: 'text' }], { coarsePointer: true })).toBe(-1)
    expect(chooseInitialFocus([{ skip: false, kind: 'other' }], { coarsePointer: true })).toBe(0)
  })

  it('combobox (เปิดรายการแนะนำเอง) / iframe ⇒ โฟกัสแผง', () => {
    expect(chooseInitialFocus([{ skip: false, kind: 'combobox' }], { coarsePointer: false })).toBe(-1)
    expect(chooseInitialFocus([{ skip: false, kind: 'frame' }], { coarsePointer: false })).toBe(-1)
  })

  it('ไม่มีตัวที่โฟกัสได้ ⇒ แผง', () => {
    expect(chooseInitialFocus([], { coarsePointer: false })).toBe(-1)
    expect(chooseInitialFocus([{ skip: true, kind: 'other' }], { coarsePointer: false })).toBe(-1)
  })
})

describe('shouldRestoreFocus — ปิดแล้วคืนโฟกัสให้ปุ่มที่เปิด', () => {
  it('โฟกัสตกไป body หลังแผงหาย ⇒ คืน', () => {
    expect(shouldRestoreFocus({ openerConnected: true, activeIsBody: true, activeInsideContainer: false })).toBe(true)
  })

  it('ผู้เรียกย้ายโฟกัสไปที่อื่นเองแล้ว ⇒ ไม่แย่ง', () => {
    expect(shouldRestoreFocus({ openerConnected: true, activeIsBody: false, activeInsideContainer: false })).toBe(false)
  })

  it('ปุ่มที่เปิดหายไปจากหน้าแล้ว ⇒ ไม่คืน', () => {
    expect(shouldRestoreFocus({ openerConnected: false, activeIsBody: true, activeInsideContainer: false })).toBe(false)
  })
})

describe('<Modal> markup', () => {
  it('ชื่อโมดัลผูก aria-labelledby/aria-describedby · ปุ่ม X ไม่ใช่โฟกัสแรก', () => {
    const html = renderToStaticMarkup(
      <Modal open onClose={() => {}} title="รับเข้าคลัง" description="ตรวจเครื่อง">
        <input id="imei" />
      </Modal>,
    )
    const labelledBy = /aria-labelledby="([^"]+)"/.exec(html)?.[1]
    const describedBy = /aria-describedby="([^"]+)"/.exec(html)?.[1]
    expect(labelledBy).toBeDefined()
    expect(html).toContain(`<h2 id="${labelledBy}"`)
    expect(html).toContain(`<p id="${describedBy}"`)
    expect(html).toMatch(/aria-label="ปิด"[^>]*data-initial-focus="skip"/)
  })

  it('ไม่มีคำอธิบาย ⇒ ไม่ใส่ aria-describedby', () => {
    const html = renderToStaticMarkup(
      <ConfirmModal open onClose={() => {}} onConfirm={() => {}} title="ยืนยัน" confirmLabel="ยืนยันลบ" />,
    )
    expect(html).not.toContain('aria-describedby')
  })
})

describe('pickOpener — ใครเปิดโมดัล', () => {
  it('โฟกัสตอนเปิดอยู่นอกแผง ⇒ ตัวนั้น', () => {
    expect(pickOpener({ active: 'button', lastInteracted: 'row' })).toBe('button')
  })

  it('Safari ไม่โฟกัสปุ่มที่คลิก / autoFocus ย้ายโฟกัสเข้าแผงก่อน ⇒ ตัวที่ผู้ใช้กดล่าสุด', () => {
    expect(pickOpener({ active: null, lastInteracted: 'button' })).toBe('button')
    expect(pickOpener({ active: null, lastInteracted: null })).toBeNull()
  })
})

/** ตรวจ focus trap staging SV5-D3-02 — กดยืนยันแล้วปุ่มเข้าสถานะโหลด โฟกัสต้องไม่หลุดไป body */
describe('decideFocusRecovery — ปุ่มที่โฟกัสอยู่ถูก disable ระหว่างโหลด', () => {
  it('ปุ่มที่กดถูก disable (โฟกัสหลุดเป็น body หรือยังค้างบนปุ่มที่ใช้ไม่ได้) ⇒ จอดที่แผง', () => {
    expect(decideFocusRecovery({ focusLost: true, parked: false, restoreTargetUsable: false })).toBe('park')
  })

  it('error ⇒ ปุ่มกลับมาใช้ได้ขณะโฟกัสยังจอดที่แผง ⇒ คืนโฟกัสให้ปุ่มที่กด', () => {
    expect(decideFocusRecovery({ focusLost: false, parked: true, restoreTargetUsable: true })).toBe('restore')
  })

  it('ระหว่างยังโหลด (ปุ่มยัง disabled) มีการเปลี่ยนแปลงอื่นในแผง ⇒ จอดต่อ ไม่ทำอะไร', () => {
    expect(decideFocusRecovery({ focusLost: false, parked: true, restoreTargetUsable: false })).toBeNull()
  })

  it('revealFirstFieldError โฟกัสช่องที่ผิดไปแล้ว (ไม่ได้จอด) ⇒ ไม่แย่งกลับไปปุ่ม', () => {
    expect(decideFocusRecovery({ focusLost: false, parked: false, restoreTargetUsable: true })).toBeNull()
  })

  it('ไม่ดึงโฟกัสเข้าตัวเดิมเองถ้า trap ไม่ได้จอดไว้ (กันคีย์บอร์ดมือถือเด้ง)', () => {
    expect(decideFocusRecovery({ focusLost: false, parked: false, restoreTargetUsable: false })).toBeNull()
  })

  it('ลำดับเต็ม: โหลด ⇒ จอด · error ⇒ คืนปุ่ม · โฟกัสอยู่ปุ่มแล้ว ⇒ เฉย', () => {
    const steps = [
      { focusLost: true, parked: false, restoreTargetUsable: false },
      { focusLost: false, parked: true, restoreTargetUsable: true },
      { focusLost: false, parked: false, restoreTargetUsable: true },
    ]
    expect(steps.map((step) => decideFocusRecovery(step))).toEqual(['park', 'restore', null])
  })

  it('เป้าคืน: ช่องที่ผิดหลังส่งชนะปุ่มที่กด (Modal ปลด fieldset ช้ากว่า reveal) · ไม่มีช่องผิด ⇒ ปุ่มที่กด', () => {
    expect(pickRestoreTarget({ errorControl: 'amount', parkedFrom: 'submit' })).toBe('amount')
    expect(pickRestoreTarget({ errorControl: null, parkedFrom: 'submit' })).toBe('submit')
    expect(pickRestoreTarget<string>({ errorControl: null, parkedFrom: null })).toBeNull()
  })

  it('<Button loading> ยัง disabled จริง (กันกดซ้ำ/Enter ส่งฟอร์มซ้ำ) + aria-busy', () => {
    const html = renderToStaticMarkup(
      <Button type="submit" loading>
        ยืนยัน
      </Button>,
    )
    expect(html).toMatch(/<button[^>]*\sdisabled=""/)
    expect(html).toContain('aria-busy="true"')
    expect(renderToStaticMarkup(<Button type="submit">ยืนยัน</Button>)).not.toContain('disabled=""')
  })
})
