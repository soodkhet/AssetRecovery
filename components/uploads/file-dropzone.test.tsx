import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { CaseAttachmentsFields } from '@/components/cases/case-attachments-fields'
import { FileDropzone } from '@/components/uploads/file-dropzone'
import { DOCUMENT_SLOT_LABEL, type DocumentMode } from '@/lib/cases/case'
import { formSlotsFor } from '@/lib/cases/document-upload'

/** ตรวจซ้ำ staging SV5-A11Y-A2-01 — โซนเลือกไฟล์ต้องเป็นปุ่มที่ Tab ถึง มีชื่อ และช่องไฟล์ซ่อนไม่ค้างในลำดับ Tab */
describe('<FileDropzone>', () => {
  it('ทั้งกล่องเป็นปุ่ม (Tab ถึง · Enter/Space เปิด) ชื่อ = title · คำอธิบายผูก describedby · ช่องไฟล์ออกนอกลำดับ Tab', () => {
    const html = renderToStaticMarkup(
      <FileDropzone id="stmt-file" accept=".csv" title="คลิกเพื่อเลือกไฟล์" description="รองรับ CSV" onPick={() => {}} />,
    )
    expect(html).toMatch(/<button[^>]*id="stmt-file"[^>]*type="button"/)
    expect(html).toMatch(/<button[^>]*aria-labelledby="stmt-file-title"/)
    expect(html).toMatch(/<button[^>]*aria-describedby="stmt-file-description"/)
    expect(html).toContain('id="stmt-file-title"')
    expect(html).toContain('id="stmt-file-description"')
    expect(html).toMatch(/<input[^>]*type="file"[^>]*tabindex="-1"[^>]*aria-hidden="true"/)
  })

  it('ไม่มีคำอธิบาย ⇒ ไม่ใส่ aria-describedby ลอย', () => {
    const html = renderToStaticMarkup(<FileDropzone id="f" accept=".csv" title="เลือกไฟล์" onPick={() => {}} />)
    expect(html).not.toContain('aria-describedby')
  })
})

/** ตรวจ a11y staging — ช่องแนบเอกสารหน้าเคส: ปุ่มเลือกไฟล์ต่อประเภทเอกสารเป็นปุ่มจริง ชื่อ = ชื่อเอกสาร + คำบนปุ่ม */
describe('ช่องแนบเอกสารหน้าเคส', () => {
  function render(mode: DocumentMode): string {
    return renderToStaticMarkup(
      <CaseAttachmentsFields
        documents={[]}
        staged={[]}
        onChange={() => {}}
        mode={mode}
        onModeChange={() => {}}
        productPhotoInContract={false}
        onProductPhotoInContractChange={() => {}}
      />,
    )
  }
  const textOf = (html: string, id: string) =>
    html.match(new RegExp(`id="${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>([^<]*)<`))?.[1] ?? ''

  it.each<DocumentMode>(['separate', 'bundle'])('โหมด %s — ปุ่มต่อช่องชื่อไม่ซ้ำ + คำแนะนำผูกเป็นคำอธิบาย + ช่องไฟล์นอกลำดับ Tab', (mode) => {
    const html = render(mode)
    const buttons = [...html.matchAll(/<button[^>]*aria-labelledby="([^"]+)"[^>]*>/g)]
    const slots = formSlotsFor(mode)
    expect(buttons).toHaveLength(slots.length)
    const names = buttons.map(([tag, labelledBy]) => {
      expect(tag).toContain('type="button"')
      const describedBy = tag.match(/aria-describedby="([^"]+)"/)?.[1]
      expect(describedBy).toBeDefined()
      expect(textOf(html, describedBy ?? '')).not.toBe('')
      return (labelledBy ?? '')
        .split(' ')
        .map((id) => textOf(html, id))
        .join(' ')
    })
    expect(names).toEqual(slots.map((slot) => `${DOCUMENT_SLOT_LABEL[slot]} เลือกไฟล์`))
    expect(new Set(names).size).toBe(names.length)
    expect(html).not.toMatch(/<label[^>]*>[^<]*<input[^>]*type="file"/)
    // ช่องไฟล์ของปุ่มต่อช่องเอกสารเป็นแค่ตัวเปิดหน้าต่าง browser — ไม่อยู่ในลำดับ Tab ไม่มีชื่อซ้ำกับปุ่ม
    const hiddenPickers = (html.match(/<input[^>]*type="file"[^>]*>/g) ?? []).filter(
      (input) => input.includes('tabindex="-1"') && input.includes('aria-hidden="true"'),
    )
    expect(hiddenPickers).toHaveLength(slots.length)
  })
})

