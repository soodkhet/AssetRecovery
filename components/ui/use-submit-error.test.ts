import { describe, expect, it } from 'vitest'
import { clearSubmitErrorField, NO_SUBMIT_ERROR, submitErrorFrom } from '@/components/ui'

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
