import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AUDIT_ORG_LEVEL_TARGET_TYPES,
  AUDIT_REF_TYPES,
  AUDIT_TARGET_TYPE_ALIASES,
  AUDIT_TARGET_TYPES_WITHOUT_REF,
} from '@/lib/audit/target-refs'

/**
 * mytester5 H5-01 — ล็อกความครบ: ทุก `target_type` ที่โค้ดเขียนลงบันทึกการใช้งานต้องแปลงเป็นชื่อที่อ่านได้
 * (มีตัวค้นชื่อใน `AUDIT_REF_TYPES` / ชื่อเอกพจน์ที่รู้จัก / ค่าตั้งระดับองค์กร) หรืออยู่ในรายการยกเว้นที่มีเหตุผล
 *
 * เก็บ target_type จากซอร์ส (`app` · `lib` · `components` ไม่รวมเทสต์) 3 รูปแบบที่ใช้กับ `emitAudit()`:
 *  1. `targetType: 'xxx'`
 *  2. ค่าคงที่ชื่อมีคำว่า `TARGET` เช่น `const TARGET = 'xxx'` / `PORTAL_LOT_TARGET = 'xxx'`
 *  3. เป้าหมายของพอร์ทัลที่ถูกปฏิเสธ `{ type: 'xxx', id: … }` (`requirePortalRow`)
 */

const ROOT = resolve(__dirname, '..', '..')
const SOURCE_DIRS = ['app', 'lib', 'components']
const PATTERNS = [
  /targetType:\s*['"]([a-z_]+)['"]/g,
  /\b[A-Z_]*TARGET[A-Z_]*\s*(?::\s*[A-Za-z]+\s*)?=\s*['"]([a-z_]+)['"]/g,
  /\{\s*type:\s*['"]([a-z_]+)['"],\s*id:/g,
]
/** ค่าที่จับได้จากรูปแบบข้างบนแต่ไม่ใช่ target_type (ทิศการเรียงของ `groupBy` ในหน้าบันทึกการใช้งาน) */
const NOT_TARGET_TYPES: ReadonlySet<string> = new Set(['asc', 'desc'])

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return name === 'generated' || name === 'node_modules' ? [] : walk(full)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : []
  })
}

function collectTargetTypes(): Map<string, string[]> {
  const found = new Map<string, string[]>()
  for (const file of SOURCE_DIRS.flatMap((dir) => walk(join(ROOT, dir)))) {
    const source = readFileSync(file, 'utf8')
    for (const pattern of PATTERNS) {
      for (const match of source.matchAll(pattern)) {
        const type = match[1]
        if (type === undefined || NOT_TARGET_TYPES.has(type)) continue
        const files = found.get(type) ?? []
        files.push(relative(ROOT, file))
        found.set(type, files)
      }
    }
  }
  return found
}

describe('mytester5 H5-01 — ทุก target_type ใน audit มีตัวแปลงชื่อ', () => {
  const found = collectTargetTypes()
  const handled = new Set<string>([
    ...AUDIT_REF_TYPES,
    ...AUDIT_TARGET_TYPE_ALIASES,
    ...AUDIT_ORG_LEVEL_TARGET_TYPES,
    ...Object.keys(AUDIT_TARGET_TYPES_WITHOUT_REF),
  ])

  it('ตัวเก็บจากซอร์สเจอชนิดหลักจริง (กันรูปแบบค้นหาเพี้ยนแล้วเทสต์ผ่านลอย ๆ)', () => {
    for (const type of ['cases', 'expenses', 'case_assignments', 'adjustments', 'jobs', 'portal', 'organizations']) {
      expect(found.has(type), type).toBe(true)
    }
    expect(found.size).toBeGreaterThan(50)
  })

  it('ไม่มีชนิดที่ตกหล่น (เพิ่มตัวค้นใน target-ref-queries หรือเหตุผลใน AUDIT_TARGET_TYPES_WITHOUT_REF)', () => {
    const missing = [...found]
      .filter(([type]) => !handled.has(type))
      .map(([type, files]) => `${type} ← ${[...new Set(files)].join(', ')}`)
    expect(missing).toEqual([])
  })

  it('รายการยกเว้นมีเหตุผลทุกตัว และไม่ซ้อนกับชนิดที่มีตัวค้น', () => {
    for (const [type, reason] of Object.entries(AUDIT_TARGET_TYPES_WITHOUT_REF)) {
      expect(reason.trim(), type).not.toBe('')
      expect((AUDIT_REF_TYPES as readonly string[]).includes(type), type).toBe(false)
    }
  })
})
