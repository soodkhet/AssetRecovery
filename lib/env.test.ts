import { afterEach, describe, expect, it } from 'vitest'
import { DEPLOYMENT_ENV_NAMES, deploymentEnvWarnings, getPublicEnv, getServerEnv, isDevToolsEnabled } from '@/lib/env'
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

describe('deploymentEnvWarnings (R2-004)', () => {
  it('เครื่อง dev (ไม่มี VERCEL_ENV) ⇒ ไม่เตือน', () => {
    expect(deploymentEnvWarnings({})).toEqual([])
  })

  it('บน Vercel ⇒ คืนชื่อที่ยังไม่ได้ตั้ง (ค่าว่างนับว่าไม่ตั้ง)', () => {
    const missing = deploymentEnvWarnings({ VERCEL_ENV: 'preview', CRON_SECRET: 'x', VAPID_PUBLIC_KEY: ' ' })
    expect(missing).toContain('VAPID_PUBLIC_KEY')
    expect(missing).toContain('GOOGLE_MAPS_API_KEY')
    expect(missing).not.toContain('CRON_SECRET')
  })

  it('GOOGLE_MAPS_SERVER_KEY (ชื่อบน Vercel staging) ใช้แทน GOOGLE_MAPS_API_KEY ได้', () => {
    expect(deploymentEnvWarnings({ VERCEL_ENV: 'preview', GOOGLE_MAPS_SERVER_KEY: 'k' })).not.toContain('GOOGLE_MAPS_API_KEY')
  })

  it('ตั้งครบ ⇒ ไม่เตือน', () => {
    const all = Object.fromEntries(DEPLOYMENT_ENV_NAMES.map((name) => [name, 'set']))
    expect(deploymentEnvWarnings({ VERCEL_ENV: 'production', ...all })).toEqual([])
  })
})

describe('isDevToolsEnabled (staging E-013)', () => {
  it('เครื่อง dev/test เปิด · production build นอก Vercel ปิด', () => {
    expect(isDevToolsEnabled({ NODE_ENV: 'development' })).toBe(true)
    expect(isDevToolsEnabled({ NODE_ENV: 'test' })).toBe(true)
    expect(isDevToolsEnabled({ NODE_ENV: 'production' })).toBe(false)
  })
  it('Vercel Preview เปิดเฉพาะเมื่อ ENABLE_DEV_TOOLS=1', () => {
    expect(isDevToolsEnabled({ NODE_ENV: 'production', VERCEL_ENV: 'preview' })).toBe(false)
    expect(isDevToolsEnabled({ NODE_ENV: 'production', VERCEL_ENV: 'preview', ENABLE_DEV_TOOLS: '1' })).toBe(true)
    expect(isDevToolsEnabled({ NODE_ENV: 'production', VERCEL_ENV: 'preview', ENABLE_DEV_TOOLS: 'true' })).toBe(false)
  })
  it('Vercel Production ปิดเสมอ แม้ตั้ง ENABLE_DEV_TOOLS', () => {
    expect(isDevToolsEnabled({ NODE_ENV: 'production', VERCEL_ENV: 'production', ENABLE_DEV_TOOLS: '1' })).toBe(false)
    expect(isDevToolsEnabled({ NODE_ENV: 'development', VERCEL_ENV: 'development' })).toBe(false)
  })
})
