import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * Rule 05 — ข้อความที่ผู้ใช้เห็นต้องเป็นภาษาไทย ไม่มีรหัส/ศัพท์ระบบ (mytester รอบ 2: A2-01 · B2-02 · G2-01 · J2-02)
 *
 * สแกน **string literal + ข้อความ JSX** ด้วย TypeScript AST (comment ไม่นับ) ของ `app/` `components/` `lib/`
 * แล้วห้ามมีวลีที่เคยหลุดขึ้นจอ — กันไม่ให้กลับมาอีก · code identifier/คอมเมนต์ใช้ศัพท์อังกฤษได้ตามเดิม
 */

const ROOT = process.cwd()

/**
 * วลีต้องห้ามบนหน้าจอ — `issue` = ที่มาของรายการ · `inThaiText` = นับเฉพาะข้อความที่มีอักษรไทยปน
 * (ศัพท์อย่าง `statement`/`snapshot` เป็นชื่อ id/enum/path ได้ — ข้อความภาษาไทยที่ผู้ใช้อ่านเท่านั้นที่ห้าม)
 */
const BANNED: readonly { phrase: RegExp; issue: string; inThaiText?: boolean }[] = [
  { phrase: /แก้ mapping/, issue: 'B2-02' },
  { phrase: /^(Case Ref|Model|VAT Flag|Policy)$/, issue: 'G2-01' },
  { phrase: /source record|sync 1:1|statement|tolerance|snapshot/, issue: 'G2-01', inThaiText: true },
  { phrase: /รอ retry|3 model|commission =|\(Claim\)|map Cost Center/, issue: 'J2-02' },
  { phrase: /รอบ (collecting|locked)|\(collecting → sent\)|ที่ locked|mark filed|map Cost Center \(manual\)|resolve\)/, issue: 'A2-01' },
]

/**
 * ไฟล์ที่ข้อความไม่ขึ้นจอผู้ใช้ทั่วไป — ทะเบียน event (คำอธิบายสำหรับนักพัฒนา มีเลขอ้างอิงสเปคปนอยู่แล้ว)
 * · เหตุผล audit ที่ระบบเขียนเองตอนอนุมัติเคส (ซ่อนจากไทม์ไลน์ และ DB test ตรึงถ้อยคำไว้ — ข้อมูลเก่าใช้ถ้อยคำเดิม)
 */
const NOT_ON_SCREEN = new Set(['lib/api/events.ts', 'lib/notifications/events.ts', 'lib/cases/status-queries.ts'])

function walk(dir: string, filter: (file: string) => boolean, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'generated') continue
      walk(full, filter, out)
    } else if (filter(full)) out.push(full)
  }
  return out
}

function literalTexts(fileName: string, source: string): { line: number; text: string }[] {
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind)
  const out: { line: number; text: string }[] = []
  const visit = (node: ts.Node): void => {
    let text: string | null = null
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node)) text = node.text
    else if (ts.isTemplateExpression(node))
      text = node.head.text + node.templateSpans.map((span) => span.literal.text).join('')
    if (text !== null) out.push({ line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, text })
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

describe('ข้อความบนหน้าจอไม่มีศัพท์ระบบ/อังกฤษที่เคยหลุด (Rule 05 · mytester รอบ 2)', () => {
  it('ตัวตรวจจับไม่นับ comment (sanity)', () => {
    const texts = literalTexts('sample.tsx', '// แก้ mapping ใน comment ได้\nconst a = <p>ย้อนกลับไปแก้ mapping</p>')
    expect(texts.filter((t) => /แก้ mapping/.test(t.text)).map((t) => t.line)).toEqual([2])
  })

  it.each(BANNED)('ไม่มี $phrase ($issue)', ({ phrase, inThaiText }) => {
    const files = ['app', 'components', 'lib'].flatMap((dir) =>
      walk(path.join(ROOT, dir), (f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && !NOT_ON_SCREEN.has(path.relative(ROOT, f))),
    )
    expect(files.length).toBeGreaterThan(100)
    const hits = files.flatMap((file) =>
      literalTexts(file, readFileSync(file, 'utf8'))
        .filter(({ text }) => phrase.test(text) && (inThaiText !== true || /[ก-๙]/.test(text)))
        .map(({ line, text }) => `${path.relative(ROOT, file)}:${line} ${text.replace(/\s+/g, ' ').trim().slice(0, 80)}`),
    )
    expect(hits).toEqual([])
  })
})
