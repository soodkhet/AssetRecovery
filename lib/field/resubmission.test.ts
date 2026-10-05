import { describe, expect, it } from 'vitest'
import { evidenceTimelineOf, resubmittedAtIso } from '@/lib/field/resubmission'

describe('evidenceTimelineOf — เวลาปิดครั้งแรก vs ส่งหลักฐานใหม่ (มติ PO U26)', () => {
  const first = new Date('2026-09-30T16:45:00.000Z')
  const last = new Date('2026-09-30T17:56:00.000Z')

  it('ยังไม่มีหลักฐาน = null', () => {
    expect(evidenceTimelineOf(0, null, null)).toBeNull()
  })

  it('ชุดเดียว = ปิดครั้งแรก ไม่เคยส่งใหม่', () => {
    expect(evidenceTimelineOf(1, first, first)).toEqual({ firstSubmittedAt: first, resubmittedAt: null })
    expect(resubmittedAtIso(evidenceTimelineOf(1, first, first) ?? undefined)).toBeNull()
  })

  it('หลายชุด = เวลาปิดคงเป็นชุดแรก · เวลาส่งใหม่ = ชุดล่าสุด (ข้ามเดือนตามเวลาไทยได้)', () => {
    const timeline = evidenceTimelineOf(3, first, last)
    expect(timeline).toEqual({ firstSubmittedAt: first, resubmittedAt: last })
    expect(resubmittedAtIso(timeline ?? undefined)).toBe('2026-09-30T17:56:00.000Z')
  })
})
