import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * กันถดถอย ตรวจซ้ำ staging SV5-A11Y-A2-03 — กลุ่มปุ่มเลือก "สภาพเครื่อง" (รับเข้าคลัง) และ "รูปแบบการส่งมอบ" (นัดส่งมอบ)
 * เป็น `role="radiogroup"` ที่มีชื่อ (`aria-labelledby` ชี้หัวข้อ/`aria-label`) และปุ่มในกลุ่มเป็น `role="radio"` + `aria-checked`
 * (ไม่ใช่ปุ่ม `aria-pressed` ลอยใน div ธรรมดา) · ปุ่มใช้ `useRovingRadio().radioProps()` (roving tabindex + ลูกศร)
 * ห้ามเขียน `role="radio"` เอง — สแกน AST ของ source
 */
const FILES = ['intake-modal.tsx', 'handover-lot-modal.tsx', '../field/close-case-modal.tsx']

interface Group {
  named: boolean
  required: boolean
  radios: number
  pressed: number
}

function radioGroups(file: string): { groups: Group[]; pressed: number } {
  const text = readFileSync(join(__dirname, file), 'utf8')
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const groups: Group[] = []
  let pressed = 0
  const attrs = (open: ts.JsxOpeningLikeElement) =>
    new Map(
      open.attributes.properties
        .filter(ts.isJsxAttribute)
        .map((prop) => [prop.name.getText(), prop.initializer === undefined ? 'true' : prop.initializer.getText()] as const),
    )
  const visit = (node: ts.Node, group: Group | null): void => {
    const open = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null
    let current = group
    if (open !== null) {
      const map = attrs(open)
      if (map.get('role') === '"radiogroup"') {
        // <FieldGroupBox> ได้ชื่อจาก <Field id group> เอง (aria-labelledby="<id>-label")
        const named = map.has('aria-labelledby') || map.has('aria-label') || open.tagName.getText() === 'FieldGroupBox'
        current = { named, required: map.has('aria-required'), radios: 0, pressed: 0 }
        groups.push(current)
      }
      // ปุ่ม radio ต้องได้ props จาก useRovingRadio (role/aria-checked/tabIndex/ลูกศร — รีวิวรอบ 2)
      const roving = open.attributes.properties.some(
        (prop) => ts.isJsxSpreadAttribute(prop) && /\.radioProps\(/.test(prop.expression.getText()),
      )
      if (roving && current !== null) current.radios += 1
      if (map.get('role') === '"radio"') pressed += 1
      if (map.has('aria-pressed')) pressed += 1
    }
    ts.forEachChild(node, (child) => visit(child, current))
  }
  visit(source, null)
  return { groups, pressed }
}

describe('กลุ่มปุ่มเลือกของคลังเป็น radiogroup ที่มีชื่อ', () => {
  it.each(FILES)('%s', (file) => {
    const { groups, pressed } = radioGroups(file)
    expect(groups.length).toBeGreaterThan(0)
    for (const group of groups) {
      expect(group.named).toBe(true)
      expect(group.radios).toBeGreaterThan(0)
    }
    expect(pressed).toBe(0)
  })
})

// SV5-B2-01 — ทุกกลุ่มของรับเข้าคลังเป็นตัวเลือกบังคับ (*) ⇒ aria-required + อยู่ใน <Field id group> (FieldGroupBox)
describe('รับเข้าคลัง: กลุ่มตัวเลือกบังคับทุกกลุ่มเป็น FieldGroupBox ที่ aria-required', () => {
  it('intake-modal.tsx', () => {
    const { groups } = radioGroups('intake-modal.tsx')
    expect(groups).toHaveLength(2)
    for (const group of groups) expect(group.required).toBe(true)
    const text = readFileSync(join(__dirname, 'intake-modal.tsx'), 'utf8')
    expect(text).not.toMatch(/<div[^>]*role="radiogroup"/)
  })
})
