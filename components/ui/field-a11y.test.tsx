import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { StagedFileInput } from '@/components/uploads/staged-file-input'
import { Field, Input, Select, Textarea, fieldControlAria, fieldErrorControl } from '@/components/ui'

/** ตรวจซ้ำ staging SV5-R7-01 — `<Field id>` ผูก label ↔ ช่อง + ช่องที่ผิดมี aria-invalid/aria-describedby */
describe('<Field id> ผูกช่องกรอก', () => {
  it('มีข้อผิด ⇒ label for=id · ช่อง aria-invalid + aria-describedby ชี้ข้อความใต้ช่อง · ข้อความระบุช่อง', () => {
    const html = renderToStaticMarkup(
      <Field id="adv-amount" label="ยอดเงิน" required error="กรุณากรอกยอดเงิน">
        <Input id="adv-amount" />
      </Field>,
    )
    expect(html).toContain('for="adv-amount"')
    expect(html).toMatch(/<input[^>]*aria-invalid="true"/)
    expect(html).toMatch(/<input[^>]*aria-describedby="adv-amount-error"/)
    expect(html).toMatch(/<input[^>]*id="adv-amount"/)
    expect(html).toContain('id="adv-amount-error"')
    expect(html).toContain('data-field-error-for="adv-amount"')
    expect(html).toContain('border-red-300')
  })

  it('ไม่มีข้อผิด ⇒ ไม่มี aria-invalid · aria-describedby ชี้ hint', () => {
    const html = renderToStaticMarkup(
      <Field id="adv-case" label="อ้างอิงเคส" hint="เลือกได้เฉพาะเคสของคุณ">
        <Select id="adv-case">
          <option value="">—</option>
        </Select>
      </Field>,
    )
    expect(html).not.toContain('aria-invalid')
    expect(html).toMatch(/<select[^>]*aria-describedby="adv-case-hint"/)
    expect(html).toContain('id="adv-case-hint"')
  })

  it('Textarea ได้ aria-invalid เหมือนกัน', () => {
    const html = renderToStaticMarkup(
      <Field id="adv-purpose" label="วัตถุประสงค์" error="กรุณากรอกวัตถุประสงค์">
        <Textarea id="adv-purpose" />
      </Field>,
    )
    expect(html).toMatch(/<textarea[^>]*aria-invalid="true"/)
    expect(html).toMatch(/<textarea[^>]*aria-describedby="adv-purpose-error"/)
  })

  it('ช่องที่ id ไม่ตรงกับ Field ⇒ ไม่ผูก (กล่องเดียวมีหลายช่อง)', () => {
    const html = renderToStaticMarkup(
      <Field id="main" label="หลัก" error="ผิด">
        <Input id="main" />
        <Input id="other" />
      </Field>,
    )
    expect(html.match(/aria-invalid="true"/g)).toHaveLength(1)
    expect(html).not.toMatch(/id="other"[^>]*aria-invalid/)
    expect(html).not.toMatch(/aria-invalid[^>]*id="other"/)
  })

  it('Field ไม่มี id ⇒ ไม่ใส่ aria ให้ช่อง (คงพฤติกรรมเดิม) · invalid ที่ส่งตรงยังใช้ได้', () => {
    const plain = renderToStaticMarkup(
      <Field label="หมายเหตุ" error="ผิด">
        <Input />
      </Field>,
    )
    expect(plain).not.toContain('aria-invalid')
    expect(plain).not.toContain('data-field-error-for')
    const direct = renderToStaticMarkup(<Input invalid aria-describedby="x-hint" />)
    expect(direct).toContain('aria-invalid="true"')
    expect(direct).toContain('aria-describedby="x-hint"')
  })

  it('aria-describedby ที่ส่งตรงรวมกับของ Field', () => {
    const html = renderToStaticMarkup(
      <Field id="d" label="วันที่" error="ผิด">
        <Input id="d" aria-describedby="d-note" />
      </Field>,
    )
    expect(html).toContain('aria-describedby="d-note d-error"')
  })
})

