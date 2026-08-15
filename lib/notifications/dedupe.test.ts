import { describe, expect, it } from 'vitest'
import { notificationDedupeId, uuidV5 } from '@/lib/notifications/dedupe'

/**
 * idempotency ของ Notification Service (PLAN §5.1) วางอยู่บน id ที่คำนวณซ้ำได้ตัวนี้ทั้งหมด —
 * ถ้ามันไม่ deterministic หรือชนกันข้ามผู้รับ ระบบจะแจ้งซ้ำ/แจ้งผิดคนทันที
 */

const ORG = '00000000-0000-4000-8000-0000000051a0'
const USER_A = '00000000-0000-4000-8000-0000000051a1'
const USER_B = '00000000-0000-4000-8000-0000000051a2'

const base = { organizationId: ORG, userId: USER_A, eventCode: 'lot.confirmed', dedupeKey: 'lot-1' }

describe('notificationDedupeId()', () => {
  it('input เดิม = id เดิมเสมอ (คำนวณซ้ำได้)', () => {
    expect(notificationDedupeId(base)).toBe(notificationDedupeId({ ...base }))
  })

  it('คนละผู้รับ = คนละ id', () => {
    expect(notificationDedupeId({ ...base, userId: USER_B })).not.toBe(notificationDedupeId(base))
  })

  it('คนละ event = คนละ id', () => {
    expect(notificationDedupeId({ ...base, eventCode: 'lot.created' })).not.toBe(notificationDedupeId(base))
  })

  it('คนละเหตุการณ์ = คนละ id', () => {
    expect(notificationDedupeId({ ...base, dedupeKey: 'lot-2' })).not.toBe(notificationDedupeId(base))
  })

  it('คนละองค์กร = คนละ id (multi-tenant)', () => {
    const otherOrg = '00000000-0000-4000-8000-0000000051b0'
    expect(notificationDedupeId({ ...base, organizationId: otherOrg })).not.toBe(notificationDedupeId(base))
  })

  it('ตัวคั่นช่องกันชน: (event="a", key="b|c") ต้องไม่ชนกับ (event="a|b", key="c")', () => {
    const left = notificationDedupeId({ ...base, eventCode: 'a', dedupeKey: 'b c' })
    const right = notificationDedupeId({ ...base, eventCode: 'a b', dedupeKey: 'c' })
    expect(left).not.toBe(right)
  })

  it('เป็น UUID v5 ที่ Postgres รับได้ (รูปแบบ + version + variant)', () => {
    const id = notificationDedupeId(base)
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})

describe('uuidV5()', () => {
  it('ตรงกับเวกเตอร์ทดสอบมาตรฐาน RFC 4122 (namespace DNS + "www.example.org")', () => {
    // ค่านี้เป็นค่ามาตรฐานที่ทุก implementation ต้องได้ตรงกัน — พิสูจน์ว่าสูตรถูก ไม่ใช่แค่คงที่
    expect(uuidV5('www.example.org', '6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(
      '74738ff5-5367-5958-9aee-98fffdcd1876',
    )
  })
})
