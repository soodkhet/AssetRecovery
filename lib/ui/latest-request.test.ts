import { describe, expect, it } from 'vitest'
import { isAwaitingRequest, listRequestKey } from '@/lib/ui/latest-request'

describe('สถานะกำลังโหลดอนุมานจากคำขอ (mytester2 A2-02)', () => {
  it('ยังไม่เคยได้ผล ⇒ กำลังโหลด · ได้ผลของคำขอปัจจุบัน ⇒ เลิกโหลด', () => {
    const key = listRequestKey(['all', 'all', 1, '', 'apple-id', 0, 0])
    expect(isAwaitingRequest(null, key)).toBe(true)
    expect(isAwaitingRequest(key, key)).toBe(false)
  })

  it('ตั้งค่าตัวกรองเป็นค่าเดิม ⇒ คีย์ไม่เปลี่ยน ไม่ค้าง "กำลังโหลด"', () => {
    const loaded = listRequestKey(['visible', 1, ''])
    expect(isAwaitingRequest(loaded, listRequestKey(['visible', 1, '']))).toBe(false)
  })

  it('โหลดใหม่อัตโนมัติแทรกระหว่างคำขอแรก ⇒ ผลของคำขอแรกไม่ทำให้เลิกโหลด ต้องรอผลของคำขอล่าสุด', () => {
    const first = listRequestKey(['all', 1, '', 0])
    const afterImportFinished = listRequestKey(['all', 1, '', 1])
    expect(isAwaitingRequest(first, afterImportFinished)).toBe(true)
    expect(isAwaitingRequest(afterImportFinished, afterImportFinished)).toBe(false)
  })

  it('ค่า null กับข้อความว่างเป็นคนละคีย์ (ไม่แบรนด์ ≠ ค้นคำว่าง)', () => {
    expect(listRequestKey([null])).not.toBe(listRequestKey(['']))
  })
})