/** ตรวจซ้ำ staging SV5-R7-01 (รีวิว) — ข้อความระบุช่องจาก `<Field id>` ต้องโฟกัสช่องจริง แม้ id อยู่บนกล่อง */
describe('fieldErrorControl()', () => {
  type Fake = { id: string; tag: string; children: Fake[] }
  const node = (tag: string, id = '', children: Fake[] = []): Fake => ({ id, tag, children })
  const all = (root: Fake): Fake[] => root.children.flatMap((child) => [child, ...all(child)])
  const isControl = (fake: Fake) => ['input', 'select', 'textarea'].includes(fake.tag)
  const elements = new Map<Fake, HTMLElement>()
  function el(fake: Fake | undefined): HTMLElement | null {
    if (fake === undefined) return null
    const cached = elements.get(fake)
    if (cached !== undefined) return cached
    const element = {
      id: fake.id,
      tag: fake.tag,
      matches: () => isControl(fake) || fake.tag === 'button',
      querySelector: (selector: string) =>
        el(all(fake).find((child) => (selector === 'button' ? child.tag === 'button' : isControl(child)))),
      querySelectorAll: () => all(fake).filter((child) => child.id !== '').map((child) => el(child)),
    } as unknown as HTMLElement
    elements.set(fake, element)
    return element
  }
  function message(forId: string | undefined, parent: Fake, page: Fake): HTMLElement {
    return {
      dataset: forId === undefined ? {} : { fieldErrorFor: forId },
      parentElement: el(parent),
      ownerDocument: { getElementById: (id: string) => el(all(page).find((child) => child.id === id)) },
    } as unknown as HTMLElement
  }

  it('id ชี้ช่องกรอก ⇒ ช่องนั้น', () => {
    const input = node('input', 'amount')
    const box = node('div', '', [node('label'), input])
    const root = node('div', '', [box])
    expect(fieldErrorControl(el(root), message('amount', box, root))).toBe(el(input))
  })

  it('id ชี้กล่อง (div) ⇒ ช่องกรอกแรกในกล่อง ไม่ใช่ div ที่โฟกัสไม่ได้', () => {
    const select = node('select')
    const group = node('div', 'cycle-companies', [node('button'), select])
    const box = node('div', '', [node('label'), group])
    const root = node('div', '', [box])
    expect(fieldErrorControl(el(root), message('cycle-companies', box, root))).toBe(el(select))
  })

  it('id ซ้ำกับฟอร์มอื่นที่เปิดค้าง ⇒ เลือกช่องในฟอร์มนี้ก่อน', () => {
    const other = node('input', 'co-name')
    const mine = node('input', 'co-name')
    const box = node('div', '', [mine])
    const root = node('div', '', [box])
    const page = node('body', '', [node('div', '', [other]), root])
    expect(fieldErrorControl(el(root), message('co-name', box, page))).toBe(el(mine))
  })

  it('ไม่มี id / หาไม่เจอ ⇒ ช่องกรอกแรกในกล่องของข้อความ · ไม่มีช่องกรอก ⇒ ปุ่ม', () => {
    const input = node('input')
    const box = node('div', '', [input])
    const root = node('div', '', [box])
    expect(fieldErrorControl(el(root), message(undefined, box, root))).toBe(el(input))
    expect(fieldErrorControl(el(root), message('missing', box, root))).toBe(el(input))
    const button = node('button')
    const fileBox = node('div', '', [button])
    const fileRoot = node('div', '', [fileBox])
    expect(fieldErrorControl(el(fileRoot), message(undefined, fileBox, fileRoot))).toBe(el(button))
  })
})

