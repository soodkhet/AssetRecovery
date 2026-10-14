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
 */
const ROOT = join(__dirname, '..', '..')
const CONTROL_TAGS = new Set(['Input', 'Select', 'Textarea', 'StagedFileInput', 'input', 'select', 'textarea', 'button'])

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
      if (fieldId === undefined) {
        if (tags.some((tag) => CONTROL_TAGS.has(tag))) problems.push({ at, issue: '<Field> ห่อช่องกรอกแต่ไม่มี id' })
      } else {
        const want = attrText(fieldId)
        const target = want === undefined ? undefined : ids.get(want)
        if (target === undefined) problems.push({ at, issue: `<Field id=${want}> ไม่มีช่องข้างในที่ id ตรงกัน` })
        // id อยู่บนกล่อง/ข้อความ (div/p) ⇒ label `for` ผูกไม่ได้ ต้องเป็น `<Field group>` (กล่องตั้งชื่อด้วย aria-labelledby)
        else if (/^[a-z]/.test(target) && !CONTROL_TAGS.has(target) && attr(node.openingElement, 'group') === undefined)
          problems.push({ at, issue: `<Field id=${want}> ชี้ <${target}> ต้องใส่ group` })
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
  it('ตัวสแกนจับได้จริง: ไม่มี id / id ไม่ตรง / id บนกล่องไม่ใส่ group · multi-line / แสดงค่าอย่างเดียว / group ผ่าน', () => {
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
        </>
      )`,
    )
    expect(problems.map((problem) => problem.at.split(':')[1])).toEqual(['3', '4', '14', '15'])
  })

  it('ทุก <Field> ที่มีช่องกรอกมี id และ id ตรงกับช่องข้างใน', () => {
    expect(scan()).toEqual([])
  })
})
