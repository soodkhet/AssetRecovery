import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))

const { groupPayeeTransfers } = await import('@/lib/payout/post-completion')

describe('groupPayeeTransfers (staging E-011)', () => {
  it('รวมยอดโอนต่อผู้ใช้ และตัดคนที่ยอดโอนรวมเป็น 0 (หักคืนเงินทดรองหมด)', () => {
    expect(
      groupPayeeTransfers([
        { userId: 'a', transferSatang: 50_000 },
        { userId: 'b', transferSatang: 0 },
        { userId: 'a', transferSatang: 47_000 },
      ]),
    ).toEqual([{ userId: 'a', transferSatang: 97_000 }])
  })
})
