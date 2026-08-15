import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  ERROR_CATALOG,
  errorCodeStatus,
  isBlockingError,
  isKnownErrorCode,
  WARNING_ONLY_CODES,
  type ApiErrorCode,
} from '@/lib/api/error-catalog'
import { auditErrorStatus, AUDIT_ERROR_CODES } from '@/lib/audit/errors'
import { assignmentErrorStatus, ASSIGNMENT_ERROR_CODES } from '@/lib/assignments/errors'
import { caseErrorStatus, CASE_ERROR_CODES } from '@/lib/cases/errors'
import { authErrorStatus, AUTH_ERROR_CODES } from '@/lib/auth/errors'
import { compensationErrorStatus, COMPENSATION_ERROR_CODES } from '@/lib/compensation/errors'
import { financeCompanyErrorStatus, FINANCE_COMPANY_ERROR_CODES } from '@/lib/finance-companies/errors'
import { financeErrorStatus, FINANCE_ERROR_CODES } from '@/lib/finance/errors'
import { payeeErrorStatus, PAYEE_ERROR_CODES } from '@/lib/payees/errors'
import { adjustmentErrorStatus, ADJUSTMENT_ERROR_CODES } from '@/lib/adjustments/errors'
import { advanceErrorStatus, ADVANCE_ERROR_CODES } from '@/lib/advances/errors'
import { revenueErrorStatus, REVENUE_ERROR_CODES } from '@/lib/revenue/errors'
import { reportErrorStatus, REPORT_ERROR_CODES } from '@/lib/reports/errors'
import { payoutErrorStatus, PAYOUT_ERROR_CODES } from '@/lib/payout/errors'
import { roleErrorStatus, ROLE_ERROR_CODES } from '@/lib/roles/errors'
import { serviceFeeErrorStatus, SERVICE_FEE_ERROR_CODES } from '@/lib/service-fee/errors'
import { settingsErrorStatus, SETTINGS_ERROR_CODES } from '@/lib/settings/errors'
import { teamErrorStatus, TEAM_ERROR_CODES } from '@/lib/teams/errors'
import { userErrorStatus, USER_ERROR_CODES } from '@/lib/users/errors'
import { warehouseErrorStatus, WAREHOUSE_ERROR_CODES } from '@/lib/warehouse/errors'
import { fieldErrorStatus, FIELD_ERROR_CODES } from '@/lib/field/errors'

/**
 * Catalog ต้องตรงกับเอกสารทั้งสองทาง (Rule 04):
 * - ทุก code ในเอกสารต้องมีในทะเบียน (ไม่งั้นโมดูลจะไปตั้ง code เองซ้ำ)
 * - ทุก code ในทะเบียนต้องมีในเอกสารต้นทาง (ไม่งั้นคือ code ที่ตั้งเองในโค้ด)
 */

function doc(file: string): string {
  return readFileSync(fileURLToPath(new URL(`../../docs/${file}`, import.meta.url)), 'utf8')
}

function sectionOf(file: string, from: string, to: string): string {
  const source = doc(file)
  const start = source.indexOf(from)
  const end = source.indexOf(to, start + 1)
  expect(start, `${file}: หา "${from}" ไม่เจอ`).toBeGreaterThan(-1)
  expect(end, `${file}: หา "${to}" ไม่เจอ`).toBeGreaterThan(start)
  return source.slice(start, end)
}

/** code = ตัวพิมพ์ใหญ่ที่มี underscore หรือคำเดี่ยวยาว ๆ (`UNAUTHENTICATED`) — คำย่อสั้นถือเป็นคำอธิบาย */
const CODE_PATTERN = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*\b/g
const isCodeShaped = (token: string): boolean => token.includes('_') || token.length >= 10

/**
 * token ตัวพิมพ์ใหญ่ในตาราง error ที่ไม่ใช่ error code — enum ของ Fuel Rule (`PER_KM`/`DAILY_FLAT`),
 * คำสั่ง SQL, และคำย่อในคำอธิบาย
 */
const NOT_ERROR_CODES = new Set([
  'PER_KM',
  'DAILY_FLAT',
  'SUCCESS_FEE',
  'FLAT_FEE',
  'API',
  'DELETE',
  'UPDATE',
  'TRUNCATE',
  'UNIQUE',
  'VAT',
  'WHT',
  'GPS',
  'PROVINCE_DATA',
])

function codesIn(file: string, from: string, to: string): string[] {
  const found = sectionOf(file, from, to).match(CODE_PATTERN) ?? []
  return [...new Set(found)].filter((code) => isCodeShaped(code) && !NOT_ERROR_CODES.has(code))
}

const DOC_CODES: Record<string, string[]> = {
  '24 §6': codesIn('24-finance-validation-rules.md', '## 6. Validation Rules', '## 7. Validation Code Naming'),
  '38 §12': codesIn('38-case-submission.md', '## 12. Validation & Error Handling', '## 13.'),
  '40 §12': codesIn('40-case-assignment-routing.md', '## 12. Validation & Error Handling', '## 13.'),
  '41 §12': codesIn('41-field-tracker-mobile.md', '## 12. Validation & Error Handling', '## 13.'),
  '44 §12': codesIn('44-asset-custody-handover.md', '## 12. Validation & Error Handling', '## 13.'),
}

const ALL_DOC_CODES = new Set(Object.values(DOC_CODES).flat())

