import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthError } from '@/lib/auth/errors'
import { resolveScope } from '@/lib/auth/scope'
import type { SessionUser } from '@/lib/auth/types'
import { clearReportCache } from '@/lib/reports/cache'
import { findReport } from '@/lib/reports/catalog'
import { ReportError } from '@/lib/reports/errors'
import type { ReportData } from '@/lib/reports/payload'
import { REPORT_PROVIDERS, type ReportProvider } from '@/lib/reports/providers'
import { resolveReportRange } from '@/lib/reports/range'
import { runReport } from '@/lib/reports/run'

/**
 * ตัวรันรายงานกลาง — ใช้ provider ปลอมเสียบทะเบียน (แนวเดียวกับที่ `engine.db.test.ts` ของ 5.3
 * สลับ `JOB_HANDLERS`) เพราะรายงานจริงเกิดใน 6.2–6.5
 */

const NOW = new Date('2026-08-15T03:00:00Z')
const RANGE = resolveReportRange({ preset: 'this_month' }, NOW)
const F1 = findReport('gross-profit')!
const E1 = findReport('kpi-summary')!

function userOf(options: {
  id: string
  capabilities: Record<string, 'view' | 'manage'>
  roleGroup?: 'system' | 'inhouse'
  managedTeamIds?: readonly string[]
  organizationId?: string
}): SessionUser {
  const roleGroup = options.roleGroup ?? 'system'
  return {
    id: options.id,
    organizationId: options.organizationId ?? 'org-1',
    supabaseUid: `uid-${options.id}`,
    email: `${options.id}@example.com`,
    fullName: options.id,
    status: 'active',
    roleId: 'role',
    roleName: roleGroup === 'system' ? 'การเงิน' : 'ผู้จัดการทีมติดตามทรัพย์',
    roleGroup,
    isSuperadmin: false,
    teamId: null,
    companyId: null,
    capabilities: options.capabilities,
    scope: resolveScope({
      userId: options.id,
      roleGroup,
      roleName: roleGroup === 'system' ? 'การเงิน' : 'ผู้จัดการทีมติดตามทรัพย์',
      teamId: null,
      companyId: null,
      managedTeamIds: options.managedTeamIds ?? [],
      supervisedTeamIds: [],
    }),
    loginAt: NOW.toISOString(),
  }
}

const finance = userOf({ id: 'finance-1', capabilities: { manage_billing: 'manage' } })
const financeOtherOrg = userOf({
  id: 'finance-2',
  capabilities: { manage_billing: 'manage' },
  organizationId: 'org-2',
})

function data(rows: number): ReportData {
  return {
    columns: [{ key: 'name', header: 'ชื่อ', type: 'text' }],
    rows: Array.from({ length: rows }, (_, index) => ({ name: `row-${index}` })),
  }
}

function register(id: string, provider: ReportProvider): void {
  REPORT_PROVIDERS[id] = provider
}

beforeEach(() => {
  clearReportCache()
})

afterEach(() => {
  delete REPORT_PROVIDERS[F1.id]
  delete REPORT_PROVIDERS[E1.id]
})

