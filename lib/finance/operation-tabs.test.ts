import { describe, expect, it } from 'vitest'
import {
  EXECUTIVE_ROLE_NAME,
  FINANCE_ROLE_NAME,
  TEAM_MANAGER_ROLE_NAME,
  TEAM_SUPERVISOR_ROLE_NAME,
} from '@/lib/auth/constants'
import type { CapabilityHolder } from '@/lib/auth/permission'
import {
  DEFAULT_FINANCE_OPERATION_TAB,
  FINANCE_OPERATION_TABS,
  resolveFinanceOperationTab,
  visibleFinanceOperationTabs,
} from '@/lib/finance/operation-tabs'
import type { CapabilityAccessLevel, RoleGroup } from '@/lib/generated/prisma/enums'
import { DEFAULT_ROLE_CAPABILITIES } from '@/lib/roles/default-matrix'

const SUPER: CapabilityHolder = { isSuperadmin: true, capabilities: {} }

/** สิทธิ์ตั้งต้นของ role ตาม seed (`lib/roles/default-matrix.ts`) */
function roleHolder(name: string, roleGroup: RoleGroup): CapabilityHolder {
  const capabilities: Record<string, CapabilityAccessLevel> = {}
  for (const grant of DEFAULT_ROLE_CAPABILITIES) {
    if (grant.role.name === name && grant.role.roleGroup === roleGroup) capabilities[grant.capabilityCode] = grant.level
  }
  return { isSuperadmin: false, capabilities }
}

const tabIds = (holder: CapabilityHolder) => visibleFinanceOperationTabs(holder).map((tab) => tab.id)

/** ยามของโครงหน้าการเงิน (`06` §8 · mockup `finance.html`) — เพิ่ม/ลบแท็บต้องตั้งใจเสมอ */

describe('แท็บหน้าการเงิน', () => {
  it('มี 9 แท็บตามไฟล์ 14–21', () => {
    expect(FINANCE_OPERATION_TABS).toHaveLength(9)
  })

  it('id ไม่ซ้ำกัน', () => {
    const ids = FINANCE_OPERATION_TABS.map((tab) => tab.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  // Final Test ด่าน 5 (Phase 8.3) — `payee` เคยเป็นปุ่มเทาถาวร → เคยเป็นลิงก์ข้ามไปหน้าตั้งค่าการเงิน
  // ซึ่งการเงินเข้าไม่ได้ (UAT R6-C) ⇒ ตอนนี้เป็นแท็บในหน้าการเงินเองตาม mockup `finance.html`
  it('ทุกแท็บใช้งานได้จริงในหน้านี้ — ไม่มีลิงก์ข้าม route (payee อยู่ในหน้าการเงิน)', () => {
    expect(FINANCE_OPERATION_TABS.filter((tab) => !tab.available)).toEqual([])
    expect(FINANCE_OPERATION_TABS.filter((tab) => tab.href !== undefined)).toEqual([])
    expect(resolveFinanceOperationTab('payee', SUPER)).toBe('payee')
  })

  it('UAT R6-C — การเงินเปิดแท็บผู้รับเงินในหน้าการเงินได้ (การเงินคุม payee)', () => {
    expect(resolveFinanceOperationTab('payee', roleHolder(FINANCE_ROLE_NAME, 'system'))).toBe('payee')
  })

  it('แท็บเริ่มต้น = "ภาพรวม" (`14` §1 — หน้าแรกของโมดูลการเงิน)', () => {
    expect(DEFAULT_FINANCE_OPERATION_TAB).toBe('dashboard')
  })

  it('แท็บที่ยังไม่เปิดต้องบอก Phase ปลายทางเสมอ (ไม่ปล่อยปุ่มหลอก)', () => {
    for (const tab of FINANCE_OPERATION_TABS.filter((item) => !item.available)) {
      expect(tab.plannedPhase, `แท็บ ${tab.id} ไม่ได้ระบุ phase`).toBeTruthy()
    }
  })

  it('`?tab=` ที่ชี้แท็บยังไม่เกิด/ไม่มีจริง/ไม่มีสิทธิ์ ตกกลับแท็บเริ่มต้น', () => {
    expect(resolveFinanceOperationTab('payee', roleHolder(EXECUTIVE_ROLE_NAME, 'system'))).toBe(
      DEFAULT_FINANCE_OPERATION_TAB,
    )
    expect(resolveFinanceOperationTab('ไม่มีแท็บนี้', SUPER)).toBe(DEFAULT_FINANCE_OPERATION_TAB)
    expect(resolveFinanceOperationTab(undefined, SUPER)).toBe(DEFAULT_FINANCE_OPERATION_TAB)
  })

  it('แท็บที่เปิดแล้วถูกเลือกได้ตรงตัว', () => {
    expect(resolveFinanceOperationTab('comp', SUPER)).toBe('comp')
    expect(resolveFinanceOperationTab('payout', SUPER)).toBe('payout')
    expect(resolveFinanceOperationTab('approval', SUPER)).toBe('approval')
    expect(resolveFinanceOperationTab('revenue', SUPER)).toBe('revenue')
    expect(resolveFinanceOperationTab('adjustment', SUPER)).toBe('adjustment')
    expect(resolveFinanceOperationTab('profit', SUPER)).toBe('profit')
    expect(resolveFinanceOperationTab('dashboard', SUPER)).toBe('dashboard')
  })

  it('ผู้จัดการทีม (ผู้อนุมัติขั้น 1) เห็นเฉพาะแท็บคิวอนุมัติค่าตอบแทน — มติ PO 03/10/2569 (UAT R6-A)', () => {
    for (const group of ['inhouse', 'outsource'] as const) {
      const manager = roleHolder(TEAM_MANAGER_ROLE_NAME, group)
      expect(tabIds(manager)).toEqual(['comp'])
      expect(resolveFinanceOperationTab(undefined, manager)).toBe('comp')
      expect(resolveFinanceOperationTab('payout', manager)).toBe('comp')
    }
  })

  it('หัวหน้าทีมที่ไม่ได้เป็นผู้อนุมัติตาม matrix ไม่เห็นแท็บใดเลย', () => {
    expect(tabIds(roleHolder(TEAM_SUPERVISOR_ROLE_NAME, 'inhouse'))).toEqual([])
  })

  it('การเงินเห็นครบทุกแท็บ', () => {
    expect(tabIds(roleHolder(FINANCE_ROLE_NAME, 'system'))).toEqual(FINANCE_OPERATION_TABS.map((tab) => tab.id))
  })

  it('Superadmin เห็นครบทุกแท็บ', () => {
    expect(tabIds(SUPER)).toHaveLength(FINANCE_OPERATION_TABS.length)
  })

  it('บริหารไม่เห็นแท็บที่ API อ่านไม่ได้ (เงินทดรอง/ผู้รับเงิน) — ซ่อนแทนการโชว์ตารางว่าง', () => {
    const executive = tabIds(roleHolder(EXECUTIVE_ROLE_NAME, 'system'))
    expect(executive).not.toContain('advances')
    expect(executive).not.toContain('payee')
    expect(executive).toContain('comp')
  })
})
