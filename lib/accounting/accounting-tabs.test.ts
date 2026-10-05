import { describe, expect, it } from 'vitest'
import {
  ACCOUNTING_TABS,
  DEFAULT_ACCOUNTING_TAB,
  resolveAccountingTab,
  visibleAccountingTabs,
} from '@/lib/accounting/accounting-tabs'
import { EXCEPTION_READ_CAPABILITIES } from '@/lib/accounting/exception'
import { PERIOD_READ_CAPABILITIES } from '@/lib/accounting/period'
import { QUESTION_READ_CAPABILITIES } from '@/lib/accounting/question'
import { ACCOUNTING_ROLE_NAME, EXECUTIVE_ROLE_NAME, FINANCE_ROLE_NAME } from '@/lib/auth/constants'
import type { CapabilityHolder } from '@/lib/auth/permission'
import { MANAGE_BANK_RECONCILIATION } from '@/lib/bank-recon/matching'
import { MANAGE_CUSTOMER_WHT } from '@/lib/customer-wht/customer-wht'
import { EXPENSE_RECORD_READ_CAPABILITIES } from '@/lib/expenses/expense-record'
import { EXPORT_READ_CAPABILITIES } from '@/lib/exports/pack'
import type { CapabilityAccessLevel, RoleGroup } from '@/lib/generated/prisma/enums'
import { DEFAULT_ROLE_CAPABILITIES } from '@/lib/roles/default-matrix'
import { SALES_READ_CAPABILITIES } from '@/lib/sales/sales'
import { WHT_READ_CAPABILITIES } from '@/lib/wht/wht'

const SUPER: CapabilityHolder = { isSuperadmin: true, capabilities: {} }

/** สิทธิ์ตั้งต้นของ role ตาม seed (`lib/roles/default-matrix.ts`) */
function roleHolder(name: string, roleGroup: RoleGroup): CapabilityHolder {
  const capabilities: Record<string, CapabilityAccessLevel> = {}
  for (const grant of DEFAULT_ROLE_CAPABILITIES) {
    if (grant.role.name === name && grant.role.roleGroup === roleGroup) capabilities[grant.capabilityCode] = grant.level
  }
  return { isSuperadmin: false, capabilities }
}

const tabIds = (holder: CapabilityHolder) => visibleAccountingTabs(holder).map((tab) => tab.id)

/**
 * ยามของทะเบียนแท็บหน้าบัญชี (`06` §8 · mockup `accounting.html`) — เปิดแท็บใหม่ต้องแก้ที่นี่ที่เดียว
 * และแท็บที่ยังไม่เกิดต้องระบุ Phase ปลายทางเสมอ (ไม่งั้นปุ่มเทาจะไม่บอกอะไรผู้ใช้เลย)
 */

describe('ทะเบียนแท็บหน้าบัญชี', () => {
  it('มี 10 แท็บ (ไฟล์ 30–37 + 50 ทวิ ลูกค้า มติ PO U40) และ id ไม่ซ้ำ', () => {
    expect(ACCOUNTING_TABS).toHaveLength(10)
    expect(new Set(ACCOUNTING_TABS.map((tab) => tab.id)).size).toBe(10)
  })

  it('แท็บที่ยังไม่เปิดต้องบอก Phase ที่จะเกิด · แท็บที่เปิดแล้วไม่ต้องมี', () => {
    for (const tab of ACCOUNTING_TABS) {
      if (tab.available) expect(tab.plannedPhase, tab.id).toBeUndefined()
      else expect(tab.plannedPhase, tab.id).toBeTypeOf('string')
    }
  })

  it('ครบทั้ง 9 แท็บตั้งแต่ Phase 4.7 — ไม่มีแท็บเทาเหลือแล้ว', () => {
    expect(ACCOUNTING_TABS.filter((tab) => tab.available).map((tab) => tab.id)).toEqual([
      'closing',
      'sales',
      'receipts',
      'expenses',
      'bank',
      'wht',
      'documents',
      'qa',
      'export',
      'customer-wht',
    ])
  })

  it('`?tab=` ที่ไม่มีจริง ตกกลับแท็บเริ่มต้นเสมอ', () => {
    expect(resolveAccountingTab('qa', SUPER)).toBe('qa')
    expect(resolveAccountingTab('closing', SUPER)).toBe('closing')
    expect(resolveAccountingTab('documents', SUPER)).toBe('documents')
    expect(resolveAccountingTab('export', SUPER)).toBe('export')
    expect(resolveAccountingTab('ไม่มีจริง', SUPER)).toBe(DEFAULT_ACCOUNTING_TAB)
    expect(resolveAccountingTab(undefined, SUPER)).toBe(DEFAULT_ACCOUNTING_TAB)
  })

  it('แท็บเริ่มต้นต้องเป็นแท็บที่เปิดใช้งานแล้วจริง', () => {
    expect(ACCOUNTING_TABS.find((tab) => tab.id === DEFAULT_ACCOUNTING_TAB)?.available).toBe(true)
  })
})

