import { beforeEach, describe, expect, it, vi } from 'vitest'

/** รีวิวเฟส 4 ข้อ 5 — query เคสที่จับคู่กับค่าที่พักต้องไม่นับงานที่ถูกโอนออก/เคสที่ถูกลบ */

const prismaMock = vi.hoisted(() => ({ caseAssignment: { findMany: vi.fn(async (): Promise<unknown[]> => []) } }))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

const { loadHotelMatchedCases } = await import('@/lib/field/hotel-matched-cases-db')

beforeEach(() => {
  prismaMock.caseAssignment.findMany.mockReset()
  prismaMock.caseAssignment.findMany.mockResolvedValue([])
})

describe('loadHotelMatchedCases', () => {
  it('ไม่มีใบเบิก ⇒ ไม่ query', async () => {
    expect(await loadHotelMatchedCases('org-1', [])).toEqual(new Map())
    expect(prismaMock.caseAssignment.findMany).not.toHaveBeenCalled()
  })

  it('กรององค์กร/ผู้เบิก/วันที่ + ตัดงานที่ถูกโอนออก (reassigned_away) และเคสที่ถูกลบ', async () => {
    await loadHotelMatchedCases('org-1', [
      { id: 'e1', agentUserId: 'agent-1', checkInDate: '2026-10-05', nights: 1 },
    ])
    expect(prismaMock.caseAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          agentId: { in: ['agent-1'] },
          status: { not: 'reassigned_away' },
          case: { deletedAt: null },
        }),
      }),
    )
  })
})
