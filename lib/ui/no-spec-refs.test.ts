import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * Rule 05 (มติ PO 03/10/2569) + BUG-174 — ข้อความที่ผู้ใช้เห็นห้ามมีเลขอ้างอิงสเปค
 *
 * สแกน **ข้อความใน JSX + string literal** ของหน้าจอ (`app/`, `components/`) และ `MESSAGES` ใน `lib/**\/errors.ts`
 * ด้วย TypeScript AST ⇒ comment ไม่ถูกนับ (อ้างอิงสเปคให้อยู่ใน comment ได้ตามกติกา)
 * · ค่าของ property metadata ที่ไม่ render (`source`/`section`/`note`/`sourceFile`) ข้ามได้
 */

const ROOT = process.cwd()
const SPEC_REF = /§\s*\d|มติ\s*PO|DEC-\d{3}|[(·]\s*D\d{1,2}\s*\)|ไฟล์\s*\d{2}\b(?!\s*[–-]\s*\d)/
const METADATA_KEYS = new Set(['source', 'section', 'note', 'sourceFile'])

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

function isMetadataValue(node: ts.Node): boolean {
  const parent = node.parent
  return parent !== undefined && ts.isPropertyAssignment(parent) && METADATA_KEYS.has(parent.name.getText())
}

function findSpecRefs(fileName: string, source: string): string[] {
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind)
  const hits: string[] = []
  const visit = (node: ts.Node): void => {
    let text: string | null = null
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node)) text = node.text
    else if (ts.isTemplateExpression(node))
      text = node.head.text + node.templateSpans.map((span) => span.literal.text).join('')
    const skip =
      node.parent !== undefined &&
      (ts.isImportDeclaration(node.parent) || ts.isExportDeclaration(node.parent) || isMetadataValue(node))
    if (text !== null && !skip && SPEC_REF.test(text)) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart())
      hits.push(`${path.relative(ROOT, fileName)}:${line + 1} ${text.replace(/\s+/g, ' ').trim().slice(0, 80)}`)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return hits
}

describe('ข้อความบนหน้าจอไม่มีเลขอ้างอิงสเปค (Rule 05 · BUG-174)', () => {
  it('ตัวตรวจจับแยก comment ออกจากข้อความจริง (sanity)', () => {
    const sample = [
      '// มติ PO 15/08/2569 · D18 — comment ได้',
      'const a = <p>ใช้กับรายงานเท่านั้น (มติ PO 15/08/2569 · D18)</p>',
      'const b = <Badge>ไฟล์ 28</Badge>',
      "const c = { source: 'ไฟล์ 28 §6.1' }",
      'const d = <p>ชุดไฟล์ 00–16 ต้องครบ</p>',
    ].join('\n')
    const hits = findSpecRefs('sample.tsx', sample)
    expect(hits).toHaveLength(2)
    expect(hits[0]).toContain(':2 ')
    expect(hits[1]).toContain(':3 ')
  })

  it('หน้าจอ (app/ + components/) และ MESSAGES ของ errors.ts ไม่มีเลขอ้างอิงสเปค', () => {
    const notTest = (file: string): boolean => !/\.test\.tsx?$/.test(file)
    const files = [
      ...walk(path.join(ROOT, 'app'), (f) => /\.tsx$/.test(f) && notTest(f)),
      ...walk(path.join(ROOT, 'components'), (f) => /\.tsx$/.test(f) && notTest(f)),
      ...walk(path.join(ROOT, 'lib'), (f) => /[\\/]errors\.ts$/.test(f)),
    ]
    expect(files.length).toBeGreaterThan(50)
    const hits = files.flatMap((file) => findSpecRefs(file, readFileSync(file, 'utf8')))
    expect(hits).toEqual([])
  })

  it('ตารางแท็บตั้งค่าไม่แสดงคอลัมน์ "สเปคต้นทาง" (BUG-174)', () => {
    for (const file of ['components/settings/internal-documents-tab.tsx', 'components/settings/export-formats-tab.tsx']) {
      const source = readFileSync(path.join(ROOT, file), 'utf8')
      expect(source).not.toContain('สเปคต้นทาง')
      expect(source).not.toMatch(/\{item\.sourceFile\}/)
    }
  })
})
