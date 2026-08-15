import { describe, expect, it } from 'vitest'
import { EVENT_NAMES } from '@/lib/api/event-names'
import {
  NOTIFICATION_EVENTS,
  NOTIFICATION_EVENT_CODES,
  NOTIFICATION_ONLY_EVENTS,
  assertNotificationEvent,
  isNotificationEvent,
  isWiredDomainEvent,
  notificationDisplay,
  type NotificationEventCode,
} from '@/lib/notifications/events'
import { STATUS_BADGE_CLASS } from '@/lib/ui/status-badge'

/**
 * แค็ตตาล็อกการแจ้งเตือนต้องครบตาม `90` §6.3 ทั้ง 9 แถว และ **สะกดตรงกับทะเบียน domain event**
 * เมื่อ event นั้นมีอยู่จริงแล้ว (`45` §7) — จุดที่พลาดง่ายคือชื่อที่ `90` เขียนต่างจากไฟล์ต้นทาง
 * (`evidence.reject_evidence` vs `case.evidence_rejected`, `reassignment_timeout` vs
 * `assignment.reassignment_timeout_resolved`)
 */

/** ตัวแทนของทั้ง 9 แถวใน `90` §6.3 — แถวไหนหายไปคือแค็ตตาล็อกไม่ครบสเปค */
const SPEC_6_3_ROWS: readonly NotificationEventCode[] = [
  'case.need_info_requested',
  'case.rejected',
  'case.approved',
  'case.recycle_approved',
  'assignment.reassignment_requested',
  'assignment.reassignment_timeout_resolved',
  'case.closed_success',
  'case.closed_fail',
  'case.evidence_rejected',
  'asset.intake_rejected',
  'lot.confirmed',
  'expense.rejected',
  'expense.approved',
  'payout_batch.completed',
  'payout_batch.failed',
  'wht.filing_due_reminder',
  'exception.created',
]

describe('แค็ตตาล็อก event ของการแจ้งเตือน (`90` §6.3)', () => {
  it('ครอบคลุมทุกแถวของ `90` §6.3', () => {
    for (const code of SPEC_6_3_ROWS) {
      expect(isNotificationEvent(code), `ขาด event ${code}`).toBe(true)
    }
  })

  it('ทุก code ที่เป็น domain event อยู่แล้ว ต้องสะกดตรงทะเบียน `lib/api/event-names.ts`', () => {
    const registry = new Set<string>(EVENT_NAMES)
    const wired = NOTIFICATION_EVENT_CODES.filter((code) => registry.has(code))
    expect(wired.every((code) => isWiredDomainEvent(code))).toBe(true)
    // ตัวที่ยังไม่มีในทะเบียน ต้องประกาศไว้ที่ NOTIFICATION_ONLY_EVENTS ให้หมด (ห้ามหลุดเงียบ)
    const notWired = NOTIFICATION_EVENT_CODES.filter((code) => !registry.has(code))
    expect([...notWired].sort()).toEqual([...NOTIFICATION_ONLY_EVENTS].sort())
  })

  it('NOTIFICATION_ONLY_EVENTS ต้องไม่มีตัวที่โมดูล emit แล้ว (รายการต้องหดลง ไม่ใช่ค้างเก่า)', () => {
    for (const code of NOTIFICATION_ONLY_EVENTS) {
      expect(isWiredDomainEvent(code), `${code} เข้าทะเบียน domain event แล้ว — เอาออกจากรายการนี้`).toBe(false)
    }
  })

  it('ทุกระดับสีเป็นกลุ่มสีของ `04` §8.1 (ไม่มีสีนอกระบบ)', () => {
    for (const code of NOTIFICATION_EVENT_CODES) {
      expect(Object.hasOwn(STATUS_BADGE_CLASS, NOTIFICATION_EVENTS[code].level)).toBe(true)
    }
  })

  it('ทุกรายการมีป้ายโมดูล + ที่มาเอกสารเสมอ', () => {
    for (const code of NOTIFICATION_EVENT_CODES) {
      const contract = NOTIFICATION_EVENTS[code]
      expect(contract.module.length).toBeGreaterThan(0)
      expect(contract.source).toMatch(/\d/)
      expect(contract.description.length).toBeGreaterThan(0)
    }
  })

  it('การตีกลับ/เลยกำหนดเป็น warning · ล้มเหลว/บล็อกงานเป็น critical · สำเร็จเป็น success', () => {
    expect(NOTIFICATION_EVENTS['expense.rejected'].level).toBe('warning')
    expect(NOTIFICATION_EVENTS['case.evidence_rejected'].level).toBe('warning')
    expect(NOTIFICATION_EVENTS['advance.overdue'].level).toBe('warning')
    expect(NOTIFICATION_EVENTS['payout_batch.failed'].level).toBe('critical')
    expect(NOTIFICATION_EVENTS['exception.created'].level).toBe('critical')
    expect(NOTIFICATION_EVENTS['lot.confirmed'].level).toBe('success')
    expect(NOTIFICATION_EVENTS['payout_batch.completed'].level).toBe('success')
  })
})

describe('notificationDisplay()', () => {
  it('คืนป้ายโมดูล + ระดับของ event ที่รู้จัก', () => {
    expect(notificationDisplay('exception.created')).toEqual({ module: 'บัญชี', level: 'critical' })
  })

  it('code แปลกปลอม (ข้อมูลเก่าในฐาน) ไม่ทำหน้าจอพัง — ตกเป็นกลาง', () => {
    expect(notificationDisplay('something.unknown')).toEqual({ module: 'ระบบ', level: 'sent' })
  })
})

describe('assertNotificationEvent()', () => {
  it('ผ่านเมื่ออยู่ในแค็ตตาล็อก', () => {
    expect(assertNotificationEvent('lot.confirmed')).toBe('lot.confirmed')
  })

  it('โยน error ทันทีเมื่อชื่อไม่อยู่ในแค็ตตาล็อก (กันสะกดผิดจาก job payload)', () => {
    expect(() => assertNotificationEvent('lot.confirm')).toThrow(/ไม่มีในแค็ตตาล็อก/)
  })
})
