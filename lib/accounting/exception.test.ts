import { describe, expect, it } from 'vitest'
import { isAccountingError } from '@/lib/accounting/errors'
import {
  assertAuthorizeNote,
  assertExceptionEditable,
  assertExceptionTransition,
  assertExportNotBlocked,
  blockingCriticalOf,
  canTransitionException,
  EXCEPTION_TRANSITIONS,
  summarizeExceptions,
  type BlockingException,
  type ExceptionRow,
} from '@/lib/accounting/exception'

/** `34` §16 + `23` §6.12 — สถานะมี 3 ตัวเท่านั้น ไม่มี `in_progress` */

function codeOf(run: () => void): string {
  try {
    run()
  } catch (error) {
    if (isAccountingError(error)) return error.code
    throw error
  }
  return 'NO_ERROR'
}

const row = (level: ExceptionRow['level'], status: ExceptionRow['status']): ExceptionRow => ({ level, status })

const blocking = (id: string, level: BlockingException['level'], status: BlockingException['status']): BlockingException => ({
  id,
  level,
  status,
  title: `ปัญหา ${id}`,
  sourceModule: 'billing',
})

describe('state machine ของ exception (`23` §6.12)', () => {
  it('มีเฉพาะ open → resolved / open → authorized', () => {
    expect(EXCEPTION_TRANSITIONS.open).toEqual(['resolved', 'authorized'])
    expect(EXCEPTION_TRANSITIONS.resolved).toEqual([])
    expect(EXCEPTION_TRANSITIONS.authorized).toEqual([])
  })

  it('resolved/authorized เป็น terminal — เปลี่ยนซ้ำไม่ได้', () => {
    expect(canTransitionException('resolved', 'authorized')).toBe(false)
    expect(codeOf(() => assertExceptionTransition('authorized', 'resolved'))).toBe('EXCEPTION_INVALID_STATUS')
  })

  it('แก้รายละเอียดได้เฉพาะขณะ open (`34` §14)', () => {
    expect(() => assertExceptionEditable('open')).not.toThrow()
    expect(codeOf(() => assertExceptionEditable('resolved'))).toBe('EXCEPTION_INVALID_STATUS')
    expect(codeOf(() => assertExceptionEditable('authorized'))).toBe('EXCEPTION_INVALID_STATUS')
  })
})

describe('authorize ต้องมีเหตุผลเสมอ (`34` §11)', () => {
  it('เว้นว่าง/ช่องว่างล้วน → AUTHORIZED_EXCEPTION_REASON_REQUIRED', () => {
    expect(codeOf(() => assertAuthorizeNote(''))).toBe('AUTHORIZED_EXCEPTION_REASON_REQUIRED')
    expect(codeOf(() => assertAuthorizeNote('   '))).toBe('AUTHORIZED_EXCEPTION_REASON_REQUIRED')
  })

  it('กรอกแล้วคืนค่าที่ตัดช่องว่างหัวท้าย', () => {
    expect(assertAuthorizeNote('  ผู้บริหารรับความเสี่ยงรอบนี้  ')).toBe('ผู้บริหารรับความเสี่ยงรอบนี้')
  })
})

describe('สรุปยอดแยกหมวดเสมอ (มาตรการกันหายเงียบข้อ 1 — `34` §6.3)', () => {
  const rows: ExceptionRow[] = [
    row('critical', 'open'),
    row('critical', 'authorized'),
    row('critical', 'resolved'),
    row('warning', 'open'),
    row('info', 'resolved'),
  ]

  it('authorized ไม่ถูกนับปนกับ resolved', () => {
    const summary = summarizeExceptions(rows)
    expect(summary.authorized).toEqual({ critical: 1, warning: 0, info: 0, total: 1 })
    expect(summary.resolved).toEqual({ critical: 1, warning: 0, info: 1, total: 2 })
    expect(summary.open).toEqual({ critical: 1, warning: 1, info: 0, total: 2 })
  })

  it('critical/warning count เป็น derived นับสดจากแถว (`30` §7.1)', () => {
    const summary = summarizeExceptions(rows)
    expect(summary.criticalCount).toBe(3)
    expect(summary.warningCount).toBe(1)
    expect(summary.blockingCritical).toBe(1)
  })

  it('ไม่มีแถว = ศูนย์ทุกช่อง', () => {
    const summary = summarizeExceptions([])
    expect(summary.blockingCritical).toBe(0)
    expect(summary.open.total).toBe(0)
  })
})

describe('ตัวบล็อก Export (`34` §16)', () => {
  it('critical ที่ open เท่านั้นที่บล็อก — warning ไม่บล็อก', () => {
    const rows = [blocking('a', 'critical', 'open'), blocking('b', 'warning', 'open')]
    expect(blockingCriticalOf(rows).map((r) => r.id)).toEqual(['a'])
    expect(codeOf(() => assertExportNotBlocked(rows))).toBe('EXPORT_BLOCKED_CRITICAL')
  })

  it('authorize แล้วไม่บล็อกอีก (สำหรับรอบนั้น)', () => {
    const rows = [blocking('a', 'critical', 'authorized'), blocking('b', 'critical', 'resolved')]
    expect(blockingCriticalOf(rows)).toEqual([])
    expect(() => assertExportNotBlocked(rows)).not.toThrow()
  })

  it('error พก id ของรายการที่ต้องแก้กลับไปให้ผู้ใช้', () => {
    try {
      assertExportNotBlocked([blocking('a', 'critical', 'open')])
      expect.unreachable('ต้องโยน EXPORT_BLOCKED_CRITICAL')
    } catch (error) {
      if (!isAccountingError(error)) throw error
      expect(error.context?.blockingExceptions).toEqual([{ id: 'a', title: 'ปัญหา a', sourceModule: 'billing' }])
    }
  })
})
