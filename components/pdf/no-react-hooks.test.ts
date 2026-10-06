import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * BUG-172 — กันถอยหลัง: component PDF ถูก import เข้า route handler ของ Next (bundle ด้วยเงื่อนไข `react-server`)
 * ซึ่ง React ฝั่งนี้ไม่มี `createContext` และ hook ทั้งหลาย ⇒ dev server compile พังทั้งเซิร์ฟเวอร์ (ทุก API ตอบ 500)
 * vitest ไม่ผ่าน bundler ของ Next จึงไม่เห็นเอง — สแกน source ตรงๆ แทน
 */
const PDF_DIR = path.join(process.cwd(), 'components/pdf')
const FORBIDDEN =
  /^(createContext|useContext|useState|useEffect|useLayoutEffect|useReducer|useRef|useMemo|useCallback|useId|useSyncExternalStore|use)$/

function reactValueImports(source: string): string[] {
  const names: string[] = []
  const re = /import\s+(?!type\b)([^'"]*?)\s+from\s+['"]react['"]/g
  for (const match of source.matchAll(re)) {
    const braces = /\{([^}]*)\}/.exec(match[1] ?? '')
    for (const raw of (braces?.[1] ?? '').split(',')) {
      const name = raw.trim()
      if (name && !name.startsWith('type ')) names.push(name.split(/\s+as\s+/)[0] ?? name)
    }
  }
  return names
}

describe('components/pdf ไม่ใช้ React context/hook (BUG-172)', () => {
  const files = readdirSync(PDF_DIR).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))

  it('มีไฟล์ให้สแกน', () => {
    expect(files.length).toBeGreaterThan(5)
  })

  it.each(files)('%s ไม่ import hook/context จาก react', (file) => {
    const source = readFileSync(path.join(PDF_DIR, file), 'utf8')
    const offending = reactValueImports(source).filter((name) => FORBIDDEN.test(name))
    expect(offending).toEqual([])
    expect(source).not.toMatch(/\bReact\.(createContext|useContext|use[A-Z]\w*)\(/)
  })

  it('ตัวตรวจจับ import ได้จริง (sanity)', () => {
    expect(reactValueImports("import { createContext, useContext, type ReactNode } from 'react'")).toEqual([
      'createContext',
      'useContext',
    ])
  })
})
