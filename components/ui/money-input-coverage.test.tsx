import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { Field, MoneyInput } from '@/components/ui'

/**
 * กันถดถอย มติผู้ใช้ 15/10/2569 "ช่องยอดเงินรับเฉพาะตัวเลข" — สแกน source (AST) ของ `components/` + `app/`:
 * ช่องพิมพ์ (`<Input>`/`<input>`) ที่ดูเป็นช่องเงิน ต้องใช้ `<MoneyInput>` แทน
 *
 * ถือเป็นช่องเงินเมื่อ (heuristic):
 * - `inputMode="decimal"` (ช่องทศนิยม — นอกจากเงินคือ % ซึ่งอยู่ใน allowlist), หรือ
 * - id/name/aria-label/value/label ของ `<Field>` ที่ห่อ มีคำว่า ยอด/จำนวนเงิน/บาท/ราคา หรือชื่อลงท้าย Satang/Baht/amount, หรือ
 * - `value` ของช่องเป็นค่าที่ไฟล์เดียวกันส่งเข้าตัวแปลงเงิน (`parseBahtInput(x)`/`bahtInputError(x)`/`satangOf(x)` ฯลฯ) —
 *   จับช่องเงินที่ label ไม่มีคำข้างบน (เช่น "ค่าธรรมเนียม", "เพดาน")
 */
const ROOT = join(__dirname, '..', '..')
const NON_TEXT_TYPES = new Set(['checkbox', 'radio', 'file', 'date', 'hidden', 'time', 'datetime-local', 'month', 'password', 'email'])
// `(?<!บท)บาท` ⇒ ไม่นับ "บทบาท" (ชื่อบทบาทในหน้าสิทธิ์)
const MONEY_WORDS = /ยอด|จำนวนเงิน|(?<!บท)บาท|ราคา|satang|baht|amount/i

/** ช่องที่ตรง heuristic แต่ไม่ใช่ช่องเงิน — `ไฟล์:id หรือ value` → เหตุผล */
const ALLOWLIST: Record<string, string> = {
  'components/compensation/compensation-plan-form-modal.tsx:form.whtPct': 'อัตรา % (NUMERIC(5,2)) ไม่ใช่ยอดเงิน',
  'components/finance-companies/company-form-modal.tsx:form.whtWithheldByCustomerPct': 'อัตรา % ไม่ใช่ยอดเงิน',
  'components/payees/payee-fields-section.tsx:form.wht402Pct': 'อัตรา % ไม่ใช่ยอดเงิน',
  'components/service-fee/service-fee-form-modal.tsx:form.ratePct': 'อัตรา % ไม่ใช่ยอดเงิน',
  'components/settings/tax-profiles-tab.tsx:form.whtPct': 'อัตรา % ไม่ใช่ยอดเงิน',
  'components/settings/vat-rates-tab.tsx:form.ratePct': 'อัตรา VAT % ไม่ใช่ยอดเงิน',
  'components/field/hotel-claim-modal.tsx:nightsText': 'จำนวนคืน (จำนวนเต็ม) อยู่ในกล่องค่าที่พักแต่ไม่ใช่ยอดเงิน',
  'components/field/resubmit-expense-modal.tsx:nightsText': 'จำนวนคืน (จำนวนเต็ม) ไม่ใช่ยอดเงิน',
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') sourceFiles(path, out)
    } else if (entry.name.endsWith('.tsx') && !entry.name.includes('.test.')) {
      out.push(path)
    }
  }
  return out
}

function attrValue(element: ts.JsxOpeningLikeElement, name: string): string | undefined {
  const attribute = element.attributes.properties.find(
    (property): property is ts.JsxAttribute => ts.isJsxAttribute(property) && property.name.getText() === name,
  )
  const init = attribute?.initializer
  if (attribute === undefined) return undefined
  if (init === undefined) return 'true'
  if (ts.isStringLiteral(init)) return init.text
  return ts.isJsxExpression(init) ? (init.expression?.getText() ?? '') : init.getText()
}

/** label ของ `<Field>` ที่ห่อช่องนี้ (ใกล้สุด) */
function enclosingFieldLabel(element: ts.Node): string {
  for (let node = element.parent; node !== undefined; node = node.parent) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText() === 'Field') {
      return attrValue(node.openingElement, 'label') ?? ''
    }
  }
  return ''
}

/** ตัวแปลงข้อความบาท → สตางค์ (ค่าที่ส่งเข้า = ข้อความในช่องเงิน) */
const BAHT_CONVERTERS = new Set(['parseBahtInput', 'bahtInputError', 'hasExcessBahtDecimals', 'satangOf', 'satangFromInput'])

