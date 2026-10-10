import { describe, expect, it } from 'vitest'
import { shouldPollTacSummary, tacJobFinishedNotice } from '@/lib/device-catalog/tac-polling'

describe('ติดตามงานอัปเดตฐาน TAC (staging E-019)', () => {
  const summary = (pendingJob: boolean) => ({ pendingJob, tacCount: 120_000, brandCount: 14 })

  it('มีงานรอ/กำลังทำ ⇒ ถามซ้ำ · ไม่มี ⇒ หยุด', () => {
    expect(shouldPollTacSummary(summary(true))).toBe(true)
    expect(shouldPollTacSummary(summary(false))).toBe(false)
    expect(shouldPollTacSummary(null)).toBe(false)
  })

  it('แจ้งผลเฉพาะตอนงานเพิ่งจบ (pending → ไม่ pending)', () => {
    expect(tacJobFinishedNotice(summary(true), summary(false))?.title).toBe('อัปเดตฐานรุ่นเครื่องเสร็จแล้ว')
    expect(tacJobFinishedNotice(summary(false), summary(false))).toBeNull()
    expect(tacJobFinishedNotice(null, summary(false))).toBeNull()
    expect(tacJobFinishedNotice(summary(true), summary(true))).toBeNull()
  })
})
