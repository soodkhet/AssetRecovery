import { describe, expect, it } from 'vitest'
import {
  auditActionLabel,
  auditActorLabel,
  auditFieldChanges,
  auditTargetLabel,
  auditValueText,
  AUDIT_ACTION_GROUP,
  AUDIT_ACTION_LABEL,
} from '@/lib/audit/log-display'
import { auditLogListQuerySchema, AUDIT_LOG_PAGE_SIZE_MAX } from '@/lib/audit/log-schemas'
import { STATUS_BADGE_CLASS } from '@/lib/ui/status-badge'

/**
 * หน้าบันทึกการใช้งาน (`90` §8/§14) — ล็อกไว้ว่า:
 * · ป้าย action ครบทั้ง 13 ค่าของ enum `audit_action` (`02` §3)
 * · สีมาจาก 10 กลุ่มของ `04` §8.1 เท่านั้น
 * · ตารางเทียบ before/after ทนกับข้อมูลรูปแบบแปลก ๆ (null / string ล้วน / array)
 */

describe('ป้ายของ audit log', () => {
  it('มี label ครบทุก action และสีอยู่ในกลุ่มสีมาตรฐาน', () => {
    const actions = Object.keys(AUDIT_ACTION_LABEL) as (keyof typeof AUDIT_ACTION_LABEL)[]
    expect(actions).toHaveLength(13)
    for (const action of actions) {
      expect(auditActionLabel(action).length).toBeGreaterThan(0)
      expect(Object.hasOwn(STATUS_BADGE_CLASS, AUDIT_ACTION_GROUP[action])).toBe(true)
    }
  })

  it('ตารางที่ยังไม่ได้ตั้งชื่อไทยแสดง code ดิบ (หน้าจอไม่พัง)', () => {
    expect(auditTargetLabel('cases')).toBe('เคส')
    expect(auditTargetLabel('some_new_table')).toBe('some_new_table')
  })

  it('งานอัตโนมัติของระบบ (actor = null) แสดงว่า "ระบบ"', () => {
    expect(auditActorLabel(null, null)).toBe('ระบบ (งานอัตโนมัติ)')
    expect(auditActorLabel('สมชาย', 'การเงิน')).toBe('สมชาย (การเงิน)')
    expect(auditActorLabel('สมชาย', null)).toBe('สมชาย')
  })
})

describe('auditFieldChanges()', () => {
  it('รวมคีย์ทั้งสองฝั่งแล้วเรียงตามชื่อ', () => {
    const changes = auditFieldChanges({ status: 'draft', note: 'ก' }, { status: 'sent' })
    expect(changes.map((change) => change.field)).toEqual(['note', 'status'])
    expect(changes[1]).toEqual({ field: 'status', before: 'draft', after: 'sent' })
  })

  it('ฝั่งที่ไม่มีค่า = null ไม่ใช่ undefined (คอลัมน์ยังวาดได้)', () => {
    const changes = auditFieldChanges(null, { status: 'approved' })
    expect(changes).toEqual([{ field: 'status', before: null, after: 'approved' }])
  })

  it('ค่าที่ไม่ใช่ object ถูกห่อเป็นฟิลด์ `value`', () => {
    expect(auditFieldChanges('ก่อน', 'หลัง')).toEqual([{ field: 'value', before: 'ก่อน', after: 'หลัง' }])
  })

  it('ไม่มี before/after เลย (เช่น login) = ไม่มีแถว', () => {
    expect(auditFieldChanges(null, null)).toEqual([])
  })
})

describe('auditValueText()', () => {
  it('ค่าว่าง/null แสดงขีด · object แสดงเป็น JSON', () => {
    expect(auditValueText(null)).toBe('—')
    expect(auditValueText('')).toBe('—')
    expect(auditValueText(0)).toBe('0')
    expect(auditValueText(false)).toBe('false')
    expect(auditValueText({ a: 1 })).toBe('{"a":1}')
    expect(auditValueText(['x', 'y'])).toBe('["x","y"]')
  })
})

describe('auditLogListQuerySchema', () => {
  it('ไม่ส่งอะไรมาเลย = หน้าแรก 50 แถว', () => {
    const parsed = auditLogListQuerySchema.parse({})
    expect(parsed).toMatchObject({ limit: 50, offset: 0 })
  })

  it('limit เกินเพดานถูกปฏิเสธ (กันดึงทั้งตาราง)', () => {
    expect(auditLogListQuerySchema.safeParse({ limit: AUDIT_LOG_PAGE_SIZE_MAX + 1 }).success).toBe(false)
  })

  it('วันที่ต้องเป็น YYYY-MM-DD ตาม `<input type="date">` เท่านั้น', () => {
    expect(auditLogListQuerySchema.safeParse({ dateFrom: '2026-08-15' }).success).toBe(true)
    expect(auditLogListQuerySchema.safeParse({ dateFrom: '15/08/2569' }).success).toBe(false)
  })

  it('action นอก enum ของ `02` §3 ถูกปฏิเสธ', () => {
    expect(auditLogListQuerySchema.safeParse({ action: 'approve' }).success).toBe(true)
    expect(auditLogListQuerySchema.safeParse({ action: 'archive' }).success).toBe(false)
  })
})