describe('error catalog ↔ เอกสาร', () => {
  it.each(Object.entries(DOC_CODES))('ทะเบียนครอบคลุม code ทุกตัวของ %s', (_source, codes) => {
    expect(codes.length).toBeGreaterThan(0)
    expect(codes.filter((code) => !isKnownErrorCode(code))).toEqual([])
  })

  it('ไม่มี code ที่ตั้งเองในโค้ดโดยไม่มีในเอกสาร', () => {
    expect(Object.keys(ERROR_CATALOG).filter((code) => !ALL_DOC_CODES.has(code))).toEqual([])
  })

  it('code ทุกตัวตั้งชื่อตาม convention `24` §7 (ตัวพิมพ์ใหญ่ + underscore)', () => {
    for (const code of Object.keys(ERROR_CATALOG)) expect(code).toMatch(/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/)
  })
})

describe('ความรุนแรงของ code', () => {
  it('code ที่ "เตือน ไม่ block" มี 6 ตัวเท่านั้น (Rule 04)', () => {
    expect([...WARNING_ONLY_CODES].sort()).toEqual([
      'ALREADY_MATCHED',
      'BANK_ACCOUNT_NAME_MISMATCH',
      'DUPLICATE_PAYMENT_FILE',
      'FILING_OVERDUE_WARNING',
      'IMEI_MISMATCH',
      'WHT_RATE_FALLBACK_TO_PLAN',
    ])
  })

  it('code ที่เตือนอย่างเดียวใช้ status 200 · code ที่ reject ต้อง ≥ 400', () => {
    for (const code of Object.keys(ERROR_CATALOG) as ApiErrorCode[]) {
      if (isBlockingError(code)) expect(errorCodeStatus(code), code).toBeGreaterThanOrEqual(400)
      else expect(errorCodeStatus(code), code).toBe(200)
    }
  })
})

/** โมดูลที่ implement ไปแล้วต้องใช้ status ตรงกับทะเบียน — กัน status เพี้ยนกันคนละที่ */
const MODULE_STATUS: Array<[string, readonly string[], (code: never) => number]> = [
  ['auth', AUTH_ERROR_CODES, authErrorStatus as (code: never) => number],
  ['audit', AUDIT_ERROR_CODES, auditErrorStatus as (code: never) => number],
  ['roles', ROLE_ERROR_CODES, roleErrorStatus as (code: never) => number],
  ['users', USER_ERROR_CODES, userErrorStatus as (code: never) => number],
  ['teams', TEAM_ERROR_CODES, teamErrorStatus as (code: never) => number],
  ['compensation', COMPENSATION_ERROR_CODES, compensationErrorStatus as (code: never) => number],
  ['service-fee', SERVICE_FEE_ERROR_CODES, serviceFeeErrorStatus as (code: never) => number],
  ['finance-companies', FINANCE_COMPANY_ERROR_CODES, financeCompanyErrorStatus as (code: never) => number],
  ['finance', FINANCE_ERROR_CODES, financeErrorStatus as (code: never) => number],
  ['adjustments', ADJUSTMENT_ERROR_CODES, adjustmentErrorStatus as (code: never) => number],
  ['advances', ADVANCE_ERROR_CODES, advanceErrorStatus as (code: never) => number],
  ['revenue', REVENUE_ERROR_CODES, revenueErrorStatus as (code: never) => number],
  ['reports', REPORT_ERROR_CODES, reportErrorStatus as (code: never) => number],
  ['payees', PAYEE_ERROR_CODES, payeeErrorStatus as (code: never) => number],
  ['payout', PAYOUT_ERROR_CODES, payoutErrorStatus as (code: never) => number],
  ['settings', SETTINGS_ERROR_CODES, settingsErrorStatus as (code: never) => number],
  ['cases', CASE_ERROR_CODES, caseErrorStatus as (code: never) => number],
  ['assignments', ASSIGNMENT_ERROR_CODES, assignmentErrorStatus as (code: never) => number],
  ['warehouse', WAREHOUSE_ERROR_CODES, warehouseErrorStatus as (code: never) => number],
  ['field', FIELD_ERROR_CODES, fieldErrorStatus as (code: never) => number],
]

/**
 * ยามของยามอีกที — โมดูลใหม่ที่ประกาศ `*_ERROR_CODES` แล้วลืมต่อเข้า `MODULE_STATUS` จะไม่มีอะไร
 * ตรวจ status ของมันเลย (ช่องโหว่ที่พบตอนรีวิว Phase 3: `advances`/`revenue`/`reports` หลุดไป 3 เฟส)
 */
describe('ทุกโมดูลที่มี errors.ts ถูกต่อเข้าการตรวจ status', () => {
  it('ไม่มีโมดูลไหนตกสำรวจ', async () => {
    const { globSync } = await import('node:fs')
    const root = fileURLToPath(new URL('../../', import.meta.url))
    const modules = globSync('lib/*/errors.ts', { cwd: root })
      .map((path) => path.split('/')[1])
      .filter((name) => name !== 'api')
      .sort()
    expect(modules).toEqual([...MODULE_STATUS.map(([name]) => name)].sort())
  })
})

describe('status ของโมดูลที่มีอยู่แล้ว', () => {
  it.each(MODULE_STATUS)('โมดูล %s ใช้ status ตรงกับทะเบียน', (_name, codes, statusOf) => {
    for (const code of codes) {
      expect(isKnownErrorCode(code), code).toBe(true)
      expect(errorCodeStatus(code as ApiErrorCode), code).toBe(statusOf(code as never))
    }
  })
})
