import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * กันถดถอย ตรวจซ้ำ staging SV5-R9-01 — สแกน source (AST ไม่ใช่ regex) ของ `components/` + `app/`:
 * 1) `<Field>` ที่ห่อช่องกรอก (Input/Select/Textarea/StagedFileInput/input/select/textarea/button) ต้องมี `id`
 *    (`<Field>` ที่แสดงค่าอย่างเดียว เช่น IMEI ในสัญญา ไม่ต้องมี)
 * 2) `<Field id={X}>` ต้องมีช่อง/กล่องข้างในที่ `id={X}` ตรงกัน (เทียบข้อความ expression) — label ไม่ชี้ลอย
 * 3) id ตรงกับกล่อง/ข้อความ (div/p ฯลฯ ที่ไม่ใช่ช่องกรอก) ⇒ ต้องเป็น `<Field id group>` (label ไม่ใส่ `for`)
 * 4) `<Field group>` ที่ห่อกล่องกลุ่ม ต้องใช้ `<FieldGroupBox>` (ได้ id/aria-invalid/aria-describedby จาก Field) ห้าม `<div id>` เขียนเอง
 *    · `<FieldGroupBox>` ต้องอยู่ใน `<Field id group>` เท่านั้น (SV5-A11Y-A3-01)
 */
const ROOT = join(__dirname, '..', '..')
const CONTROL_TAGS = new Set(['Input', 'MoneyInput', 'Select', 'Textarea', 'StagedFileInput', 'input', 'select', 'textarea', 'button'])

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') sourceFiles(path, out)
    } else if (entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx')) {
      out.push(path)
    }
  }
  return out
}

function attr(element: ts.JsxOpeningLikeElement, name: string): ts.JsxAttribute | undefined {
  return element.attributes.properties.find(
    (property): property is ts.JsxAttribute => ts.isJsxAttribute(property) && property.name.getText() === name,
  )
}

function attrText(attribute: ts.JsxAttribute): string | undefined {
  const init = attribute.initializer
  if (init === undefined) return undefined
  if (ts.isStringLiteral(init)) return JSON.stringify(init.text)
  return ts.isJsxExpression(init) ? init.expression?.getText() : undefined
}

interface Problem {
  at: string
  issue: string
}

