import { describe, expect, it } from 'vitest'
import { applyDevLoginAlias, type DevLoginAliasContext } from '@/lib/auth/dev-login-alias'

/** ทางลัด admin/admin บนเครื่อง dev — ต้องไม่มีผลนอก `next dev` + localhost เด็ดขาด */

const REAL = 'r4nd0m-long-dev-password'
const dev: DevLoginAliasContext = { nodeEnv: 'development', aliasPassword: REAL, hostname: 'localhost' }
const admin = { identifier: 'admin', password: 'admin' }

describe('applyDevLoginAlias', () => {
  it('next dev + localhost + มีรหัสจริงใน env → แปล admin/admin เป็นรหัสจริง', () => {
    expect(applyDevLoginAlias(admin, dev)).toEqual({ identifier: 'admin', password: REAL })
    expect(applyDevLoginAlias(admin, { ...dev, hostname: '127.0.0.1' }).password).toBe(REAL)
  })

  it('production build ไม่มีผลเลย แม้ตั้ง env ไว้', () => {
    expect(applyDevLoginAlias(admin, { ...dev, nodeEnv: 'production' })).toEqual(admin)
    expect(applyDevLoginAlias(admin, { ...dev, nodeEnv: 'test' })).toEqual(admin)
  })

  it('host ที่ไม่ใช่ localhost ไม่มีผล (เช่น เปิด dev server ให้เครื่องอื่นในวง LAN เข้า)', () => {
    expect(applyDevLoginAlias(admin, { ...dev, hostname: '192.168.1.20' })).toEqual(admin)
    expect(applyDevLoginAlias(admin, { ...dev, hostname: 'staging.example.com' })).toEqual(admin)
  })

  it('ไม่ได้รัน pnpm auth:dev-admin (ไม่มีรหัสจริงใน env) ไม่มีผล', () => {
    expect(applyDevLoginAlias(admin, { ...dev, aliasPassword: undefined })).toEqual(admin)
    expect(applyDevLoginAlias(admin, { ...dev, aliasPassword: '' })).toEqual(admin)
  })

  it('แปลเฉพาะคู่ admin/admin เป๊ะ — บัญชีอื่น/รหัสอื่นผ่านไปตามปกติ', () => {
    expect(applyDevLoginAlias({ identifier: 'admin', password: 'other1234' }, dev).password).toBe('other1234')
    expect(applyDevLoginAlias({ identifier: 'somchai', password: 'admin' }, dev).password).toBe('admin')
  })
})
