import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { auditFieldLabel } from '@/lib/audit/field-display'

/**
 * mytester6 T-009 — ล็อกความครบ (แนวเดียวกับ `target-ref-coverage.test.ts`): ชื่อฟิลด์ที่ขึ้นตาราง "ค่าก่อน / หลัง"
 * ต้องแปลเป็นภาษาไทยได้ทุกตัว (ป้ายเฉพาะ หรือแปลทีละคำ) — ไม่หลุดเป็นชื่อคอลัมน์ภายใน
 *
 * แหล่งชื่อฟิลด์ 2 ทาง:
 *  1. คีย์ใน object literal ของ `before: { … }` / `after: { … }` ในซอร์สที่เขียน audit (`app` · `lib` · `components` ไม่รวมเทสต์)
 *  2. ทุกคอลัมน์ในสคีมา (`prisma/schema.prisma`) — payload แบบ snapshot แถว/diff ใช้ชื่อคอลัมน์ตรง ๆ
 * เพิ่มคอลัมน์/คีย์ใหม่ที่มีคำใหม่ ⇒ เพิ่มคำใน `lib/audit/field-tokens.ts` หรือป้ายเฉพาะใน `field-display.ts`
 */

const ROOT = resolve(__dirname, '..', '..')
const SOURCE_DIRS = ['app', 'lib', 'components']

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return name === 'generated' || name === 'node_modules' ? [] : walk(full)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : []
  })
}

/** เนื้อใน `{ … }` ที่จับคู่วงเล็บแล้ว เริ่มหลังวงเล็บเปิดที่ตำแหน่ง `start` */
function braceBlock(source: string, start: number): string {
  let depth = 1
  let index = start
  while (index < source.length && depth > 0) {
    const char = source[index]
    if (char === '{') depth += 1
    else if (char === '}') depth -= 1
    index += 1
  }
  return source.slice(start, index)
}

function collectSourceKeys(): Map<string, string> {
  const found = new Map<string, string>()
  for (const file of SOURCE_DIRS.flatMap((dir) => walk(join(ROOT, dir)))) {
    const source = readFileSync(file, 'utf8')
    if (!/emitAudit|AuditEntry|DocumentExportAudit/.test(source)) continue
    for (const match of source.matchAll(/\b(?:before|after)\s*:\s*\{/g)) {
      const block = braceBlock(source, (match.index ?? 0) + match[0].length)
      for (const key of block.matchAll(/(?:^|[\s,{])([a-z][A-Za-z0-9]*_[a-z0-9_]+)\s*:/g)) {
        const name = key[1]
        if (name !== undefined && !found.has(name)) found.set(name, relative(ROOT, file))
      }
    }
  }
  return found
}

function collectSchemaColumns(): string[] {
  const schema = readFileSync(join(ROOT, 'prisma', 'schema.prisma'), 'utf8')
  const columns = new Set<string>()
  let inModel = false
  for (const line of schema.split('\n')) {
    if (/^model \w+ \{/.test(line)) {
      inModel = true
      continue
    }
    if (line.startsWith('}')) {
      inModel = false
      continue
    }
    if (!inModel || line.includes('@relation')) continue
    const field = /^\s+(\w+)\s+[A-Za-z]+/.exec(line)?.[1]
    if (field === undefined) continue
    const mapped = /@map\("(\w+)"\)/.exec(line)?.[1]
    columns.add(mapped ?? field.replace(/([A-Z])/g, '_$1').toLowerCase())
  }
  return [...columns]
}

const THAI = /[฀-๿]/

function untranslated(fields: Iterable<string>): string[] {
  return [...fields].filter((field) => {
    const label = auditFieldLabel(field)
    return label === field || label.includes('_') || !THAI.test(label)
  })
}

describe('mytester6 T-009 — ทุกชื่อฟิลด์ใน audit แปลเป็นไทยได้', () => {
  const sourceKeys = collectSourceKeys()
  const schemaColumns = collectSchemaColumns()

  it('ตัวเก็บเจอคีย์/คอลัมน์หลักจริง (กันรูปแบบสแกนเพี้ยนแล้วเทสต์ผ่านลอย ๆ)', () => {
    for (const key of ['note_type', 'failed_checks', 'source_module', 'mapping_rule']) expect(sourceKeys.has(key), key).toBe(true)
    for (const column of ['allowance_satang', 'holiday_date', 'supervisor_can_assign_outsource', 'account_name']) {
      expect(schemaColumns.includes(column), column).toBe(true)
    }
    expect(sourceKeys.size).toBeGreaterThan(200)
    expect(schemaColumns.length).toBeGreaterThan(500)
  })

  it('คีย์ที่โค้ดเขียนลง before/after ไม่ตกหล่น', () => {
    const missing = untranslated(sourceKeys.keys()).map((key) => `${key} ← ${sourceKeys.get(key) ?? ''}`)
    expect(missing).toEqual([])
  })

  it('คอลัมน์ทุกตัวในสคีมาไม่ตกหล่น', () => {
    expect(untranslated(schemaColumns)).toEqual([])
  })
})