describe('BUG-158 — ซ่อนแท็บที่ API อ่านไม่ได้ (ไม่โชว์การ์ด ฿0.00 + ตาราง "ไม่มีสิทธิ์ใช้งาน")', () => {
  it('capability ของแต่ละแท็บตรงกับ endpoint อ่านหลักที่แท็บเรียก', () => {
    const byId = new Map(ACCOUNTING_TABS.map((tab) => [tab.id, [...tab.capabilities]]))
    expect(byId.get('closing')).toEqual([...PERIOD_READ_CAPABILITIES])
    expect(byId.get('sales')).toEqual([...SALES_READ_CAPABILITIES])
    expect(byId.get('receipts')).toEqual([...SALES_READ_CAPABILITIES])
    expect(byId.get('expenses')).toEqual([...EXPENSE_RECORD_READ_CAPABILITIES])
    expect(byId.get('bank')).toEqual([MANAGE_BANK_RECONCILIATION])
    expect(byId.get('wht')).toEqual([...WHT_READ_CAPABILITIES])
    expect(byId.get('documents')).toEqual([...EXCEPTION_READ_CAPABILITIES])
    expect(byId.get('qa')).toEqual([...QUESTION_READ_CAPABILITIES])
    expect(byId.get('export')).toEqual([...EXPORT_READ_CAPABILITIES])
    expect(byId.get('customer-wht')).toEqual([MANAGE_CUSTOMER_WHT])
  })

  it('บริหารไม่เห็นแท็บกระทบยอด · `?tab=bank` ตกกลับแท็บที่เห็น', () => {
    const executive = roleHolder(EXECUTIVE_ROLE_NAME, 'system')
    expect(tabIds(executive)).not.toContain('bank')
    expect(resolveAccountingTab('bank', executive)).not.toBe('bank')
    expect(tabIds(executive)).toContain(resolveAccountingTab('bank', executive))
  })

  it('บัญชีเห็นแท็บกระทบยอด · Superadmin เห็นครบทุกแท็บ', () => {
    expect(tabIds(roleHolder(ACCOUNTING_ROLE_NAME, 'system'))).toContain('bank')
    expect(tabIds(SUPER)).toEqual(ACCOUNTING_TABS.map((tab) => tab.id))
  })

  it('ไม่มีสิทธิ์อ่านแท็บใดเลย ⇒ ไม่มีแท็บให้เห็น (ไม่มีปุ่มหลอก)', () => {
    expect(tabIds({ isSuperadmin: false, capabilities: {} })).toEqual([])
    expect(resolveAccountingTab('bank', { isSuperadmin: false, capabilities: {} })).toBe(DEFAULT_ACCOUNTING_TAB)
  })

  it('สรุปแท็บที่เห็นตาม role ตั้งต้น (ล็อกไว้กันหลุด)', () => {
    expect({
      executive: tabIds(roleHolder(EXECUTIVE_ROLE_NAME, 'system')),
      finance: tabIds(roleHolder(FINANCE_ROLE_NAME, 'system')),
    }).toEqual({
      executive: ['closing', 'documents', 'customer-wht'],
      finance: ['sales', 'receipts', 'expenses', 'bank', 'wht', 'documents', 'qa', 'export', 'customer-wht'],
    })
  })
})
