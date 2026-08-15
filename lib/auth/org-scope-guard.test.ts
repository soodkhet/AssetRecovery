import { describe, expect, it } from 'vitest'
import { AuthError } from '@/lib/auth/errors'
import { assertOrgWideReadable } from '@/lib/auth/scope'
import type { ScopeKind, SessionUser } from '@/lib/auth/types'
import { listExceptions, listPeriods, getPeriodReadiness } from '@/lib/accounting/queries'
import { listAccountantQuestions } from '@/lib/accounting/question-queries'
import { listBankTransactions, listMatchCandidates } from '@/lib/bank-recon/queries'
import { listExportHistory, findExportRecord } from '@/lib/exports/queries'
import { listExpenseRecords } from '@/lib/expenses/queries'
import { listWhtCertificates, listWhtFilingSummaries } from '@/lib/wht/queries'

/**
 * ยาม scope ของ **ทรัพยากรระดับองค์กร** (Phase 8.2 · DEC-002 · Rule 03)
 *
 * ตารางกลุ่มนี้ (รอบบัญชี / ชุดส่งบัญชี / ใบหัก ณ ที่จ่าย / รายการเดินบัญชี / รายการค่าใช้จ่ายบัญชี)
 * **ไม่มีคอลัมน์บริษัท/ทีม** ให้กรองรายแถว ⇒ ต้องปฏิเสธทั้งก้อนที่ชั้นข้อมูล ไม่ใช่พึ่ง capability
 * อย่างเดียว — วันที่ Superadmin ผูก capability ให้ role ฝั่งบริษัทไฟแนนซ์จากหน้า Settings
 * `requirePermission()` ที่ route จะปล่อยผ่านทันที
 *
 * เทสต์นี้เรียก **ฟังก์ชันจริงของทุกโมดูล** ไม่ใช่แค่ตัว util — ยามอยู่บรรทัดแรกก่อนแตะ DB
 * ⇒ ถ้ามีใครถอดยามออก เทสต์จะพังโดยไม่ต้องมี DB
 */

const NON_GLOBAL_SCOPES: readonly ScopeKind[] = ['company', 'team', 'self']

function sessionUser(kind: ScopeKind): SessionUser {
  return {
    id: 'user-1',
    organizationId: 'org-1',
    supabaseUid: 'uid-1',
    email: 'u@example.com',
    fullName: 'ผู้ใช้ทดสอบ',
    status: 'active',
    roleId: 'role-1',
    roleName: 'ผู้จัดการบริษัทไฟแนนซ์',
    roleGroup: kind === 'company' ? 'finance_company' : 'inhouse',
    isSuperadmin: false,
    teamId: null,
    companyId: kind === 'company' ? 'company-1' : null,
    // จำลองเคสที่ admin ผูก capability ของงานบัญชีให้ role กลุ่มนี้ (ยามที่ route จะปล่อยผ่าน)
    capabilities: {
      manage_accounting_period: 'manage',
      manage_wht: 'manage',
      manage_sales_expenses: 'manage',
      export_accounting_pack: 'manage',
      manage_bank_reconciliation: 'manage',
    },
    scope: {
      kind,
      teamIds: kind === 'team' ? ['team-1'] : [],
      companyId: kind === 'company' ? 'company-1' : null,
      userId: 'user-1',
    },
    loginAt: new Date().toISOString(),
  }
}

const GLOBAL_USER = sessionUser('global')

/** ทุกจุดเข้าที่ต้องมียาม — `run` ต้องโยนก่อนแตะ DB (เทสต์นี้ไม่มี DB ให้แตะ) */
const ENTRY_POINTS: readonly { name: string; run: (user: SessionUser) => Promise<unknown> }[] = [
  { name: 'accounting: listPeriods', run: (u) => listPeriods({ actor: u, meta: {} as never }, {} as never) },
  { name: 'accounting: getPeriodReadiness', run: (u) => getPeriodReadiness(u, 'period-1') },
  { name: 'accounting: listExceptions', run: (u) => listExceptions(u, {} as never) },
  { name: 'accounting: listAccountantQuestions', run: (u) => listAccountantQuestions(u, {} as never) },
  { name: 'expenses: listExpenseRecords', run: (u) => listExpenseRecords(u, {} as never) },
  { name: 'exports: listExportHistory', run: (u) => listExportHistory(u, {} as never) },
  { name: 'exports: findExportRecord', run: (u) => findExportRecord(u, 'export-1') },
  { name: 'wht: listWhtCertificates', run: (u) => listWhtCertificates(u, {} as never) },
  { name: 'wht: listWhtFilingSummaries', run: (u) => listWhtFilingSummaries(u, {} as never) },
  { name: 'bank-recon: listBankTransactions', run: (u) => listBankTransactions(u, {} as never) },
  { name: 'bank-recon: listMatchCandidates', run: (u) => listMatchCandidates(u, {} as never) },
]

describe('assertOrgWideReadable', () => {
  it('scope global ผ่าน (ข้อจำกัดเชิงหน้าที่มาจาก capability ไม่ใช่ scope)', () => {
    expect(() => assertOrgWideReadable(GLOBAL_USER, 'accounting-periods')).not.toThrow()
  })

  it.each(NON_GLOBAL_SCOPES)('scope %s ถูกปฏิเสธด้วย PERMISSION_DENIED (403)', (kind) => {
    try {
      assertOrgWideReadable(sessionUser(kind), 'accounting-periods')
      expect.unreachable('ต้องโยน AuthError')
    } catch (error) {
      expect(error).toBeInstanceOf(AuthError)
      expect((error as AuthError).code).toBe('PERMISSION_DENIED')
    }
  })

  it('ข้อความ error ไม่บอกว่ามีข้อมูลอยู่จริงไหม (`25` ห้าม leak)', () => {
    try {
      assertOrgWideReadable(sessionUser('company'), 'wht-certificates')
      expect.unreachable('ต้องโยน AuthError')
    } catch (error) {
      expect((error as AuthError).message).not.toMatch(/company-1|org-1/)
    }
  })
})

describe('ยามถูกต่อสายจริงในทุกโมดูลระดับองค์กร (accounting / exports / wht / bank-recon / expense-records)', () => {
  for (const entry of ENTRY_POINTS) {
    it.each(NON_GLOBAL_SCOPES)(`${entry.name} — scope %s ต้อง 403 ก่อนแตะ DB`, async (kind) => {
      await expect(entry.run(sessionUser(kind))).rejects.toMatchObject({
        code: 'PERMISSION_DENIED',
      })
    })
  }
})
