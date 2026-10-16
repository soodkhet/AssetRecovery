import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { Field, MoneyInput, NumericInput } from '@/components/ui'

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
const ALLOWLIST: Record<string, string> = {}

/**
 * มติผู้ใช้ 15/10/2569 (รอบ 2) "ช่องตัวเลขที่ไม่ใช่เงินรับเฉพาะตัวเลข" — ช่องพิมพ์ที่ดูเป็นช่องตัวเลขต้องใช้ `<NumericInput>`
 * (หรือ `<MoneyInput>`) — ถือเป็นช่องตัวเลขเมื่อ `inputMode` numeric/decimal, `type` number/tel หรือ id/name/aria-label/label
 * ของ `<Field>` มีคำในชุดนี้ (ช่องค้นหาที่ aria-label ขึ้นต้น "ค้นหา" ไม่นับ — เป็นข้อความอิสระ)
 */
const NUMERIC_WORDS = /%|จำนวน|ชั่วโมง|\(วัน|วัน\)|ช่วงวัน|\(ปี|ปีที่ออก|ปีล่าสุด|ผู้เสียภาษี|บัตรประชาชน|เลขบัญชี|เลขที่บัญชี|เบอร์|โทร|ไปรษณีย์|เลขที่สาขา|(?<![a-z])tac(?![a-z])|ลำดับ|ช่วงอายุหนี้|นาที|เดือน\)|ครั้ง|กม\.|กิโลเมตร\)|ลิตร|phone|postal|tax-?id|branch-no|account-number|years|days|hours/i
const NUMERIC_TYPES = new Set(['number', 'tel'])

