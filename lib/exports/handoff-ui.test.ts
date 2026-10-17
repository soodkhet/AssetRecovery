import { describe, expect, it } from 'vitest'
import { EXPORT_HANDOFF_TEXT, exportHandoffTrail } from '@/lib/exports/handoff-ui'
import { fmtDateTime } from '@/lib/format/datetime'

describe('exportHandoffTrail — mytester6 T-025', () => {
  it('ส่งแล้ว ⇒ เวลาส่ง (พ.ศ.) + ผู้ส่ง · ตอบรับแล้ว ⇒ เพิ่มเวลาตอบรับ · ยังไม่ส่ง ⇒ ว่าง', () => {
    expect(
      exportHandoffTrail({ sentAt: '2026-10-17T08:45:00Z', sentByName: 'ปรีดา บัญชีงาม', acceptedAt: null }, fmtDateTime),
    ).toEqual(['ส่งเมื่อ 17/10/2569 15:45 · โดย ปรีดา บัญชีงาม'])
    expect(
      exportHandoffTrail(
        { sentAt: '2026-10-17T08:45:00Z', sentByName: null, acceptedAt: '2026-10-18T02:00:00Z' },
        fmtDateTime,
      ),
    ).toEqual(['ส่งเมื่อ 17/10/2569 15:45', 'ตอบรับเมื่อ 18/10/2569 09:00'])
    expect(exportHandoffTrail({ sentAt: null, sentByName: null, acceptedAt: null }, fmtDateTime)).toEqual([])
  })
})

describe('EXPORT_HANDOFF_TEXT — staging E-068', () => {
  it('ข้อความภาษาไทยล้วน และตัวอย่างหมายเหตุแยกตาม action', () => {
    for (const text of Object.values(EXPORT_HANDOFF_TEXT)) {
      for (const value of Object.values(text)) expect(value).not.toMatch(/Accepted|Mark/)
    }
    expect(EXPORT_HANDOFF_TEXT.accept.confirmLabel).toBe('ยืนยันว่าตอบรับแล้ว')
    expect(EXPORT_HANDOFF_TEXT.accept.noteHint).not.toBe(EXPORT_HANDOFF_TEXT['mark-sent'].noteHint)
  })
})
