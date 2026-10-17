import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * กันถดถอย mytester6 T-007 — แท็บตั้งค่าที่มีฟอร์มแก้ค่า **วางบนหน้า (ไม่อยู่ในโมดัล)** และซ่อนปุ่มบันทึกด้วย
 * `<Can action="manage">` ⇒ ช่องกรอกทุกช่องนอกโมดัลต้องมี `disabled` (ผู้ดูอย่างเดียว เช่น บริหาร
 * จะได้ไม่พิมพ์/ติ๊กค่าแล้วสับสนว่าบันทึกหรือยัง)
 *
 * สแกน AST ของ `components/settings/*.tsx` — ช่องกรอกที่ผูก `onChange` กับ state ของฟอร์ม (`set(…)` /
 * `setBucket(…)`) และไม่อยู่ใต้ element ที่ชื่อลงท้ายด้วย `Modal` ต้องมี attribute `disabled`
 */
const DIR = __dirname
const CONTROL_TAGS = new Set(['Input', 'MoneyInput', 'NumericInput', 'Select', 'Textarea', 'input', 'select', 'textarea'])
const FORM_SETTER = /^\(event\) => (set|setBucket)\(/

function tagName(node: ts.JsxOpeningLikeElement): string {
  return node.tagName.getText()
}

function attr(element: ts.JsxOpeningLikeElement, name: string): ts.JsxAttribute | undefined {
  return element.attributes.properties.find(
    (property): property is ts.JsxAttribute => ts.isJsxAttribute(property) && property.name.getText() === name,
  )
}

function violations(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  if (!source.includes('<Can action="manage"')) return []
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const found: string[] = []

  function visit(node: ts.Node, insideModal: boolean): void {
    let modal = insideModal
    if (ts.isJsxElement(node) && /Modal$/.test(tagName(node.openingElement))) modal = true
    if (ts.isJsxSelfClosingElement(node) && /Modal$/.test(tagName(node))) modal = true
    const opening = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : undefined
    if (opening !== undefined && !modal && CONTROL_TAGS.has(tagName(opening))) {
      const init = attr(opening, 'onChange')?.initializer
      const handler = init !== undefined && ts.isJsxExpression(init) ? (init.expression?.getText() ?? '') : ''
      if (FORM_SETTER.test(handler) && attr(opening, 'disabled') === undefined) {
        const { line } = sf.getLineAndCharacterOfPosition(opening.getStart())
        found.push(`${file.split('/').pop() ?? file}:${line + 1} <${tagName(opening)}>`)
      }
    }
    ts.forEachChild(node, (child) => visit(child, modal))
  }
  visit(sf, false)
  return found
}

describe('ฟอร์มตั้งค่าบนหน้า — ผู้ดูอย่างเดียวแก้ช่องไม่ได้ (mytester6 T-007)', () => {
  it('ช่องกรอกนอกโมดัลในแท็บที่ซ่อนปุ่มบันทึกด้วย <Can manage> ต้องมี disabled', () => {
    const files = readdirSync(DIR)
      .filter((name) => name.endsWith('.tsx') && !name.endsWith('.test.tsx'))
      .map((name) => join(DIR, name))
    expect(files.flatMap(violations)).toEqual([])
  })

  it('แท็บเกณฑ์ SLA / นโยบายการมอบหมายงาน ถูกสแกนจริง (กันตัวสแกนหลุดเงียบ)', () => {
    for (const name of ['sla-policy-tab.tsx', 'assignment-policy-tab.tsx']) {
      const source = readFileSync(join(DIR, name), 'utf8')
      expect(source).toContain('<Can action="manage"')
      expect(source).toContain('disabled={readOnly}')
    }
  })
})