/** ช่องที่ตรง heuristic ช่องตัวเลขแต่ตั้งใจไม่ใช้ `<NumericInput>` — `ไฟล์:value หรือ id` → เหตุผล */
const NUMERIC_ALLOWLIST: Record<string, string> = {
  'components/warehouse/intake-modal.tsx:imeiActual': 'IMEI — กติกาเฉพาะ (Rule 10: ตัดได้แค่ช่องว่าง/ขีด/จุด ต้องเหลือ 15 หลักพอดี ผ่าน parseImei จุดเดียว)',
  'components/warehouse/reject-intake-modal.tsx:imeiActual': 'IMEI — กติกาเฉพาะ (Rule 10 · parseImei)',
  'components/settings/organization-profile-tab.tsx:form.phone': 'เบอร์สำนักงานรับเบอร์ต่อ "ต่อ 12"/"ext. 12"/"#12" ตาม isThaiPhone — ไม่ใช่ตัวเลขล้วน',
  'components/finance-companies/company-form-modal.tsx:form.phone': 'เบอร์สำนักงานบริษัทไฟแนนซ์รับเบอร์ต่อตาม isThaiPhone (มติผู้ใช้ 16/10/2569 แบบ ก) — ไม่ใช่ตัวเลขล้วน',
  'components/finance-companies/company-form-modal.tsx:form.contactPhone': 'เบอร์ผู้ติดต่อบริษัทไฟแนนซ์รับเบอร์ต่อตาม isThaiPhone (มติผู้ใช้ 16/10/2569 แบบ ก) — ไม่ใช่ตัวเลขล้วน',
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

const SCANNED_TAGS = ['Input', 'input', 'NumericInput']
/** ตัว UI Kit เอง (ห่อ `<input>`) ไม่สแกน */
const UI_KIT_FILES = new Set(['components/ui/money-input.tsx', 'components/ui/numeric-input.tsx', 'components/ui/input.tsx'])

function jsxOpening(node: ts.Node): ts.JsxOpeningLikeElement | null {
  return ts.isJsxSelfClosingElement(node) ? node : ts.isJsxElement(node) ? node.openingElement : null
}

function inputKey(rel: string, open: ts.JsxOpeningLikeElement): string {
  return `${rel}:${attrValue(open, 'value') ?? attrValue(open, 'id') ?? ''}`
}

function scanSource(file: string, text: string): string[] {
  const problems: string[] = []
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const rel = relative(ROOT, file)
  const converted = convertedExpressions(source)
  const visit = (node: ts.Node): void => {
    const open = ts.isJsxSelfClosingElement(node) ? node : ts.isJsxElement(node) ? node.openingElement : null
    // `<NumericInput>` ก็ต้องไม่ใช่ช่องเงิน (ช่องเงินต้องเป็น `<MoneyInput>`)
    if (open !== null && SCANNED_TAGS.includes(open.tagName.getText()) && !UI_KIT_FILES.has(rel)) {
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

/** ช่องพิมพ์ (`<Input>`/`<input>`) ที่ดูเป็นช่องตัวเลข แต่ยังไม่ใช้ `<NumericInput>`/`<MoneyInput>` (นอก allowlist) */
function scanNumericSource(file: string, text: string): string[] {
  const problems: string[] = []
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const rel = relative(ROOT, file)
  const visit = (node: ts.Node): void => {
    const open = jsxOpening(node)
    if (open !== null && ['Input', 'input'].includes(open.tagName.getText()) && !UI_KIT_FILES.has(rel)) {
      const type = attrValue(open, 'type') ?? 'text'
      const ariaLabel = attrValue(open, 'aria-label') ?? ''
      const searchBox = /^`?ค้นหา/.test(ariaLabel)
      if (!NON_TEXT_TYPES.has(type) && !searchBox) {
        const words = ['id', 'name', 'aria-label'].map((name) => attrValue(open, name) ?? '').join(' ')
        const inputMode = attrValue(open, 'inputMode')
        const looksNumeric =
          inputMode === 'numeric' ||
          inputMode === 'decimal' ||
          NUMERIC_TYPES.has(type) ||
          NUMERIC_WORDS.test(`${words} ${enclosingFieldLabel(open)}`)
        const key = inputKey(rel, open)
        if (looksNumeric && NUMERIC_ALLOWLIST[key] === undefined) {
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
        const open = jsxOpening(node)
        if (open !== null && ['Input', 'input'].includes(open.tagName.getText())) present.add(inputKey(rel, open))
        ts.forEachChild(node, visit)
      }
      visit(source)
    }
    expect([...Object.keys(ALLOWLIST), ...Object.keys(NUMERIC_ALLOWLIST)].filter((key) => !present.has(key))).toEqual([])
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

  it('<NumericInput> ที่เป็นช่องเงิน ⇒ ต้องเป็น <MoneyInput>', () => {
    const sample = `export const A = () => <Field id="x" label="ยอดเงิน (บาท)"><NumericInput kind="decimal" id="x" value={a} onChange={f} /></Field>`
    expect(scanSource(join(ROOT, 'components/sample.tsx'), sample)).toHaveLength(1)
  })
})

describe('ช่องตัวเลขที่ไม่ใช่เงินใช้ <NumericInput> (มติผู้ใช้ 15/10/2569)', () => {
  const files = [...sourceFiles(join(ROOT, 'components')), ...sourceFiles(join(ROOT, 'app'))]

  it('ไม่มี <Input>/<input> ที่ดูเป็นช่องตัวเลขหลงเหลือ (นอก allowlist)', () => {
    const problems = files.flatMap((file) => scanNumericSource(file, readFileSync(file, 'utf8')))
    expect(problems).toEqual([])
  })

  it('heuristic จับช่องตัวเลขที่ยังเป็น <Input> ได้จริง', () => {
    const sample = `
      export const A = () => <Input inputMode="numeric" value={a} onChange={f} />
      export const B = () => <Input type="number" value={b} onChange={f} />
      export const C = () => <Input type="tel" value={c} onChange={f} />
      export const D = () => <Field id="d" label="อัตรา (%)"><Input id="d" value={d} onChange={f} /></Field>
      export const E = () => <Field id="e" label="เวลา (ชั่วโมง)"><Input id="e" value={e} onChange={f} /></Field>
      export const F = () => <Field id="f" label="เลขประจำตัวผู้เสียภาษี"><Input id="f" value={g} onChange={f} /></Field>
      export const G = () => <Field id="g" label="เลขที่บัญชี"><Input id="g" value={h} onChange={f} /></Field>
      export const H = () => <Field id="h" label="เบอร์โทร"><Input id="h" value={i} onChange={f} /></Field>
      export const I = () => <Field id="i" label="ระยะเก็บ (ปี)"><Input id="i" value={j} onChange={f} /></Field>
      export const J = () => <Field id="j" label="จำนวนคืน"><Input id="j" value={k} onChange={f} /></Field>
      export const K = () => <Field id="k" label="ชื่อ"><Input id="k" value={l} onChange={f} /></Field>
      export const L = () => <Field id="l" label="ชื่อวันหยุด"><Input id="l" value={m} onChange={f} /></Field>
      export const M = () => <Field id="m" label="วันที่"><Input id="m" type="date" value={n} onChange={f} /></Field>
      export const N = () => <Input aria-label="ค้นหาชื่อ เบอร์โทร" value={o} onChange={f} />
      export const O = () => <NumericInput kind="integer" id="o" value={p} onChange={f} />`
    expect(scanNumericSource(join(ROOT, 'components/sample.tsx'), sample)).toHaveLength(10)
  })
})

describe('<NumericInput> render', () => {
  it('integer/digits ⇒ type=text + inputmode=numeric (ไม่ใช่ type=number ที่รับ e/-)', () => {
    const html = renderToStaticMarkup(<NumericInput kind="digits" maxDigits={5} id="b" value="00001" onChange={() => undefined} />)
    expect(html).toContain('type="text"')
    expect(html).toContain('inputMode="numeric"')
    expect(html).toContain('value="00001"')
    expect(html).not.toContain('maxLength')
    expect(html).not.toContain('text-right')
  })

  it('decimal ⇒ inputmode=decimal · numeric ⇒ ชิดขวา', () => {
    const html = renderToStaticMarkup(<NumericInput kind="decimal" numeric id="p" value="3.00" onChange={() => undefined} />)
    expect(html).toContain('inputMode="decimal"')
    expect(html).toContain('text-right')
  })

  it('ผูก <Field id> ได้เหมือน <Input>', () => {
    const html = renderToStaticMarkup(
      <Field id="n" label="จำนวนคืน" required error="ผิด">
        <NumericInput kind="integer" id="n" value="" onChange={() => undefined} />
      </Field>,
    )
    expect(html).toContain('aria-invalid="true"')
    expect(html).toContain('aria-describedby="n-error"')
    expect(html).toContain('aria-required="true"')
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
