import { describe, expect, it } from 'vitest'
import { DEFAULT_ASSIGNMENT_POLICY } from '@/lib/assignments/policy'
import {
  DEFAULT_SLA_ALERT_HOURS,
  MAX_SLA_ALERT_HOURS,
  MIN_SLA_ALERT_HOURS,
  describeSlaThreshold,
  toSlaPolicyAuditPayload,
} from '@/lib/settings/sla-policy'
import { slaPolicyUpdateSchema } from '@/lib/settings/schemas'

/** เกณฑ์ SLA (`13` §6.14 · D18) — ค่าเริ่มต้นและขอบเขตต้องตรงกับ CHECK ระดับ DB */
describe('เกณฑ์ SLA งานติดตาม', () => {
  it('ค่าเริ่มต้น 72 ชั่วโมง = 3 วัน (มติ PO 15/08/2569) และตรงกับค่าตั้งต้นของนโยบายมอบหมายงาน', () => {
    expect(DEFAULT_SLA_ALERT_HOURS).toBe(72)
    expect(DEFAULT_ASSIGNMENT_POLICY.slaAlertHours).toBe(DEFAULT_SLA_ALERT_HOURS)
  })

  it('ป้ายบอกชั่วโมงพร้อมจำนวนวัน — เศษวันแสดงทศนิยม 1 ตำแหน่ง', () => {
    expect(describeSlaThreshold(72)).toBe('72 ชั่วโมง (3 วัน)')
    expect(describeSlaThreshold(24)).toBe('24 ชั่วโมง (1 วัน)')
    expect(describeSlaThreshold(36)).toBe('36 ชั่วโมง (1.5 วัน)')
  })

  it('payload ของ audit ใช้ชื่อคอลัมน์จริง (snake_case) ตามค่าที่เขียนลง DB', () => {
    expect(toSlaPolicyAuditPayload({ slaAlertHours: 48 })).toEqual({ sla_alert_hours: 48 })
  })
})

describe('slaPolicyUpdateSchema', () => {
  it('รับค่าจำนวนเต็มในช่วงที่กำหนดพร้อมเหตุผล', () => {
    const parsed = slaPolicyUpdateSchema.safeParse({ slaAlertHours: 48, reason: 'ปรับตามข้อตกลงลูกค้า' })
    expect(parsed.success).toBe(true)
  })

  it('0 ชั่วโมงไม่ผ่าน — ทุกเคสจะเกิน SLA ทันทีที่สร้าง (ตรงกับ CHECK ระดับ DB)', () => {
    const parsed = slaPolicyUpdateSchema.safeParse({ slaAlertHours: 0, reason: 'ทดสอบ' })
    expect(parsed.success).toBe(false)
  })

  it('เกินเพดาน 1 ปี หรือไม่ใช่จำนวนเต็ม ไม่ผ่าน', () => {
    expect(slaPolicyUpdateSchema.safeParse({ slaAlertHours: MAX_SLA_ALERT_HOURS + 1, reason: 'ทดสอบขอบเขตของเกณฑ์' }).success).toBe(false)
    expect(slaPolicyUpdateSchema.safeParse({ slaAlertHours: 12.5, reason: 'ทดสอบขอบเขตของเกณฑ์' }).success).toBe(false)
    expect(slaPolicyUpdateSchema.safeParse({ slaAlertHours: MIN_SLA_ALERT_HOURS, reason: 'ทดสอบขอบเขตของเกณฑ์' }).success).toBe(true)
  })

  it('ไม่มีเหตุผล = ไม่ผ่าน (ตารางนี้อยู่หมวด permission ของ reason-policy)', () => {
    const parsed = slaPolicyUpdateSchema.safeParse({ slaAlertHours: 48, reason: '' })
    expect(parsed.success).toBe(false)
  })
})
