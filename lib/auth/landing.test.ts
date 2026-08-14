import { describe, expect, it } from 'vitest'
import { resolveLandingPath } from '@/lib/auth/landing'
import {
  CLIENT_PORTAL_PATH,
  DASHBOARD_PATH,
  FIELD_AGENT_ROLE_NAME,
  FIELD_TRACKER_PATH,
  SUPERADMIN_ROLE_NAME,
} from '@/lib/auth/constants'

describe('resolveLandingPath — redirect ตาม role หลัง login (`05` §6.1)', () => {
  it('บริษัทไฟแนนซ์ → Client Portal', () => {
    expect(resolveLandingPath('finance_company', 'ผู้จัดการ')).toBe(CLIENT_PORTAL_PATH)
    expect(resolveLandingPath('finance_company', 'แอดมิน')).toBe(CLIENT_PORTAL_PATH)
  })

  it('พนักงานติดตามทรัพย์ (inhouse/outsource) → Field Tracker', () => {
    expect(resolveLandingPath('inhouse', FIELD_AGENT_ROLE_NAME)).toBe(FIELD_TRACKER_PATH)
    expect(resolveLandingPath('outsource', FIELD_AGENT_ROLE_NAME)).toBe(FIELD_TRACKER_PATH)
  })

  it('role อื่น → แดชบอร์ดหลัก', () => {
    expect(resolveLandingPath('system', SUPERADMIN_ROLE_NAME)).toBe(DASHBOARD_PATH)
    expect(resolveLandingPath('system', 'บัญชี')).toBe(DASHBOARD_PATH)
    expect(resolveLandingPath('inhouse', 'ผู้จัดการทีมติดตามทรัพย์')).toBe(DASHBOARD_PATH)
  })
})
