import { describe, expect, it } from 'vitest'
import { errorCodeStatus, isKnownErrorCode, type ApiErrorCode } from '@/lib/api/error-catalog'
import {
  FINANCE_ERROR_CODES,
  FinanceError,
  financeErrorMessage,
  financeErrorStatus,
  isFinanceError,
} from '@/lib/finance/errors'

/** Rule 04 — code ทุกตัวต้องมาจากทะเบียนกลาง และมีข้อความไทยครบ */

describe('FinanceError', () => {
  it('ทุก code อยู่ในทะเบียนกลาง + status ตรงกัน', () => {
    for (const code of FINANCE_ERROR_CODES) {
      expect(isKnownErrorCode(code), code).toBe(true)
      expect(financeErrorStatus(code), code).toBe(errorCodeStatus(code as ApiErrorCode))
    }
  })

  it('ทุก code มีข้อความไทยครบทั้ง title และ message', () => {
    for (const code of FINANCE_ERROR_CODES) {
      const message = financeErrorMessage(code)
      expect(message.title.length, code).toBeGreaterThan(0)
      expect(message.message.length, code).toBeGreaterThan(0)
    }
  })

  it('error ที่โยนออกมาพก code/status/ข้อความผู้ใช้ครบ และ type guard ทำงาน', () => {
    const error = new FinanceError('INSUFFICIENT_APPROVAL_LEVEL', { detail: 'period_status=locked' })
    expect(isFinanceError(error)).toBe(true)
    expect(error.code).toBe('INSUFFICIENT_APPROVAL_LEVEL')
    expect(error.status).toBe(403)
    expect(error.userMessage).toBe(financeErrorMessage('INSUFFICIENT_APPROVAL_LEVEL').message)
    expect(error.detail).toBe('period_status=locked')
    expect(isFinanceError(new Error('อื่น ๆ'))).toBe(false)
  })
})
