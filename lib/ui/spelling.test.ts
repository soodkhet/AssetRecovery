import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * staging E-030 — คำที่สะกดผิดบนหน้าจอห้ามกลับมา ("รีไซเกิล" ⇒ "รีไซเคิล") · สแกนโค้ด/เอกสาร/mockup
 * (migration ที่ apply แล้วแก้ไม่ได้ — ไม่สแกน)
 */
const BANNED: readonly { wrong: string; right: string }[] = [{ wrong: 'รีไซเกิล', right: 'รีไซเคิล' }]
const ROOTS = ['app', 'components', 'lib', 'docs', 'reference']
const EXTENSIONS = /\.(ts|tsx|md|html)$/

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (name === 'generated' || name === 'node_modules') return []
    return statSync(path).isDirectory() ? filesUnder(path) : EXTENSIONS.test(name) ? [path] : []
  })
}

describe('คำสะกดผิดที่ห้ามใช้ (staging E-030)', () => {
  it.each(BANNED)('ไม่มี "$wrong" (ใช้ "$right")', ({ wrong }) => {
    const offenders = ROOTS.flatMap(filesUnder).filter(
      (path) => !path.endsWith('spelling.test.ts') && readFileSync(path, 'utf8').includes(wrong),
    )
    expect(offenders).toEqual([])
  })
})
