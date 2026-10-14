import { describe, expect, it } from 'vitest'
import { closedNow } from '@/components/ui'

/** ตรวจซ้ำ staging SV5-R6-01 — modal ที่ค้าง mount ล้างข้อผิดจากการกดส่งเมื่อถูกปิด (เปิดใหม่ไม่ขึ้นข้อผิดเก่า) */
describe('closedNow()', () => {
  it('เปิด → ปิด (ยกเลิก/X/ส่งสำเร็จ) ⇒ ล้าง', () => {
    expect(closedNow(true, false)).toBe(true)
  })

  it('ปิด → เปิด ⇒ ไม่ล้างซ้ำ (ล้างไปแล้วตอนปิด · ร่างยังอยู่)', () => {
    expect(closedNow(false, true)).toBe(false)
  })

  it('เปิดค้าง (render ซ้ำระหว่างกรอก) ⇒ ไม่ล้างข้อผิดที่เพิ่งกดส่ง', () => {
    expect(closedNow(true, true)).toBe(false)
  })

  it('ปิดค้างตั้งแต่ mount ⇒ ไม่เรียก', () => {
    expect(closedNow(false, false)).toBe(false)
  })
})
