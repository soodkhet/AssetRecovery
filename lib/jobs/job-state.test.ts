import { describe, expect, it } from 'vitest'
import {
  canManualRetry,
  isDeadLetter,
  jobViewStatus,
  JOB_MAX_RETRIES_DEFAULT,
  JOB_STATUS_GROUP,
  JOB_STATUS_LABEL,
  nextAttemptAfterFailure,
  retryBackoffMinutes,
} from '@/lib/jobs/job-state'

/**
 * State machine ของ Background Job (`91` §6.2) + Test Case §16 "Dead letter"
 * ("job fail เกิน max_retries → ต้องเข้าสถานะ dead_letter ไม่ retry ต่อเองอัตโนมัติ")
 */

const NOW = new Date('2026-08-15T10:00:00.000Z')

function job(overrides: Partial<Parameters<typeof isDeadLetter>[0]> = {}) {
  return { status: 'pending' as const, retryCount: 0, maxRetries: JOB_MAX_RETRIES_DEFAULT, ...overrides }
}

describe('dead letter derive จาก retry_count (`91` §6.2)', () => {
  it('`failed` ที่ยังไม่ครบเพดาน = ยังไม่ dead letter', () => {
    expect(isDeadLetter(job({ status: 'failed', retryCount: 2, maxRetries: 3 }))).toBe(false)
    expect(jobViewStatus(job({ status: 'failed', retryCount: 2, maxRetries: 3 }))).toBe('failed')
  })

  it('`failed` ที่ครบเพดานแล้ว = dead letter', () => {
    expect(isDeadLetter(job({ status: 'failed', retryCount: 3, maxRetries: 3 }))).toBe(true)
    expect(jobViewStatus(job({ status: 'failed', retryCount: 3, maxRetries: 3 }))).toBe('dead_letter')
  })

  it('สถานะอื่นไม่มีทางเป็น dead letter แม้ retry เต็มเพดาน', () => {
    for (const status of ['pending', 'running', 'completed', 'cancelled'] as const) {
      expect(isDeadLetter(job({ status, retryCount: 9, maxRetries: 3 })), status).toBe(false)
      expect(jobViewStatus(job({ status, retryCount: 9, maxRetries: 3 })), status).toBe(status)
    }
  })

  it('ทุกสถานะบนหน้าจอมีชื่อไทยและสีจาก 10 กลุ่มกลาง (`04` §8.1)', () => {
    for (const status of ['pending', 'running', 'completed', 'failed', 'dead_letter', 'cancelled'] as const) {
      expect(JOB_STATUS_LABEL[status], status).toBeTruthy()
      expect(JOB_STATUS_GROUP[status], status).toBeTruthy()
    }
  })
})

describe('รอบ retry อัตโนมัติ + backoff', () => {
  it('ถอยเวลาเพิ่มขึ้นตามจำนวนครั้งแล้วคงที่ที่ 60 นาที', () => {
    expect(retryBackoffMinutes(1)).toBe(1)
    expect(retryBackoffMinutes(2)).toBe(5)
    expect(retryBackoffMinutes(3)).toBe(15)
    expect(retryBackoffMinutes(4)).toBe(60)
    expect(retryBackoffMinutes(99)).toBe(60)
    // ค่าที่เป็นไปไม่ได้ (0/ติดลบ) ต้องไม่ทำให้คำนวณพัง
    expect(retryBackoffMinutes(0)).toBe(1)
  })

  it('ล้มครั้งแรก → กลับเข้าคิวพร้อมเวลาถอย 1 นาที', () => {
    const next = nextAttemptAfterFailure(job({ status: 'running', retryCount: 0, maxRetries: 3 }), NOW)
    expect(next).toMatchObject({ status: 'pending', retryCount: 1, deadLetter: false })
    expect(next.scheduledAt?.toISOString()).toBe('2026-08-15T10:01:00.000Z')
  })

  it('ล้มครั้งสุดท้าย → dead letter ไม่ตั้งเวลาใหม่ (ไม่ retry เองอีก — `91` §16)', () => {
    const next = nextAttemptAfterFailure(job({ status: 'running', retryCount: 2, maxRetries: 3 }), NOW)
    expect(next).toEqual({ status: 'failed', retryCount: 3, scheduledAt: null, deadLetter: true })
  })

  it('`max_retries = 0` = ห้าม retry เลย ล้มครั้งเดียวเข้า dead letter ทันที', () => {
    const next = nextAttemptAfterFailure(job({ status: 'running', retryCount: 0, maxRetries: 0 }), NOW)
    expect(next.deadLetter).toBe(true)
  })
})

describe('สั่งทำงานใหม่ด้วยมือ (`91` §14)', () => {
  it('ได้เฉพาะงานที่ล้มเหลว/ถูกยกเลิก', () => {
    expect(canManualRetry(job({ status: 'failed', retryCount: 3, maxRetries: 3 }))).toBe(true)
    expect(canManualRetry(job({ status: 'failed', retryCount: 1, maxRetries: 3 }))).toBe(true)
    expect(canManualRetry(job({ status: 'cancelled' }))).toBe(true)
  })

  it('งานที่ยังรอคิว/กำลังทำ/สำเร็จแล้ว สั่งซ้ำไม่ได้', () => {
    expect(canManualRetry(job({ status: 'pending' }))).toBe(false)
    expect(canManualRetry(job({ status: 'running' }))).toBe(false)
    expect(canManualRetry(job({ status: 'completed' }))).toBe(false)
  })
})
