import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * กันโค้ดฝั่ง server หลุดเข้า bundle ของ browser (preship R2-019)
 *
 * ไม่ใช้ `import 'server-only'` เพราะ script seed (`scripts/seed-final`) รันโมดูลเหล่านี้ด้วย tsx นอก Next
 * แล้วจะ throw — จึงไล่กราฟ import จากทุกไฟล์ `'use client'` แทน: ห้ามเดินถึงโมดูลที่อ่าน secret/ฐานข้อมูล
 * เพิ่มโมดูลที่ห้ามได้ที่ {@link SERVER_ONLY_MODULES}
 */

const ROOT = resolve(__dirname, '..')
const SOURCE_DIRS = ['app', 'components', 'lib']
const SERVER_ONLY_MODULES = ['lib/env.ts', 'lib/prisma.ts', 'lib/supabase/server.ts', 'lib/users/provisioning.ts']
const EXTENSIONS = ['.ts', '.tsx', '/index.ts', '/index.tsx']

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return name === 'generated' || name === 'node_modules' ? [] : walk(full)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : []
  })
}

function resolveImport(fromFile: string, specifier: string): string | null {
  let base: string
  if (specifier.startsWith('@/')) base = join(ROOT, specifier.slice(2))
  else if (specifier.startsWith('.')) base = resolve(dirname(fromFile), specifier)
  else return null
  if (existsSync(base) && statSync(base).isFile()) return base
  for (const extension of EXTENSIONS) if (existsSync(base + extension)) return base + extension
  return null
}

const IMPORT_PATTERN = /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g

function runtimeImports(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  const imports: string[] = []
  for (const match of source.matchAll(IMPORT_PATTERN)) {
    // `import type` ถูกลบตอน compile ไม่ไปถึง browser
    if (/^(import|export)\s+type\s/.test(match[0])) continue
    const specifier = match[1] ?? match[2]
    if (specifier === undefined) continue
    const resolved = resolveImport(file, specifier)
    if (resolved !== null) imports.push(resolved)
  }
  return imports
}

describe('ขอบเขตโค้ดฝั่ง server (R2-019)', () => {
  it("ไฟล์ 'use client' ไม่ import (ทางตรงหรือทางอ้อม) โมดูลที่อ่าน secret/ฐานข้อมูล", () => {
    const files = SOURCE_DIRS.flatMap((dir) => walk(join(ROOT, dir)))
    const clientEntries = files.filter((file) => /^\s*['"]use client['"]/.test(readFileSync(file, 'utf8')))
    const forbidden = new Set(SERVER_ONLY_MODULES.map((path) => join(ROOT, path)))
    const violations: string[] = []

    for (const entry of clientEntries) {
      const seen = new Map<string, string | null>([[entry, null]])
      const queue = [entry]
      while (queue.length > 0) {
        const current = queue.shift() as string
        if (forbidden.has(current)) {
          const chain: string[] = []
          for (let node: string | null = current; node !== null; node = seen.get(node) ?? null) chain.unshift(relative(ROOT, node))
          violations.push(chain.join(' → '))
          break
        }
        for (const next of runtimeImports(current)) {
          if (!seen.has(next)) {
            seen.set(next, current)
            queue.push(next)
          }
        }
      }
    }

    expect(clientEntries.length).toBeGreaterThan(50)
    expect(violations).toEqual([])
  })
})
