import { describe, expect, it } from 'vitest'
import { apiFailureSummary, clearSubmitErrorField, fieldErrorsSummary, NO_SUBMIT_ERROR, submitErrorFrom } from '@/components/ui'

/** มติผู้ใช้ 15/10/2569 — ข้อผิดตอนกดส่งของฟอร์มใน modal: footer + ใต้ช่อง */
describe('submitErrorFrom()', () => {
  it('ส่งไม่ผ่าน ⇒ ข้อความ footer + ข้อผิดรายช่องจาก API · tick เดินต่อ', () => {
    const next = submitErrorFrom(NO_SUBMIT_ERROR, { message: 'เหตุผลสั้นเกินไป', fields: { reason: 'อย่างน้อย 5 ตัวอักษร' } })
    expect(next).toEqual({ message: 'เหตุผลสั้นเกินไป', fields: { reason: 'อย่างน้อย 5 ตัวอักษร' }, tick: 1 })
  })

  it('ส่งไม่ผ่านซ้ำ ⇒ แทนที่ข้อผิดรายช่องชุดเก่า (ไม่ค้าง) · tick ใหม่ให้อ่านซ้ำ', () => {
    const first = submitErrorFrom(NO_SUBMIT_ERROR, { message: 'a', fields: { reason: 'x' } })
    const second = submitErrorFrom(first, { message: 'b' })
    expect(second).toEqual({ message: 'b', fields: {}, tick: 2 })
  })
})

describe('clearSubmitErrorField()', () => {
  it('แก้ช่องที่ผิด ⇒ ล้างข้อความใต้ช่องนั้น ข้อความ footer คงไว้', () => {
    const state = submitErrorFrom(NO_SUBMIT_ERROR, { message: 'm', fields: { reason: 'x', name: 'y' } })
    expect(clearSubmitErrorField(state, 'reason')).toEqual({ message: 'm', fields: { name: 'y' }, tick: 1 })
  })

  it('ช่องที่ไม่มีข้อผิด ⇒ คืน state เดิม (ไม่ render ซ้ำ)', () => {
    const state = submitErrorFrom(NO_SUBMIT_ERROR, { message: 'm', fields: { reason: 'x' } })
    expect(clearSubmitErrorField(state, 'name')).toBe(state)
  })
})

describe('ข้อความ footer ของฟอร์มตั้งค่า (mytester6 T-004/T-010)', () => {
  it('ตรวจไม่ผ่าน ⇒ บอกให้แก้ช่องสีแดง (หลายช่องบอกจำนวน)', () => {
    expect(fieldErrorsSummary({ phone: 'x' })).toBe('ข้อมูลยังไม่ถูกต้อง — แก้ช่องที่มีข้อความสีแดงแล้วบันทึกอีกครั้ง')
    expect(fieldErrorsSummary({ phone: 'x', reason: 'y' })).toBe('ข้อมูลยังไม่ถูกต้อง 2 ช่อง — แก้ช่องที่มีข้อความสีแดงแล้วบันทึกอีกครั้ง')
  })

  it('API/เน็ตหลุด ⇒ หัวข้อ — รายละเอียด', () => {
    expect(apiFailureSummary({ title: 'เชื่อมต่อระบบไม่สำเร็จ', message: 'ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่' })).toBe(
      'เชื่อมต่อระบบไม่สำเร็จ — ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่',
    )
  })
})
