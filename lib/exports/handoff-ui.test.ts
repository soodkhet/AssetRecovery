import { describe, expect, it } from 'vitest'
import { EXPORT_HANDOFF_TEXT } from '@/lib/exports/handoff-ui'

describe('EXPORT_HANDOFF_TEXT — staging E-068', () => {
  it('ข้อความภาษาไทยล้วน และตัวอย่างหมายเหตุแยกตาม action', () => {
    for (const text of Object.values(EXPORT_HANDOFF_TEXT)) {
      for (const value of Object.values(text)) expect(value).not.toMatch(/Accepted|Mark/)
    }
    expect(EXPORT_HANDOFF_TEXT.accept.confirmLabel).toBe('ยืนยันว่าตอบรับแล้ว')
    expect(EXPORT_HANDOFF_TEXT.accept.noteHint).not.toBe(EXPORT_HANDOFF_TEXT['mark-sent'].noteHint)
  })
})