/** ตรวจซ้ำ staging SV5-R9-01 — ช่องแนบไฟล์ / ช่อง native / กลุ่มตัวเลือก ผูกกับ `<Field id>` ได้ครบ */
describe('ช่องแนบไฟล์ + ช่อง native ใน <Field id>', () => {
  it('<StagedFileInput id> ⇒ label for=ปุ่มเลือกไฟล์ · ผิด ⇒ aria-invalid + describedby ชื่อไฟล์และข้อความ + กรอบแดง', () => {
    const html = renderToStaticMarkup(
      <Field id="rcpt" label="แนบใบเสร็จ" required error="กรุณาแนบใบเสร็จ">
        <StagedFileInput id="rcpt" fileName={null} accept="image/*" placeholder="แตะเพื่อเลือกไฟล์" onPick={() => undefined} />
      </Field>,
    )
    expect(html).toContain('for="rcpt"')
    expect(html).toMatch(/<button[^>]*id="rcpt"/)
    expect(html).toMatch(/<button[^>]*aria-invalid="true"/)
    expect(html).toMatch(/<button[^>]*aria-describedby="rcpt-file-name rcpt-error"/)
    expect(html).toContain('id="rcpt-file-name"')
    expect(html).toMatch(/<button[^>]*border-red-300/)
  })

  it('<StagedFileInput id> ไม่มีข้อผิด ⇒ ไม่มี aria-invalid · hint อยู่ใน describedby', () => {
    const html = renderToStaticMarkup(
      <Field id="doc" label="หลักฐาน" hint="PDF หรือรูป">
        <StagedFileInput id="doc" fileName="slip.pdf" accept="image/*" placeholder="—" onPick={() => undefined} />
      </Field>,
    )
    expect(html).not.toContain('aria-invalid')
    expect(html).toMatch(/<button[^>]*aria-describedby="doc-file-name doc-hint"/)
    expect(html).toContain('slip.pdf')
  })

  it('<StagedFileInput> ไม่ส่ง id ⇒ คงหน้าตา/พฤติกรรมเดิม (ไม่มี id/aria)', () => {
    const html = renderToStaticMarkup(
      <StagedFileInput fileName={null} accept="image/*" placeholder="แตะเพื่อเลือกไฟล์" onPick={() => undefined} />,
    )
    expect(html).not.toContain('aria-invalid')
    expect(html).not.toContain('aria-describedby')
    expect(html).not.toMatch(/<button[^>]* id=/)
  })

  it('fieldControlAria() ใช้ชื่อ id ชุดเดียวกับ <Field> · ข้อผิดชนะ hint · รวม describedBy เพิ่ม', () => {
    expect(fieldControlAria('x')).toEqual({ 'aria-invalid': undefined, 'aria-describedby': undefined })
    expect(fieldControlAria('x', { hasHint: true })).toEqual({ 'aria-invalid': undefined, 'aria-describedby': 'x-hint' })
    expect(fieldControlAria('x', { error: 'ผิด', hasHint: true })).toEqual({ 'aria-invalid': true, 'aria-describedby': 'x-error' })
    expect(fieldControlAria('x', { error: '', describedBy: 'x-name' })).toEqual({ 'aria-invalid': undefined, 'aria-describedby': 'x-name' })
    expect(fieldControlAria('x', { error: 'ผิด', describedBy: 'x-name' })['aria-describedby']).toBe('x-name x-error')
  })

  it('<Field id group> ⇒ label มี id แต่ไม่ใส่ for (กล่อง radiogroup ใช้ aria-labelledby)', () => {
    const html = renderToStaticMarkup(
      <Field id="method" group label="วิธีคืนยอด">
        <div id="method" role="radiogroup" aria-labelledby="method-label">
          <input type="radio" name="m" />
        </div>
      </Field>,
    )
    expect(html).toMatch(/<label id="method-label"/)
    expect(html).not.toContain('for="method"')
  })

  it('<Field id> ปกติ ⇒ label มี id `<id>-label` และ for=id', () => {
    const html = renderToStaticMarkup(
      <Field id="n" label="ชื่อ">
        <Input id="n" />
      </Field>,
    )
    expect(html).toMatch(/<label id="n-label" for="n"/)
  })
})