/**
 * กันถดถอย — สแกน source (AST) ของ `components/` + `app/` หารูปแบบที่คีย์บอร์ดใช้ไม่ได้:
 * 1) `<div onClick … onDrop>` (โซนวางไฟล์ที่โฟกัสไม่ได้) ⇒ ใช้ `<FileDropzone>`
 * 2) `<label>` ห่อ `<input type="file" className="hidden">` (label โฟกัสไม่ได้ ช่องซ่อน Tab ไม่ถึง) ⇒ ใช้ปุ่มจริง
 */
const ROOT = join(__dirname, '..', '..')
// จุดที่ยังค้าง (นอกขอบเขตรอบนี้) — ลบออกเมื่อแก้แล้ว
const KNOWN_LABEL_WRAPPED = new Set<string>()

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

function hasAttr(element: ts.JsxOpeningLikeElement, name: string): boolean {
  return element.attributes.properties.some((property) => ts.isJsxAttribute(property) && property.name.getText() === name)
}

function attrLiteral(element: ts.JsxOpeningLikeElement, name: string): string | undefined {
  const attribute = element.attributes.properties.find(
    (property): property is ts.JsxAttribute => ts.isJsxAttribute(property) && property.name.getText() === name,
  )
  const init = attribute?.initializer
  return init !== undefined && ts.isStringLiteral(init) ? init.text : undefined
}

function scanSource(file: string, text: string): string[] {
  const problems: string[] = []
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const at = (node: ts.Node) => `${relative(ROOT, file)}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`
  const visit = (node: ts.Node): void => {
    const open = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null
    if (open !== null) {
      const tag = open.tagName.getText()
      if (tag === 'div' && hasAttr(open, 'onClick') && hasAttr(open, 'onDrop')) problems.push(`${at(node)} div onClick+onDrop`)
      if (tag === 'label' && ts.isJsxElement(node)) {
        const hiddenFile = (child: ts.Node): boolean => {
          const inner = ts.isJsxElement(child) ? child.openingElement : ts.isJsxSelfClosingElement(child) ? child : null
          if (inner !== null && inner.tagName.getText() === 'input' && attrLiteral(inner, 'type') === 'file') {
            return /\bhidden\b/.test(attrLiteral(inner, 'className') ?? '')
          }
          return ts.forEachChild(child, (grand) => (hiddenFile(grand) ? true : undefined)) === true
        }
        if (node.children.some(hiddenFile)) problems.push(`${at(node)} label ห่อช่องไฟล์ที่ซ่อน`)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return problems
}

describe('โซนเลือกไฟล์ใช้คีย์บอร์ดได้ทุกจุด', () => {
  it('ตัวสแกนจับได้จริง', () => {
    const problems = scanSource(
      join(ROOT, 'components', 'fixture.tsx'),
      `const a = (
        <>
          <div onClick={open} onDrop={drop}><input type="file" className="hidden" /></div>
          <label className="btn">เลือกไฟล์<input type="file" className="hidden" /></label>
          <label>ชื่อ<input type="text" className="hidden" /></label>
          <button onClick={open} onDrop={drop} />
        </>
      )`,
    )
    expect(problems.map((problem) => problem.split(':')[1]?.split(' ')[0])).toEqual(['3', '4'])
  })

  it('ไม่มีโซนวางไฟล์/ปุ่มเลือกไฟล์ที่โฟกัสไม่ได้ (นอกจากจุดที่ยังค้าง)', () => {
    const problems = [...sourceFiles(join(ROOT, 'components')), ...sourceFiles(join(ROOT, 'app'))].flatMap((file) => {
      const text = readFileSync(file, 'utf8')
      if (KNOWN_LABEL_WRAPPED.has(relative(ROOT, file))) return []
      return text.includes('type="file"') ? scanSource(file, text) : []
    })
    expect(problems).toEqual([])
  })
})
