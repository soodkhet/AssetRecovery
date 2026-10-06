import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(__dirname, '../..')

/**
 * Rule 05 — ทุกหน้าต้องมี error state · route หลักทั้ง 3 ส่วน (App Shell / Field Tracker / Client Portal)
 * ต้องมี `error.tsx` ไม่งั้น server component ที่ throw ได้หน้า default ภาษาอังกฤษของ Next (Final Test ด่าน 5)
 */
describe('error boundary ของ route หลัก', () => {
  it.each(['app/(app)/error.tsx', 'app/field/error.tsx', 'app/portal/error.tsx'])('%s มีและใช้หน้าจอ error กลาง', (file) => {
    const full = path.join(ROOT, file)
    expect(existsSync(full)).toBe(true)
    const source = readFileSync(full, 'utf8')
    expect(source).toMatch(/^'use client'/)
    expect(source).toContain('RouteErrorFallback')
  })
})