/** ข้อความ expression ที่ไฟล์นี้ส่งเข้าตัวแปลงเงิน (อาร์กิวเมนต์แรก) */
function convertedExpressions(source: ts.SourceFile): string[] {
  const found: string[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && BAHT_CONVERTERS.has(node.expression.getText()) && node.arguments[0] !== undefined) {
      found.push(node.arguments[0].getText())
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** `value` ของช่องอ้างถึงค่าที่ถูกส่งเข้าตัวแปลงเงิน (ทั้งคำ — `form.base` ไม่นับ `form.baseX`) */
function feedsConverter(value: string, converted: string[]): boolean {
  return converted.some((expr) => new RegExp(`(^|[^\\w.$])${escapeRegExp(expr)}($|[^\\w$])`).test(value))
}

function scanSource(file: string, text: string): string[] {
  const problems: string[] = []
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const rel = relative(ROOT, file)
  const converted = convertedExpressions(source)
  const visit = (node: ts.Node): void => {
    const open = ts.isJsxSelfClosingElement(node) ? node : ts.isJsxElement(node) ? node.openingElement : null
    if (open !== null && ['Input', 'input'].includes(open.tagName.getText()) && rel !== 'components/ui/money-input.tsx' && rel !== 'components/ui/input.tsx') {
      const type = attrValue(open, 'type') ?? 'text'
      if (!NON_TEXT_TYPES.has(type)) {
        const words = ['id', 'name', 'aria-label', 'value'].map((name) => attrValue(open, name) ?? '').join(' ')
        const looksMoney =
          attrValue(open, 'inputMode') === 'decimal' ||
          MONEY_WORDS.test(`${words} ${enclosingFieldLabel(open)}`) ||
          feedsConverter(attrValue(open, 'value') ?? '', converted)
        const key = `${rel}:${attrValue(open, 'value') ?? attrValue(open, 'id') ?? ''}`
        if (looksMoney && ALLOWLIST[key] === undefined) {
          problems.push(`${rel}:${source.getLineAndCharacterOfPosition(open.getStart()).line + 1} (${key})`)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return problems
}

describe('ช่องเงินทุกช่องใช้ <MoneyInput> (มติผู้ใช้ 15/10/2569)', () => {
  const files = [...sourceFiles(join(ROOT, 'components')), ...sourceFiles(join(ROOT, 'app'))]

  it('ไม่มี <Input>/<input> ที่ดูเป็นช่องเงินหลงเหลือ (นอก allowlist)', () => {
    const problems = files.flatMap((file) => scanSource(file, readFileSync(file, 'utf8')))
    expect(problems).toEqual([])
  })

  it('allowlist ทุกรายการยังมีอยู่จริง (ลบเมื่อช่องหายไป)', () => {
    const present = new Set<string>()
    for (const file of files) {
      const rel = relative(ROOT, file)
      const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
      const visit = (node: ts.Node): void => {
        const open = ts.isJsxSelfClosingElement(node) ? node : ts.isJsxElement(node) ? node.openingElement : null
        if (open !== null && ['Input', 'input'].includes(open.tagName.getText())) {
          present.add(`${rel}:${attrValue(open, 'value') ?? attrValue(open, 'id') ?? ''}`)
        }
        ts.forEachChild(node, visit)
      }
      visit(source)
    }
    expect(Object.keys(ALLOWLIST).filter((key) => !present.has(key))).toEqual([])
  })

  it('heuristic จับช่องเงินที่ยังเป็น <Input> ได้จริง', () => {
    const sample = `
      export const A = () => <Field id="x" label="ยอดเงิน (บาท)"><Input id="x" value={a} onChange={f} /></Field>
      export const B = () => <Input inputMode="decimal" value={b} onChange={f} />
      export const C = () => <Input id="amountSatang" value={c} onChange={f} />
      export const D = () => <Field id="n" label="ชื่อ"><Input id="n" value={name} onChange={f} /></Field>
      export const E = () => <MoneyInput id="m" value={m} onChange={f} />
      const fee = parseBahtInput(form.fee)
      export const F = () => <Field id="fee" label="ค่าธรรมเนียม"><Input id="fee" value={form.fee} onChange={f} /></Field>
      export const G = () => <Field id="fx" label="อื่น ๆ"><Input id="fx" value={form.feeNote} onChange={f} /></Field>`
    expect(scanSource(join(ROOT, 'components/sample.tsx'), sample)).toHaveLength(4)
  })
})

describe('<MoneyInput> render', () => {
  it('type=text + inputmode=decimal (มือถือขึ้นแป้นตัวเลข) + ชิดขวา font-mono', () => {
    const html = renderToStaticMarkup(<MoneyInput id="m" value="12.50" onChange={() => undefined} />)
    expect(html).toContain('type="text"')
    expect(html).toContain('inputMode="decimal"')
    expect(html).toContain('text-right')
    expect(html).toContain('value="12.50"')
  })

  it('ผูก <Field id> ได้เหมือน <Input> — aria-invalid/aria-describedby/aria-required', () => {
    const html = renderToStaticMarkup(
      <Field id="amt" label="ยอดเงิน (บาท)" required error="กรุณาระบุยอดเงิน">
        <MoneyInput id="amt" value="" onChange={() => undefined} />
      </Field>,
    )
    expect(html).toContain('for="amt"')
    expect(html).toContain('aria-invalid="true"')
    expect(html).toContain('aria-describedby="amt-error"')
    expect(html).toContain('aria-required="true"')
  })
})
