import { describe, expect, it } from 'vitest'
import { isScheduleDateInPast, scheduleCaseSchema } from '@/lib/field/schemas'

/** preship R3-018 — API ปฏิเสธวันที่ลงพื้นที่ย้อนหลัง (เดิมปฏิทิน disable อย่างเดียว) */
describe('วันที่ลงพื้นที่ห้ามย้อนหลัง', () => {
  // 08/10/2569 01:30 เวลาไทย = 07/10 18:30 UTC
  const now = new Date('2026-10-07T18:30:00Z')

  it('ตามปฏิทินไทย: วันนี้/พรุ่งนี้ได้ · เมื่อวานไม่ได้', () => {
    expect(isScheduleDateInPast(new Date(Date.UTC(2026, 9, 8)), now)).toBe(false)
    expect(isScheduleDateInPast(new Date(Date.UTC(2026, 9, 9)), now)).toBe(false)
    expect(isScheduleDateInPast(new Date(Date.UTC(2026, 9, 7)), now)).toBe(true)
  })

  it('schema ปัดวันที่ผ่านมาแล้ว', () => {
    const result = scheduleCaseSchema.safeParse({ scheduleDate: '2026-01-01' })
    expect(result.success).toBe(false)
    expect(scheduleCaseSchema.safeParse({ scheduleDate: '2099-01-01' }).success).toBe(true)
  })
})