describe('runReport', () => {
  it('รายงานที่ยังไม่มี provider ⇒ REPORT_NOT_FOUND (ไม่คืนตัวเลขปลอม)', async () => {
    await expect(runReport(finance, F1, { range: RANGE, refresh: false, now: NOW })).rejects.toThrow(ReportError)
  })

  it('ตรวจสิทธิ์ก่อนเสมอ — ไม่มีสิทธิ์ต้อง 403 **ก่อน** provider ถูกเรียก', async () => {
    const provider = vi.fn(async () => data(1))
    register(E1.id, provider)

    await expect(runReport(finance, E1, { range: RANGE, refresh: false, now: NOW })).rejects.toThrow(AuthError)
    expect(provider).not.toHaveBeenCalled()
  })

  it('payload มีข้อมูลรายงาน/ช่วงเวลา/สถานะแคชครบ และแถวมาจาก provider ตรง ๆ', async () => {
    register(F1.id, async () => ({ ...data(2), note: 'หมายเหตุ' }))

    const payload = await runReport(finance, F1, { range: RANGE, refresh: false, now: NOW })

    expect(payload.report).toEqual({ code: 'F1', id: 'gross-profit', title: 'กำไรขั้นต้น', category: 'F' })
    expect(payload.range).toEqual({
      preset: 'this_month',
      label: 'สิงหาคม 2569',
      from: '2026-08-01',
      to: '2026-08-31',
    })
    expect(payload.rows).toHaveLength(2)
    expect(payload.note).toBe('หมายเหตุ')
    expect(payload.cache).toMatchObject({ mode: 'daily', fromCache: false, stale: false })
    expect(payload.cache.computedAt).toBe(NOW.toISOString())
  })

  it('แคชตามโหมดของรายงาน — เรียกซ้ำในวันเดียวกันไม่คำนวณใหม่', async () => {
    const provider = vi.fn(async () => data(1))
    register(F1.id, provider)

    await runReport(finance, F1, { range: RANGE, refresh: false, now: NOW })
    const second = await runReport(finance, F1, { range: RANGE, refresh: false, now: NOW })

    expect(second.cache.fromCache).toBe(true)
    expect(provider).toHaveBeenCalledTimes(1)
  })

  it('คีย์แคชแยกตามองค์กร — องค์กรอื่นต้องไม่ได้ผลลัพธ์ขององค์กรแรก', async () => {
    const provider = vi.fn(async (context) => data(context.user.organizationId === 'org-1' ? 1 : 3))
    register(F1.id, provider)

    const first = await runReport(finance, F1, { range: RANGE, refresh: false, now: NOW })
    const other = await runReport(financeOtherOrg, F1, { range: RANGE, refresh: false, now: NOW })

    expect(first.rows).toHaveLength(1)
    expect(other.rows).toHaveLength(3)
    expect(other.cache.fromCache).toBe(false)
    expect(provider).toHaveBeenCalledTimes(2)
  })

  it('คีย์แคชแยกตาม scope ทีม — ผู้จัดการคนละชุดทีมใช้แคชร่วมกันไม่ได้ (`96` §14)', async () => {
    const o1 = findReport('success-rate')!
    const seen: Array<readonly string[] | null> = []
    REPORT_PROVIDERS[o1.id] = async (context) => {
      seen.push(context.teamIds)
      return data(context.teamIds?.length ?? 0)
    }

    const managerA = userOf({
      id: 'manager-a',
      roleGroup: 'inhouse',
      capabilities: { assign_case: 'manage' },
      managedTeamIds: ['team-a'],
    })
    const managerB = userOf({
      id: 'manager-b',
      roleGroup: 'inhouse',
      capabilities: { assign_case: 'manage' },
      managedTeamIds: ['team-a', 'team-b'],
    })

    const a = await runReport(managerA, o1, { range: RANGE, refresh: false, now: NOW })
    const b = await runReport(managerB, o1, { range: RANGE, refresh: false, now: NOW })

    expect(a.rows).toHaveLength(1)
    expect(b.rows).toHaveLength(2)
    expect(seen).toEqual([['team-a'], ['team-a', 'team-b']])
    delete REPORT_PROVIDERS[o1.id]
  })

  it('คีย์แคชแยกตามช่วงเวลาและพารามิเตอร์ของรายงาน', async () => {
    const provider = vi.fn(async () => data(1))
    register(F1.id, provider)

    await runReport(finance, F1, { range: RANGE, refresh: false, now: NOW })
    await runReport(finance, F1, {
      range: resolveReportRange({ preset: 'last_month' }, NOW),
      refresh: false,
      now: NOW,
    })
    await runReport(finance, F1, { range: RANGE, refresh: false, params: { dimension: 'team' }, now: NOW })

    expect(provider).toHaveBeenCalledTimes(3)
  })

  it('รีเฟรชซ้ำภายใน 5 นาทีถูกชะลอ (E14) — ยังได้ข้อมูลเดิมพร้อมธง `refreshThrottled`', async () => {
    let rows = 1
    register(F1.id, async () => data(rows))

    await runReport(finance, F1, { range: RANGE, refresh: false, now: NOW })
    rows = 5
    const throttled = await runReport(finance, F1, { range: RANGE, refresh: true, now: NOW })
    expect(throttled.rows).toHaveLength(1)
    expect(throttled.cache.refreshThrottled).toBe(true)

    const later = await runReport(finance, F1, {
      range: RANGE,
      refresh: true,
      now: new Date(NOW.getTime() + 6 * 60_000),
    })
    expect(later.rows).toHaveLength(5)
    expect(later.cache.refreshThrottled).toBe(false)
  })
})