function scanSource(file: string, text: string): Problem[] {
  const problems: Problem[] = []
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const visit = (node: ts.Node): void => {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText() === 'Field') {
      const tags: string[] = []
      const ids = new Map<string, string>()
      const collect = (child: ts.Node): void => {
        const open = ts.isJsxElement(child) ? child.openingElement : ts.isJsxSelfClosingElement(child) ? child : null
        if (open !== null) {
          tags.push(open.tagName.getText())
          const idAttr = attr(open, 'id')
          const value = idAttr === undefined ? undefined : attrText(idAttr)
          if (value !== undefined && !ids.has(value)) ids.set(value, open.tagName.getText())
        }
        ts.forEachChild(child, collect)
      }
      node.children.forEach(collect)
      const at = `${relative(ROOT, file)}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`
      const fieldId = attr(node.openingElement, 'id')
      const isGroup = attr(node.openingElement, 'group') !== undefined
      if (tags.includes('FieldGroupBox')) {
        if (fieldId === undefined || !isGroup) problems.push({ at, issue: '<FieldGroupBox> ต้องอยู่ใน <Field id group>' })
      } else if (fieldId === undefined) {
        if (tags.some((tag) => CONTROL_TAGS.has(tag))) problems.push({ at, issue: '<Field> ห่อช่องกรอกแต่ไม่มี id' })
      } else {
        const want = attrText(fieldId)
        const target = want === undefined ? undefined : ids.get(want)
        if (target === undefined) problems.push({ at, issue: `<Field id=${want}> ไม่มีช่องข้างในที่ id ตรงกัน` })
        // id อยู่บนกล่อง/ข้อความ (div/p) ⇒ label `for` ผูกไม่ได้ ต้องเป็น `<Field group>` (กล่องตั้งชื่อด้วย aria-labelledby)
        else if (/^[a-z]/.test(target) && !CONTROL_TAGS.has(target) && !isGroup)
          problems.push({ at, issue: `<Field id=${want}> ชี้ <${target}> ต้องใส่ group` })
        else if (isGroup && target === 'div') problems.push({ at, issue: `<Field id=${want} group> ใช้ <FieldGroupBox> แทน div` })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return problems
}

function scan(): Problem[] {
  return [...sourceFiles(join(ROOT, 'components')), ...sourceFiles(join(ROOT, 'app'))].flatMap((file) => {
    const text = readFileSync(file, 'utf8')
    return text.includes('<Field') ? scanSource(file, text) : []
  })
}

describe('<Field id> ครอบคลุมทุกฟอร์ม', () => {
  it('ตัวสแกนจับได้จริง: ไม่มี id / id ไม่ตรง / id บนกล่องไม่ใส่ group / group ใช้ div / FieldGroupBox นอก group · multi-line / แสดงค่าอย่างเดียว / FieldGroupBox ผ่าน', () => {
    const file = join(ROOT, 'components', 'fixture.tsx')
    const problems = scanSource(
      file,
      `const a = (
        <>
          <Field label="ก"><Input value={x} /></Field>
          <Field id={\`\${fieldId}-b\`} label="ข"><Input id={\`\${fieldId}-c\`} /></Field>
          <Field
            id={\`\${fieldId}-d\`}
            label="ค"
          >
            <Textarea
              id={\`\${fieldId}-d\`}
            />
          </Field>
          <Field label="ง"><div>{value}</div></Field>
          <Field label="จ"><button type="button" /></Field>
          <Field id="g" label="ฉ"><div id="g"><Input /></div></Field>
          <Field id="h" group label="ช"><div id="h" role="group" /></Field>
          <Field id="i" group label="ซ"><FieldGroupBox role="radiogroup"><input type="radio" /></FieldGroupBox></Field>
          <Field id="j" label="ฌ"><FieldGroupBox><Input /></FieldGroupBox></Field>
          <Field id="k" group label="ญ"><p id="k">ค่าที่ระบบกำหนด</p></Field>
        </>
      )`,
    )
    expect(problems.map((problem) => problem.at.split(':')[1])).toEqual(['3', '4', '14', '15', '16', '18'])
  })

  it('ทุก <Field> ที่มีช่องกรอกมี id และ id ตรงกับช่องข้างใน', () => {
    expect(scan()).toEqual([])
  })
})

/**
 * กันถดถอย ตรวจซ้ำ staging SV5-A11Y-A1-01 — ช่อง/ปุ่มที่เขียนเองแล้วใช้ `fieldControlAria(id, { error })` (มี aria-invalid ได้)
 * ต้องเปลี่ยนเป็นกรอบแดงด้วย — className อ้าง `fieldErrorClass(` (ชุดกลาง) หรือมีเงื่อนไขสีแดงของตัวเอง
 */
function scanErrorBorder(file: string, text: string): string[] {
  const problems: string[] = []
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const visit = (node: ts.Node): void => {
    const open = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null
    if (open !== null) {
      const ariaSpread = open.attributes.properties.find(
        (property) => ts.isJsxSpreadAttribute(property) && /fieldControlAria\([^)]*\berror\b/s.test(property.expression.getText()),
      )
      if (ariaSpread !== undefined) {
        const className = attr(open, 'className')?.initializer?.getText() ?? ''
        if (!className.includes('fieldErrorClass(') && !/\bred-\d/.test(className)) {
          problems.push(`${relative(ROOT, file)}:${source.getLineAndCharacterOfPosition(open.getStart()).line + 1}`)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return problems
}

describe('ช่องที่ใช้ fieldControlAria({ error }) มีกรอบแดงเมื่อผิด', () => {
  it('ตัวสแกนจับได้จริง', () => {
    const problems = scanErrorBorder(
      join(ROOT, 'components', 'fixture.tsx'),
      `const a = (
        <>
          <button {...fieldControlAria(id, { error: e })} className="border-slate-300" />
          <button {...fieldControlAria(id, { error: e })} className={cn('border-slate-300', fieldErrorClass(e))} />
          <input {...fieldControlAria(id, { error: e })} className={cn('x', bad ? 'border-red-400' : 'border-slate-300')} />
          <input {...fieldControlAria(id, { hasHint: true })} className="block" />
        </>
      )`,
    )
    expect(problems.map((problem) => problem.split(':')[1])).toEqual(['3'])
  })

  it('ทุกจุดในระบบ', () => {
    const problems = [...sourceFiles(join(ROOT, 'components')), ...sourceFiles(join(ROOT, 'app'))].flatMap((file) => {
      const text = readFileSync(file, 'utf8')
      return text.includes('fieldControlAria(') ? scanErrorBorder(file, text) : []
    })
    expect(problems).toEqual([])
  })
})

/**
 * กันถดถอย — `<Field required>` (มี * ที่ label) ที่ห่อช่อง native `<input>`/`<select>`/`<textarea>` (ไม่ผ่าน UI Kit ที่ได้
 * `aria-required` จาก Field เอง) ต้องบอกโปรแกรมอ่านจอว่าบังคับด้วย: `required` / `aria-required` /
 * `fieldControlAria(id, { required })` — เดิม IMEI/Serial ในฟอร์มรับเข้าคลังมี * แต่ไม่มี aria-required
 */
const NATIVE_FIELD_TAGS = new Set(['input', 'select', 'textarea'])

function isTruthyAttr(element: ts.JsxOpeningLikeElement, name: string): boolean {
  const found = attr(element, name)
  return found !== undefined && attrText(found) !== 'false'
}

/** `fieldControlAria(id, { required: <ไม่ใช่ false> })` — อ่านอาร์กิวเมนต์ที่ 2 ด้วย AST (ไม่ใช้ regex) */
function passesRequiredOption(expression: ts.Expression): boolean {
  if (!ts.isCallExpression(expression) || expression.expression.getText() !== 'fieldControlAria') return false
  const options = expression.arguments[1]
  if (options === undefined || !ts.isObjectLiteralExpression(options)) return false
  return options.properties.some((property) => {
    if (ts.isShorthandPropertyAssignment(property)) return property.name.getText() === 'required'
    return (
      ts.isPropertyAssignment(property) &&
      property.name.getText() === 'required' &&
      property.initializer.kind !== ts.SyntaxKind.FalseKeyword
    )
  })
}

function scanRequiredNative(file: string, text: string): string[] {
  const problems: string[] = []
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const visit = (node: ts.Node): void => {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText() === 'Field') {
      const requiredAttr = attr(node.openingElement, 'required')
      const fieldId = attr(node.openingElement, 'id')
      const want = fieldId === undefined ? undefined : attrText(fieldId)
      if (requiredAttr !== undefined && attrText(requiredAttr) !== 'false' && want !== undefined) {
        const check = (child: ts.Node): void => {
          const open = ts.isJsxElement(child) ? child.openingElement : ts.isJsxSelfClosingElement(child) ? child : null
          if (open !== null && NATIVE_FIELD_TAGS.has(open.tagName.getText())) {
            const idAttr = attr(open, 'id')
            if (idAttr !== undefined && attrText(idAttr) === want) {
              const announced =
                isTruthyAttr(open, 'required') ||
                isTruthyAttr(open, 'aria-required') ||
                open.attributes.properties.some(
                  (property) => ts.isJsxSpreadAttribute(property) && passesRequiredOption(property.expression),
                )
              if (!announced) problems.push(`${relative(ROOT, file)}:${source.getLineAndCharacterOfPosition(open.getStart()).line + 1}`)
            }
          }
          ts.forEachChild(child, check)
        }
        node.children.forEach(check)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return problems
}

describe('<Field required> ที่ห่อช่อง native ส่ง aria-required', () => {
  it('ตัวสแกนจับได้จริง', () => {
    const problems = scanRequiredNative(
      join(ROOT, 'components', 'fixture.tsx'),
      `const a = (
        <>
          <Field id="a" label="ก" required><input id="a" {...fieldControlAria('a', { error: e })} /></Field>
          <Field id="b" label="ข" required={need}><input id="b" {...fieldControlAria('b', { error: e, required: need })} /></Field>
          <Field id="c" label="ค" required><input id="c" required /></Field>
          <Field id="d" label="ง"><input id="d" /></Field>
          <Field id="e" label="จ" required><Input id="e" /></Field>
          <Field id="f" label="ฉ" required><button id="f" type="button" /></Field>
          <Field id="g" label="ช" required={false}><input id="g" /></Field>
          <Field id="h" label="ซ" required><input id="h" {...fieldControlAria(f('h'), { required: false })} /></Field>
          <Field id="i" label="ฌ" required><input id="i" aria-required={false} /></Field>
          <Field id="j" label="ญ" required><input id="j" {...fieldControlAria(f('j'), { error: g(e), required })} /></Field>
        </>
      )`,
    )
    expect(problems.map((problem) => problem.split(':')[1])).toEqual(['3', '10', '11'])
  })

  it('ทุกจุดในระบบ', () => {
    const problems = [...sourceFiles(join(ROOT, 'components')), ...sourceFiles(join(ROOT, 'app'))].flatMap((file) => {
      const text = readFileSync(file, 'utf8')
      return text.includes('<Field') ? scanRequiredNative(file, text) : []
    })
    expect(problems).toEqual([])
  })
})

/**
 * กันถดถอย mytester6 SV6-02 — ช่องกรอกที่**ไม่ได้อยู่ใน `<Field>`/`<label>`** ต้องมีชื่อให้โปรแกรมอ่านจอ:
 * `aria-label` / `aria-labelledby` / `id` (ผูกกับ label ภายนอก เช่น component ห่อที่รับ id จาก `<Field id>` ของผู้เรียก) /
 * spread props (component ห่อ) — เดิมช่อง "บันทึกเพิ่มเติม" ในฟอร์มปิดงานใช้หัวข้อ `<SectionTitle>` แยก ไม่มี `<Field>`
 * ตัวสแกนข้อ 1–4 ตรวจเฉพาะสิ่งที่อยู่ใน `<Field>` จึงไม่เห็น ⇒ เหลือชื่อจาก placeholder อย่างเดียว
 * (ช่อง `type="hidden"`/`type="file"` ไม่นับ — ไฟล์เลือกผ่านปุ่มที่มีชื่อของตัวเอง)
 */
const NAMED_CONTROL_TAGS = new Set(['Input', 'MoneyInput', 'NumericInput', 'Select', 'Textarea', 'input', 'select', 'textarea'])

function scanUnnamedControls(file: string, text: string): string[] {
  const problems: string[] = []
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const visit = (node: ts.Node, labelled: boolean): void => {
    let inside = labelled
    if (ts.isJsxElement(node)) {
      const tag = node.openingElement.tagName.getText()
      if (tag === 'Field' || tag === 'label') inside = true
    }
    const open = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null
    if (open !== null && !inside && NAMED_CONTROL_TAGS.has(open.tagName.getText())) {
      const typeAttr = attr(open, 'type')
      const type = typeAttr === undefined ? undefined : attrText(typeAttr)
      const named =
        ['aria-label', 'aria-labelledby', 'id'].some((name) => attr(open, name) !== undefined) ||
        open.attributes.properties.some((property) => ts.isJsxSpreadAttribute(property))
      if (type !== '"hidden"' && type !== '"file"' && !named) {
        problems.push(`${relative(ROOT, file)}:${source.getLineAndCharacterOfPosition(open.getStart()).line + 1}`)
      }
    }
    ts.forEachChild(node, (child) => visit(child, inside))
  }
  visit(source, false)
  return problems
}

describe('ช่องกรอกนอก <Field> มีชื่อให้โปรแกรมอ่านจอ (mytester6 SV6-02)', () => {
  it('ตัวสแกนจับได้จริง', () => {
    const problems = scanUnnamedControls(
      join(ROOT, 'components', 'fixture.tsx'),
      `const a = (
        <>
          <Textarea rows={2} placeholder="แค่ placeholder" />
          <Field id={noteId} label="บันทึก"><Textarea id={noteId} /></Field>
          <Textarea aria-label="อธิบาย" />
          <label>ค้นหา <input type="text" /></label>
          <input type="file" className="hidden" />
          <Select id={id} />
          <input {...props} />
          <select value={v} onChange={f} />
        </>
      )`,
    )
    expect(problems.map((problem) => problem.split(':')[1])).toEqual(['3', '10'])
  })

  it('ทุกจุดในระบบ', () => {
    const problems = [...sourceFiles(join(ROOT, 'components')), ...sourceFiles(join(ROOT, 'app'))].flatMap((file) =>
      scanUnnamedControls(file, readFileSync(file, 'utf8')),
    )
    expect(problems).toEqual([])
  })
})
