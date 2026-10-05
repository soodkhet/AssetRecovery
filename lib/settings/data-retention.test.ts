import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DEBTOR_DOCUMENT_RETENTION_YEARS,
  caseRetentionAnchor,
  debtorDocumentPurgeReason,
  debtorDocumentsPurgedText,
  isDebtorDocumentPurgeDue,
  isValidRetentionYears,
  retentionCutoff,
} from '@/lib/settings/data-retention'
import { dataRetentionUpdateSchema } from '@/lib/settings/schemas'

/** ระยะเก็บเอกสารลูกหนี้ (PDPA — มติ PO 06/10/2569 U97) */

/** 6 ต.ค. 2569 เวลาไทย 09:00 */
const NOW = new Date('2026-10-06T02:00:00.000Z')

describe('ค่าตั้ง', () => {
  it('ค่าเริ่มต้น 5 ปี · ช่วง 1–20 จำนวนเต็ม', () => {
    expect(DEFAULT_DEBTOR_DOCUMENT_RETENTION_YEARS).toBe(5)
    for (const years of [1, 5, 20]) expect(isValidRetentionYears(years)).toBe(true)
    for (const years of [0, 21, 2.5, -1]) expect(isValidRetentionYears(years)).toBe(false)
    expect(dataRetentionUpdateSchema.safeParse({ debtorDocumentRetentionYears: 5, reason: 'ตามนโยบาย' }).success).toBe(true)
    expect(dataRetentionUpdateSchema.safeParse({ debtorDocumentRetentionYears: 5 }).success).toBe(false)
  })
})

describe('จุดตัด (ตามปฏิทินไทย)', () => {
  it('= เที่ยงคืนเวลาไทยของวันนี้ย้อนหลัง N ปี', () => {
    expect(retentionCutoff(NOW, 5).toISOString()).toBe('2021-10-05T17:00:00.000Z')
    // 23:30 เวลาไทย 6 ต.ค. ยังเป็นวันเดียวกัน
    expect(retentionCutoff(new Date('2026-10-06T16:30:00.000Z'), 5).toISOString()).toBe('2021-10-05T17:00:00.000Z')
    expect(() => retentionCutoff(NOW, 0)).toThrow(RangeError)
  })

  it('ปิดวันครบรอบพอดียังเก็บ · ปิดก่อนหน้า 1 วันลบได้', () => {
    const closedOn = (iso: string) => ({ status: 'closed_success' as const, closedAt: new Date(iso), reviewedAt: null })
    // ปิด 6 ต.ค. 2564 10:00 ไทย → ครบรอบ 5 ปีวันนี้ ⇒ ยังไม่ลบ
    expect(isDebtorDocumentPurgeDue(closedOn('2021-10-06T03:00:00.000Z'), NOW, 5)).toBe(false)
    // ปิด 5 ต.ค. 2564 23:30 ไทย ⇒ ลบได้
    expect(isDebtorDocumentPurgeDue(closedOn('2021-10-05T16:30:00.000Z'), NOW, 5)).toBe(true)
    // ตั้ง 1 ปี ⇒ เคสปิดปีที่แล้วลบได้
    expect(isDebtorDocumentPurgeDue(closedOn('2025-10-01T03:00:00.000Z'), NOW, 1)).toBe(true)
  })
})

describe('เวลาอ้างอิงตามสถานะ', () => {
  it('closed_* ใช้ closed_at · rejected ใช้ reviewed_at · สถานะอื่นไม่ลบ', () => {
    const closed = new Date('2020-01-01T00:00:00Z')
    const reviewed = new Date('2019-01-01T00:00:00Z')
    expect(caseRetentionAnchor({ status: 'closed_fail', closedAt: closed, reviewedAt: reviewed })).toBe(closed)
    expect(caseRetentionAnchor({ status: 'rejected', closedAt: null, reviewedAt: reviewed })).toBe(reviewed)
    for (const status of ['active', 'approved', 'pending_recycle_review', 'draft'] as const) {
      expect(caseRetentionAnchor({ status, closedAt: closed, reviewedAt: reviewed })).toBeNull()
      expect(isDebtorDocumentPurgeDue({ status, closedAt: closed, reviewedAt: reviewed }, NOW, 1)).toBe(false)
    }
    expect(isDebtorDocumentPurgeDue({ status: 'closed_success', closedAt: null, reviewedAt: null }, NOW, 1)).toBe(false)
  })
})

describe('ข้อความ', () => {
  it('หน้าเคส + เหตุผล audit ระบุ job id ไม่มีเลขอ้างอิงสเปค', () => {
    expect(debtorDocumentsPurgedText('06/10/2569')).toBe('เอกสารถูกลบตามนโยบายเก็บข้อมูลเมื่อ 06/10/2569')
    const reason = debtorDocumentPurgeReason('job-123', 5)
    expect(reason).toContain('[job:job-123]')
    expect(reason).not.toMatch(/§|`\d{2}`/)
  })
})
