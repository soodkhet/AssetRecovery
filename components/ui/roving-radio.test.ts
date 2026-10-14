import { describe, expect, it } from 'vitest'
import { rovingRadioTarget, rovingTabIndex } from '@/components/ui/roving-radio'

describe('rovingTabIndex', () => {
  it('ตัวที่เลือกรับ Tab ตัวเดียว · ยังไม่เลือก ⇒ ตัวแรก', () => {
    expect([0, 1, 2].map((index) => rovingTabIndex(index, 1))).toEqual([-1, 0, -1])
    expect([0, 1, 2].map((index) => rovingTabIndex(index, -1))).toEqual([0, -1, -1])
  })
})

describe('rovingRadioTarget', () => {
  it('ลูกศรขวา/ลง = ถัดไป วนกลับตัวแรก', () => {
    expect(rovingRadioTarget('ArrowRight', 0, 3)).toBe(1)
    expect(rovingRadioTarget('ArrowDown', 2, 3)).toBe(0)
  })
  it('ลูกศรซ้าย/ขึ้น = ก่อนหน้า วนไปตัวสุดท้าย', () => {
    expect(rovingRadioTarget('ArrowLeft', 0, 3)).toBe(2)
    expect(rovingRadioTarget('ArrowUp', 2, 3)).toBe(1)
  })
  it('Home/End = ตัวแรก/ตัวสุดท้าย · ปุ่มอื่นหรือกลุ่มว่าง = null', () => {
    expect(rovingRadioTarget('Home', 2, 3)).toBe(0)
    expect(rovingRadioTarget('End', 0, 3)).toBe(2)
    expect(rovingRadioTarget('Tab', 0, 3)).toBeNull()
    expect(rovingRadioTarget(' ', 0, 3)).toBeNull()
    expect(rovingRadioTarget('ArrowRight', 0, 0)).toBeNull()
  })
})

describe('ทุกกลุ่ม radio แบบปุ่มใช้ useRovingRadio', () => {
  it('ไม่มี role="radio" เขียนเองใน components/app (ต้องผ่าน radioProps)', async () => {
    const { readFileSync, readdirSync } = await import('node:fs')
    const { join, relative } = await import('node:path')
    const root = join(__dirname, '..', '..')
    const files: string[] = []
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) {
          if (entry.name !== 'node_modules') walk(path)
        } else if (entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx')) files.push(path)
      }
    }
    walk(join(root, 'components'))
    walk(join(root, 'app'))
    const offenders = files.filter((file) => readFileSync(file, 'utf8').includes('role="radio"')).map((file) => relative(root, file))
    expect(offenders).toEqual([])
  })
})
