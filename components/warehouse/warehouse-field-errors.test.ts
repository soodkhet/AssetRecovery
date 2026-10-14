import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * กันถดถอย ตรวจซ้ำ staging SV5-A11Y-A2-02 — ช่องบังคับของฟอร์มคลัง (เหตุผล/รายละเอียดสภาพ/สิ่งที่พบ) ต้องรับ
 * ข้อผิดทาง `<Field error>` (ข้อความใต้ช่อง + aria-invalid/aria-describedby) และฟอร์มเรียก `useRevealFieldError()`
 * เพื่อโฟกัสช่อง — ห้ามกลับไปแจ้งแค่ในกล่องแจ้งเตือน (สแกน AST ของ source)
 */
const DIR = __dirname
const CASES: ReadonlyArray<[file: string, fieldIdSuffixes: readonly string[]]> = [
  ['reject-intake-modal.tsx', ['-reason']],
  ['remove-from-lot-modal.tsx', ['-reason']],
  ['delete-empty-lot-modal.tsx', ['-reason']],
  ['intake-modal.tsx', ['-condition-note', '-color-capacity-note']],
]

function fieldsWithError(file: string): Map<string, boolean> {
  const text = readFileSync(join(DIR, file), 'utf8')
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const result = new Map<string, boolean>()
  const visit = (node: ts.Node): void => {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText() === 'Field') {
      const props = node.openingElement.attributes.properties.filter(ts.isJsxAttribute)
      const id = props.find((prop) => prop.name.getText() === 'id')?.initializer?.getText()
      if (id !== undefined) result.set(id, props.some((prop) => prop.name.getText() === 'error'))
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return result
}

describe('ฟอร์มคลัง: ข้อผิดของช่องบังคับผูกกับช่อง', () => {
  it.each(CASES)('%s', (file, suffixes) => {
    const fields = fieldsWithError(file)
    for (const suffix of suffixes) {
      const entry = [...fields].find(([id]) => id.includes(`${suffix}\``))
      expect(entry, `${file} ${suffix}`).toBeDefined()
      expect(entry?.[1], `${file} ${suffix} ต้องมี error`).toBe(true)
    }
    const text = readFileSync(join(DIR, file), 'utf8')
    expect(text).toContain('useRevealFieldError()')
    expect(text).toMatch(/\breveal\(\)/)
    expect(text).toMatch(/ref=\{formRef\}/)
  })
})
