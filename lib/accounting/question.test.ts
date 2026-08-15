import { describe, expect, it } from 'vitest'
import { AccountingError } from '@/lib/accounting/errors'
import {
  assertAnswerable,
  questionStatusLabel,
  questionStatusOf,
  QUESTION_STATUS_GROUP,
  summarizeQuestions,
} from '@/lib/accounting/question'

/** เทสต์ของไฟล์ 36 §15 + §6.1/§8 — pure ทั้งหมด */

describe('สถานะเก็บเป็น is_resolved (`36` §6.1)', () => {
  it('false = open · true = answered', () => {
    expect(questionStatusOf(false)).toBe('open')
    expect(questionStatusOf(true)).toBe('answered')
  })

  it('ป้ายไทยตรงกับสถานะ', () => {
    expect(questionStatusLabel(false)).toBe('รอตอบ')
    expect(questionStatusLabel(true)).toBe('ตอบแล้ว')
  })

  it('สีมาจากกลุ่มของ mapper กลาง (`04` §8.1) — ค้างตอบ = แดง', () => {
    expect(QUESTION_STATUS_GROUP.open).toBe('critical')
    expect(QUESTION_STATUS_GROUP.answered).toBe('partial')
  })
})

describe('ตอบได้ครั้งเดียว (`36` §8)', () => {
  it('ยังไม่ตอบ ⇒ ตอบได้', () => {
    expect(() => assertAnswerable(false, 'q-1')).not.toThrow()
  })

  it('ตอบไปแล้ว ⇒ ACCOUNTANT_QUESTION_ALREADY_ANSWERED (400)', () => {
    try {
      assertAnswerable(true, 'q-1')
      expect.unreachable('ต้องโยน error')
    } catch (error) {
      expect(error).toBeInstanceOf(AccountingError)
      expect((error as AccountingError).code).toBe('ACCOUNTANT_QUESTION_ALREADY_ANSWERED')
      expect((error as AccountingError).status).toBe(400)
    }
  })
})

describe('สรุปจำนวน (`36` §7)', () => {
  it('นับค้างตอบ/ตอบแล้วแยกกัน', () => {
    expect(summarizeQuestions([{ isResolved: false }, { isResolved: true }, { isResolved: false }])).toEqual({
      total: 3,
      open: 2,
      answered: 1,
    })
  })

  it('ไม่มีคำถาม = ศูนย์ทุกช่อง', () => {
    expect(summarizeQuestions([])).toEqual({ total: 0, open: 0, answered: 0 })
  })
})
