import { describe, expect, it } from 'vitest'
import type { NotificationMessage } from '@/lib/notifications/messages'
import {
  OUTBOX_DEFAULT_MAX_ATTEMPTS,
  outboxErrorText,
  outboxExpenseApprovalEntries,
  outboxFailureOutcome,
  outboxMessageEntries,
  outboxPayloadSchema,
  outboxRetryDelayMs,
} from '@/lib/notifications/outbox-core'

const ORG = '00000000-0000-4000-8000-000000000001'
const U1 = '00000000-0000-4000-8000-000000000011'
const U2 = '00000000-0000-4000-8000-000000000012'
const E1 = '00000000-0000-4000-8000-000000000021'
const E2 = '00000000-0000-4000-8000-000000000022'

const message: NotificationMessage = {
  eventCode: 'advance.overdue',
  title: 'เงินทดรองเลยกำหนด',
  body: null,
  linkPath: '/field/advances',
  dedupeKey: 'advance-1',
}

describe('outboxMessageEntries() — หนึ่งแถวต่อผู้รับ (DEC-015)', () => {
  it('ผู้รับซ้ำ/ว่าง ถูกกรอง · กุญแจคงที่ต่อ (event, ผู้รับ, เหตุการณ์) ⇒ job รันซ้ำได้แถวเดิม', () => {
    const entries = outboxMessageEntries(ORG, [U1, U2, U1, ''], message)
    expect(entries.map((entry) => entry.payload)).toEqual([
      { kind: 'message', userId: U1, eventCode: 'advance.overdue', title: message.title, body: null, linkPath: '/field/advances', dedupeKey: 'advance-1' },
      { kind: 'message', userId: U2, eventCode: 'advance.overdue', title: message.title, body: null, linkPath: '/field/advances', dedupeKey: 'advance-1' },
    ])
    expect(outboxMessageEntries(ORG, [U1], message)[0]?.dedupeKey).toBe(entries[0]?.dedupeKey)
    expect(entries[0]?.dedupeKey).not.toBe(entries[1]?.dedupeKey)
  })

  it('ข้อความไม่มี dedupeKey ⇒ ได้กุญแจประจำแถว (ตัวส่ง retry แล้วไม่แจ้งซ้ำ)', () => {
    const { dedupeKey: _omit, ...plain } = message
    const [entry] = outboxMessageEntries(ORG, [U1], plain)
    expect(entry?.payload.kind === 'message' && entry.payload.dedupeKey.startsWith('outbox-')).toBe(true)
  })

  it('ไม่มีผู้รับ = ไม่มีแถว', () => {
    expect(outboxMessageEntries(ORG, [], message)).toEqual([])
  })
})

describe('outboxExpenseApprovalEntries()', () => {
  it('ลำดับ id ไม่มีผลต่อกุญแจ · ไม่มีรายการ = ไม่มีแถว', () => {
    const a = outboxExpenseApprovalEntries(ORG, [E2, E1, E1])
    const b = outboxExpenseApprovalEntries(ORG, [E1, E2])
    expect(a).toEqual(b)
    expect(a[0]?.payload).toEqual({ kind: 'expense_approval_queue', expenseIds: [E1, E2] })
    expect(outboxExpenseApprovalEntries(ORG, [])).toEqual([])
  })
})

describe('outboxPayloadSchema', () => {
  it('รับ payload ที่สร้างจากตัวช่วย · ปฏิเสธ event นอกแค็ตตาล็อก/ชนิดที่ไม่รู้จัก', () => {
    const [entry] = outboxMessageEntries(ORG, [U1], message)
    expect(outboxPayloadSchema.safeParse(entry?.payload).success).toBe(true)
    expect(outboxPayloadSchema.safeParse({ ...entry?.payload, eventCode: 'no.such_event' }).success).toBe(false)
    expect(outboxPayloadSchema.safeParse({ kind: 'unknown' }).success).toBe(false)
    expect(outboxPayloadSchema.safeParse({ kind: 'expense_approval_queue', expenseIds: [] }).success).toBe(false)
  })
})

describe('จังหวะ retry', () => {
  it('backoff 1, 2, 4 … นาที เพดาน 60 นาที', () => {
    expect([1, 2, 3, 4, 7, 8, 50].map((attempt) => outboxRetryDelayMs(attempt) / 60_000)).toEqual([1, 2, 4, 8, 60, 60, 60])
  })

  it('ยังไม่ครบเพดาน = pending รอ backoff · ครบเพดาน = failed', () => {
    const now = new Date('2026-10-07T00:00:00Z')
    expect(outboxFailureOutcome(1, OUTBOX_DEFAULT_MAX_ATTEMPTS, now)).toEqual({
      status: 'pending',
      availableAt: new Date('2026-10-07T00:01:00Z'),
    })
    expect(outboxFailureOutcome(OUTBOX_DEFAULT_MAX_ATTEMPTS, OUTBOX_DEFAULT_MAX_ATTEMPTS, now)).toEqual({ status: 'failed' })
  })

  it('ข้อความ error ตัดยาว', () => {
    expect(outboxErrorText(new Error('boom'))).toBe('Error: boom')
    expect(outboxErrorText('x'.repeat(2000)).length).toBe(1001)
  })
})
