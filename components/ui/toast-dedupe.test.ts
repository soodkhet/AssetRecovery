import { describe, expect, it } from 'vitest'
import { findDuplicateToast } from '@/components/ui/toast-dedupe'

const OFFLINE = { tone: 'error', title: 'เชื่อมต่อระบบไม่สำเร็จ', description: 'ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่' }

describe('findDuplicateToast (mytester DO-05)', () => {
  it('ข้อความเดียวกันที่ยังแสดงอยู่ ⇒ คืน id เดิม ไม่ซ้อนกล่องใหม่', () => {
    expect(findDuplicateToast([{ id: 7, ...OFFLINE }], OFFLINE)).toBe(7)
  })

  it('ต่างกันแม้ช่องเดียว (โทน/หัวข้อ/รายละเอียด) ⇒ แสดงใหม่', () => {
    const current = [{ id: 1, ...OFFLINE }]
    expect(findDuplicateToast(current, { ...OFFLINE, tone: 'warning' })).toBeNull()
    expect(findDuplicateToast(current, { ...OFFLINE, title: 'อื่น' })).toBeNull()
    expect(findDuplicateToast(current, { ...OFFLINE, description: undefined })).toBeNull()
  })

  it('ไม่มี toast ค้าง ⇒ null', () => {
    expect(findDuplicateToast([], OFFLINE)).toBeNull()
  })
})
