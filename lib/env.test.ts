import { afterEach, describe, expect, it } from 'vitest'
import { getPublicEnv, getServerEnv } from '@/lib/env'
import { BUDDHIST_YEAR_OFFSET, DISPLAY_TIMEZONE } from '@/lib/constants'

const KEYS = [
  'DATABASE_URL',
  'DIRECT_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
] as const

const original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]))

function setEnv(values: Partial<Record<(typeof KEYS)[number], string | undefined>>) {
  for (const key of KEYS) {
    const value = values[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

afterEach(() => {
  for (const key of KEYS) {
    const value = original[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe('env', () => {
  it('อ่าน server env ครบทุกตัวเมื่อค่าถูกต้อง', () => {
    setEnv({
      DATABASE_URL: 'postgresql://user:pass@localhost:5433/db',
      DIRECT_URL: 'postgresql://user:pass@localhost:5433/db',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role',
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
    })

    expect(getServerEnv().DATABASE_URL).toBe('postgresql://user:pass@localhost:5433/db')
    expect(getPublicEnv().NEXT_PUBLIC_SUPABASE_URL).toBe('https://example.supabase.co')
  })

  it('โยน error พร้อมชื่อตัวแปรเมื่อ env ขาด', () => {
    setEnv({
      DATABASE_URL: 'postgresql://user:pass@localhost:5433/db',
      DIRECT_URL: undefined,
      SUPABASE_SERVICE_ROLE_KEY: 'service-role',
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
    })

    expect(() => getServerEnv()).toThrowError(/DIRECT_URL/)
  })

  it('โยน error เมื่อ Supabase URL ไม่ใช่ URL', () => {
    setEnv({
      DATABASE_URL: 'postgresql://user:pass@localhost:5433/db',
      DIRECT_URL: 'postgresql://user:pass@localhost:5433/db',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role',
      NEXT_PUBLIC_SUPABASE_URL: 'ไม่ใช่ url',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
    })

    expect(() => getPublicEnv()).toThrowError(/NEXT_PUBLIC_SUPABASE_URL/)
  })
})

describe('constants', () => {
  it('ตรึงค่าเวลาแสดงผลตาม Rule 01', () => {
    expect(DISPLAY_TIMEZONE).toBe('Asia/Bangkok')
    expect(BUDDHIST_YEAR_OFFSET).toBe(543)
  })
})
