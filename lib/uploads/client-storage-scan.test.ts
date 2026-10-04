import { globSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LEGACY_POLICY_NAMES, revokePolicySql } from '@/scripts/setup-storage'

/**
 * BUG-143 (S3) — ยามสแกนโค้ด: browser ต้องไม่แตะ Storage ตรง (DEC-014)
 *
 * - `.upload(` / `createSignedUrl(` / `createSignedUploadUrl(` / `.download(` / `.remove(` อยู่ได้เฉพาะโมดูลฝั่ง server
 *   ที่ใช้ service role (รายชื่อด้านล่าง) — ไฟล์อื่นเรียก = รูเดิมกลับมา
 * - browser อัปโหลดได้ทางเดียว `uploadToSignedUrl()` ใน `lib/uploads/client.ts` (โทเคนจาก server)
 * - สคริปต์ตั้งค่า Storage ต้องไม่สร้าง policy ให้ `authenticated`/`anon` อีก และต้องถอดชื่อเดิมครบ
 */

const ROOT = fileURLToPath(new URL('../../', import.meta.url))

/** โมดูล server ที่แตะ Storage ด้วย service role (`createSupabaseAdminClient`) */
const SERVER_STORAGE_MODULES = [
  'lib/uploads/storage.ts',
  'lib/exports/pack-storage.ts',
  'lib/payout/payment-file-storage.ts',
  'lib/reports/export-file.ts',
] as const

const BROWSER_UPLOAD_MODULE = 'lib/uploads/client.ts'

function sourceFiles(): string[] {
  return globSync(['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}'], { cwd: ROOT }).filter(
    (file) => !/\.test\.tsx?$/.test(file) && !file.startsWith('lib/generated/'),
  )
}

/** อ่านซอร์สโดยตัดคอมเมนต์ทิ้ง (คอมเมนต์อธิบายกติกาที่เอ่ยชื่อ API ต้องห้ามไม่นับเป็นการเรียกจริง) */
const read = (file: string) =>
  readFileSync(`${ROOT}${file}`, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

describe('ไม่มีการแตะ Storage ตรงจากฝั่ง client (BUG-143)', () => {
  const files = sourceFiles()

  it('สแกนเจอไฟล์จริง (กันเทสต์ผ่านเพราะ glob ว่าง)', () => {
    expect(files.length).toBeGreaterThan(100)
    expect(files).toContain(BROWSER_UPLOAD_MODULE)
  })

  it('createSignedUrl / createSignedUploadUrl อยู่ได้เฉพาะ lib/uploads/storage.ts', () => {
    const offenders = files.filter(
      (file) => file !== 'lib/uploads/storage.ts' && /\bcreateSigned(Upload)?Url\s*\(/.test(read(file)),
    )
    expect(offenders).toEqual([])
  })

  it('.upload( / .download( / .remove( ของ Storage อยู่ได้เฉพาะโมดูล server ที่ใช้ service role', () => {
    const offenders = files.filter((file) => {
      if ((SERVER_STORAGE_MODULES as readonly string[]).includes(file)) return false
      const text = read(file)
      return /storage\s*\.\s*from\(/.test(text) && /\.(upload|download|remove)\s*\(/.test(text)
    })
    expect(offenders).toEqual([])
  })

  it('storage.from( นอกโมดูล server มีได้ที่เดียวคือ lib/uploads/client.ts และใช้แค่ uploadToSignedUrl', () => {
    const users = files.filter(
      (file) => !(SERVER_STORAGE_MODULES as readonly string[]).includes(file) && /storage\s*\.\s*from\(/.test(read(file)),
    )
    expect(users).toEqual([BROWSER_UPLOAD_MODULE])
    const client = read(BROWSER_UPLOAD_MODULE)
    expect(client).toMatch(/\.uploadToSignedUrl\(/)
    expect(client).not.toMatch(/\.(upload|download|remove|list|move|copy|createSignedUrl)\(/)
  })

  it('โมดูล server ที่แตะ Storage ใช้ service role และไม่ใช่ client component', () => {
    for (const file of SERVER_STORAGE_MODULES) {
      const text = read(file)
      expect(text, file).toMatch(/createSupabaseAdminClient/)
      expect(text, file).not.toMatch(/^['"]use client['"]/m)
      expect(text, file).not.toMatch(/createSupabaseBrowserClient/)
    }
  })

  it('component/โมดูล browser ไม่ import โมดูล Storage ฝั่ง server', () => {
    const offenders = files.filter((file) => {
      const text = read(file)
      const isClient = /^['"]use client['"]/m.test(text) || /upload-client\.ts$/.test(file) || file === BROWSER_UPLOAD_MODULE
      return isClient && /@\/lib\/uploads\/(storage|access)['"]/.test(text)
    })
    expect(offenders).toEqual([])
  })
})

describe('scripts/setup-storage.ts — policy ของ storage.objects', () => {
  const script = readFileSync(`${ROOT}scripts/setup-storage.ts`, 'utf8')

  it('ไม่สร้าง policy ใด ๆ อีก (ไม่มี CREATE POLICY / GRANT)', () => {
    expect(script).not.toMatch(/CREATE\s+POLICY/i)
    expect(script).not.toMatch(/\bGRANT\b/)
  })

  it('ถอด policy เดิมของ case-documents ครบ 3 ชื่อแบบ idempotent', () => {
    expect([...LEGACY_POLICY_NAMES]).toEqual(['case-docs read', 'case-docs insert', 'case-docs update'])
    expect(revokePolicySql()).toEqual(
      LEGACY_POLICY_NAMES.map((name) => `DROP POLICY IF EXISTS "${name}" ON storage.objects;`),
    )
  })

  it('มีโหมด --dry-run', () => {
    expect(script).toMatch(/flag\('dry-run'\)/)
  })
})
