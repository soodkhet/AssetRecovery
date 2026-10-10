import { describe, expect, it } from 'vitest'
import {
  buildCaseStatusTimeline,
  caseEditedFieldsText,
  redactCaseStatusTimelineForCompany,
  type CaseStatusAuditRow,
} from '@/lib/cases/status-timeline'

function row(overrides: Partial<CaseStatusAuditRow> & { createdAt: Date }): CaseStatusAuditRow {
  return {
    action: 'status_change',
    beforeStatus: null,
    afterStatus: null,
    transition: null,
    reason: null,
    actorName: 'ธุรการ 1',
    ...overrides,
  }
}

describe('buildCaseStatusTimeline (staging E-004)', () => {
  const rows: CaseStatusAuditRow[] = [
    row({
      action: 'reject',
      beforeStatus: 'pending_review',
      afterStatus: 'rejected',
      transition: 'reject',
      reason: ' เอกสารไม่ครบ ',
      actorName: 'ผู้พิจารณา',
      createdAt: new Date('2026-10-03T03:00:00Z'),
    }),
    row({ action: 'create', createdAt: new Date('2026-10-01T03:00:00Z') }),
    row({
      beforeStatus: 'draft',
      afterStatus: 'pending_review',
      transition: 'review',
      createdAt: new Date('2026-10-02T03:00:00Z'),
    }),
    // แก้ข้อมูลอย่างเดียว สถานะไม่เปลี่ยน ⇒ ไม่อยู่ในประวัติสถานะ
    row({ action: 'update', beforeStatus: 'draft', afterStatus: 'draft', createdAt: new Date('2026-10-01T05:00:00Z') }),
  ]

  it('เรียงเก่า → ใหม่ · ป้ายจาก state machine · ตัดแถวที่สถานะไม่เปลี่ยน', () => {
    const timeline = buildCaseStatusTimeline(rows)
    expect(timeline.map((entry) => entry.label)).toEqual(['สร้างเคส', 'ส่งตรวจสอบเคส', 'ไม่รับเคส'])
    expect(timeline[0]).toMatchObject({ toStatus: 'draft', fromStatus: null })
    expect(timeline[2]).toMatchObject({ fromStatus: 'pending_review', toStatus: 'rejected', actorName: 'ผู้พิจารณา' })
  })

  it('เหตุผลแสดงเฉพาะ action ที่ต้องกรอก — เหตุผลที่ระบบเขียนเองไม่แสดง', () => {
    const timeline = buildCaseStatusTimeline([
      ...rows,
      row({
        action: 'approve',
        beforeStatus: 'pending_review',
        afterStatus: 'approved',
        transition: 'accept',
        reason: 'snapshot ค่าบริการอัตโนมัติตอนอนุมัติเคส',
        createdAt: new Date('2026-10-04T03:00:00Z'),
      }),
    ])
    expect(timeline.find((entry) => entry.toStatus === 'rejected')?.note).toBe('เอกสารไม่ครบ')
    expect(timeline.find((entry) => entry.toStatus === 'approved')?.note).toBeNull()
  })

  it('พอร์ทัลบริษัทไฟแนนซ์ไม่เห็นชื่อพนักงานและบันทึกภายใน', () => {
    const redacted = redactCaseStatusTimelineForCompany(buildCaseStatusTimeline(rows))
    expect(redacted.every((entry) => entry.actorName === null && entry.note === null)).toBe(true)
    expect(redacted.map((entry) => entry.toStatus)).toEqual(['draft', 'pending_review', 'rejected'])
  })
})

describe('caseEditedFieldsText (staging E-004)', () => {
  it('แปลงชื่อฟิลด์เป็นภาษาไทย · ตัดซ้ำ · ฟิลด์ไม่รู้จัก = "ข้อมูลอื่น"', () => {
    expect(caseEditedFieldsText(['debtorName', 'assetBrandModel', 'deviceModelId'])).toBe('ชื่อลูกหนี้, ยี่ห้อ/รุ่น, รุ่นอุปกรณ์')
    expect(caseEditedFieldsText(['foo', 'bar'])).toBe('ข้อมูลอื่น')
    expect(caseEditedFieldsText([])).toBe('—')
  })
})
