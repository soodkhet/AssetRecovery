import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { isDismissEscape, isTopModal, registerModal, unregisterModal } from '@/components/ui/modal-stack'

describe('modal-stack — Esc ปิดเฉพาะ modal บนสุด (UAT BUG-031)', () => {
  it('modal ที่เปิดทีหลังอยู่บนสุด · ปิดแล้วตัวข้างหลังกลับมาเป็นบนสุด', () => {
    const review = registerModal()
    expect(isTopModal(review)).toBe(true)

    const viewer = registerModal()
    expect(isTopModal(viewer)).toBe(true)
    expect(isTopModal(review)).toBe(false)

    unregisterModal(viewer)
    expect(isTopModal(review)).toBe(true)
    unregisterModal(review)
    expect(isTopModal(review)).toBe(false)
  })

  it('ถอนตัวที่อยู่กลางกองได้โดยไม่กระทบตัวบนสุด และถอนซ้ำไม่พัง', () => {
    const first = registerModal()
    const second = registerModal()
    const third = registerModal()
    unregisterModal(second)
    unregisterModal(second)
    expect(isTopModal(third)).toBe(true)
    unregisterModal(third)
    expect(isTopModal(first)).toBe(true)
    unregisterModal(first)
  })
})

describe('isDismissEscape — ตัวจัดการ Esc ของ modal/overlay ข้ามเมื่อมีผู้ใช้ Esc ไปแล้ว (SV5-G1-01)', () => {
  it('Esc ที่ยังไม่ถูกใช้ ⇒ ปิด', () => {
    expect(isDismissEscape({ key: 'Escape', defaultPrevented: false })).toBe(true)
  })
  it('Esc ที่ตัวควบคุมข้างใน preventDefault แล้ว (combobox ปิดรายการ) ⇒ ไม่ปิด', () => {
    expect(isDismissEscape({ key: 'Escape', defaultPrevented: true })).toBe(false)
  })
  it('ปุ่มอื่น ⇒ ไม่ปิด', () => {
    expect(isDismissEscape({ key: 'Enter', defaultPrevented: false })).toBe(false)
    expect(isDismissEscape({ key: 'Esc', defaultPrevented: false })).toBe(false)
  })
})

/** ไฟล์ .ts/.tsx ของแอป (ไม่รวมเทสต์) */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : []
  })
}

describe('กันถดถอย — ตัวจัดการ Esc ทุกตัวผ่าน isDismissEscape (SV5-G1-01)', () => {
  it("ไม่มีโค้ดเทียบ key กับ 'Escape' ตรง ๆ นอกจุดกลาง (modal-stack / combobox-open)", () => {
    const allowed = new Set([join('components', 'ui', 'modal-stack.ts'), join('components', 'ui', 'combobox-open.ts')])
    const offenders = ['app', 'components', 'lib']
      .flatMap((dir) => sourceFiles(dir))
      .filter((file) => !allowed.has(file) && /['"]Esc(ape)?['"]|keyCode\s*===?\s*27/.test(readFileSync(file, 'utf8')))
    expect(offenders).toEqual([])
  })
})
