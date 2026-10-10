import { describe, expect, it } from 'vitest'
import { PORTAL_NOT_AVAILABLE_MESSAGE, PORTAL_NOT_AVAILABLE_TITLE, portalErrorView } from '@/lib/portal/error-view'

describe('portalErrorView — staging E-071', () => {
  it('เครือข่าย/หมดเวลา/ระบบขัดข้อง ⇒ ลองใหม่ได้ ข้อความเดิม', () => {
    expect(portalErrorView({ title: 'เชื่อมต่อไม่สำเร็จ', message: 'ตรวจอินเทอร์เน็ต' })).toEqual({
      title: 'เชื่อมต่อไม่สำเร็จ',
      message: 'ตรวจอินเทอร์เน็ต',
      retryable: true,
    })
    expect(portalErrorView({ title: 't', message: 'm', code: 'INTERNAL_ERROR' }).retryable).toBe(true)
  })

  it('ไม่พบ/ไม่มีสิทธิ์ ⇒ ข้อความกลางเดียวกัน ไม่มีปุ่มลองใหม่', () => {
    for (const code of ['CASE_NOT_FOUND', 'BILLING_BATCH_NOT_FOUND', 'PERMISSION_DENIED']) {
      expect(portalErrorView({ title: 'x', message: 'y', code })).toEqual({
        title: PORTAL_NOT_AVAILABLE_TITLE,
        message: PORTAL_NOT_AVAILABLE_MESSAGE,
        retryable: false,
      })
    }
  })

  it('error อื่นที่ลองซ้ำไม่ช่วย ⇒ ข้อความเดิม ไม่มีปุ่มลองใหม่', () => {
    expect(portalErrorView({ title: 'ข้อมูลไม่ถูกต้อง', message: 'ช่วงวันที่ผิด', code: 'API_VALIDATION_FAILED' })).toEqual({
      title: 'ข้อมูลไม่ถูกต้อง',
      message: 'ช่วงวันที่ผิด',
      retryable: false,
    })
  })
})
