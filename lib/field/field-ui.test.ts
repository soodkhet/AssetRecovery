import { describe, expect, it } from 'vitest'
import { FIELD_STATUSES } from '@/lib/field/field-status'
import {
  FIELD_STATUS_LABEL,
  assetSummary,
  casesScheduledOn,
  facebookHref,
  fieldCardAction,
  fieldStatusBadgeGroup,
  formatFieldAddress,
  groupCasesByAgent,
  groupCasesByDate,
  lineHref,
  mapsSearchHref,
  reorderCaseIds,
  splitTrackingCases,
  teammatesInProvince,
  telHref,
} from '@/lib/field/field-ui'
import { nextScheduleOrder } from '@/lib/field/schedule'
import type { FieldCaseListItemDto } from '@/lib/field/types'

function item(overrides: Partial<FieldCaseListItemDto> = {}): FieldCaseListItemDto {
  return {
    caseId: 'case-1',
    assignmentId: 'assign-1',
    caseRef: 'REF-001',
    trackingRound: 1,
    status: 'scheduled',
    group: 'tracking',
    agentId: 'agent-1',
    agentName: 'สมชาย ใจดี',
    debtorName: 'ลูกหนี้ ก',
    province: 'ชลบุรี',
    district: 'ศรีราชา',
    assetDescription: 'iPhone 15',
    debtAmountSatang: 1_000_000,
    assignedAt: '2026-08-01T03:00:00.000Z',
    acceptedAt: null,
    scheduleDate: '2026-08-20',
    scheduleOrder: 1,
    closedAt: null,
    outcome: null,
    hasDraft: false,
    hasPendingReassignment: false,
    checkinCount: 0,
    commissionSatang: null,
    noSuccessFeeSatang: null,
    reassignedAway: null,
    expenseStatuses: [],
    ...overrides,
  }
}

describe('ป้ายสถานะงานภาคสนาม', () => {
  it('มีข้อความและกลุ่มสีครบทุกสถานะของ state machine', () => {
    for (const status of FIELD_STATUSES) {
      expect(FIELD_STATUS_LABEL[status]).toBeTruthy()
      expect(fieldStatusBadgeGroup(status)).toBeTruthy()
    }
  })
})

describe('ปุ่มหลักของการ์ด (`41` §7.2/§7.3/§7.5)', () => {
  it('รอรับงาน → "รับงาน" · รับงานแล้ว → "จัดวันที่"', () => {
    expect(fieldCardAction({ status: 'pending_accept', hasDraft: false, hasPendingReassignment: false })?.kind).toBe(
      'accept',
    )
    expect(
      fieldCardAction({ status: 'accepted_unscheduled', hasDraft: false, hasPendingReassignment: false })?.kind,
    ).toBe('schedule')
  })

  it('scheduled: ยังไม่มี draft = "เริ่มงาน" · มี draft ค้าง = "จบงาน"', () => {
    expect(fieldCardAction({ status: 'scheduled', hasDraft: false, hasPendingReassignment: false })).toMatchObject({
      kind: 'start_work',
      label: 'เริ่มงาน',
    })
    expect(fieldCardAction({ status: 'scheduled', hasDraft: true, hasPendingReassignment: false })).toMatchObject({
      kind: 'finish_work',
      label: 'จบงาน',
    })
  })

  it('คำขอเปลี่ยนผู้รับผิดชอบค้างตอบ ชนะปุ่มเริ่มงาน/จบงานเสมอ', () => {
    expect(fieldCardAction({ status: 'scheduled', hasDraft: true, hasPendingReassignment: true })).toMatchObject({
      kind: 'respond_reassignment',
      tone: 'reassign',
    })
  })

  it('needs_revision → แก้ไขหลักฐาน · ปิดงานแล้ว/ถูกโอนไป = ไม่มีปุ่ม', () => {
    expect(fieldCardAction({ status: 'needs_revision', hasDraft: false, hasPendingReassignment: false })?.kind).toBe(
      'revise_evidence',
    )
    expect(fieldCardAction({ status: 'closed_success', hasDraft: false, hasPendingReassignment: false })).toBeNull()
    expect(fieldCardAction({ status: 'reassigned_away', hasDraft: false, hasPendingReassignment: false })).toBeNull()
  })

  it('มุมมองทีมเป็น read-only เสมอ — ไม่มีปุ่มแม้สถานะจะทำได้ (`41` §11)', () => {
    expect(
      fieldCardAction({
        status: 'accepted_unscheduled',
        hasDraft: false,
        hasPendingReassignment: false,
        readOnly: true,
      }),
    ).toBeNull()
  })
})

describe('จัดกลุ่มรายการ (`41` §7.3/§7.5)', () => {
  it('จัดกลุ่มตามวันเรียงจากใกล้ไปไกล และเรียงในวันตาม scheduleOrder', () => {
    const sections = groupCasesByDate([
      item({ caseId: 'c3', scheduleDate: '2026-08-21', scheduleOrder: 1 }),
      item({ caseId: 'c2', scheduleDate: '2026-08-20', scheduleOrder: 2 }),
      item({ caseId: 'c1', scheduleDate: '2026-08-20', scheduleOrder: 1 }),
      item({ caseId: 'c0', scheduleDate: null, scheduleOrder: null }),
    ])
    expect(sections.map((section) => section.date)).toEqual(['2026-08-20', '2026-08-21'])
    expect(sections[0]?.items.map((entry) => entry.caseId)).toEqual(['c1', 'c2'])
  })

  it('แท็บกำลังติดตามแยกบล็อกเคสที่ถูกตีกลับหลักฐานออกจากงานรายวัน', () => {
    const split = splitTrackingCases([
      item({ caseId: 'c1' }),
      item({ caseId: 'c2', status: 'needs_revision', scheduleDate: '2026-08-19' }),
    ])
    expect(split.needsRevision.map((entry) => entry.caseId)).toEqual(['c2'])
    expect(split.days.flatMap((section) => section.items.map((entry) => entry.caseId))).toEqual(['c1'])
  })

  it('มุมมองทีมแยกคอลัมน์ต่อคน โดยตัวเองมาก่อนเสมอ', () => {
    const columns = groupCasesByAgent(
      [
        item({ caseId: 'c1', agentId: 'b', agentName: 'บี' }),
        item({ caseId: 'c2', agentId: 'a', agentName: 'เอ' }),
        item({ caseId: 'c3', agentId: 'b', agentName: 'บี' }),
      ],
      'b',
    )
    expect(columns.map((column) => column.agentId)).toEqual(['b', 'a'])
    expect(columns[0]?.items).toHaveLength(2)
  })
})

describe('popup ยืนยันวันของ Calendar Picker (`41` §7.4 · §20)', () => {
  const items = [
    item({ caseId: 'c1', scheduleDate: '2026-08-20', scheduleOrder: 2 }),
    item({ caseId: 'c2', scheduleDate: '2026-08-20', scheduleOrder: 1 }),
    item({ caseId: 'c3', scheduleDate: '2026-08-21', scheduleOrder: 1 }),
    item({ caseId: 'c4', status: 'accepted_unscheduled', scheduleDate: null, scheduleOrder: null }),
  ]

  it('วันว่าง = ไม่มีลิสต์เคส และลำดับใหม่ = 1', () => {
    const existing = casesScheduledOn(items, '2026-08-25')
    expect(existing).toEqual([])
    expect(nextScheduleOrder(existing.map((entry) => entry.scheduleOrder))).toBe(1)
  })

  it('วันที่มีเคสอยู่ 2 รายการ = แสดงลิสต์ตามลำดับ และเคสใหม่ได้ลำดับ 3', () => {
    const existing = casesScheduledOn(items, '2026-08-20')
    expect(existing.map((entry) => entry.caseId)).toEqual(['c2', 'c1'])
    expect(nextScheduleOrder(existing.map((entry) => entry.scheduleOrder))).toBe(3)
  })
})

describe('ลากสลับลำดับ (`41` §7.5)', () => {
  it('ย้ายการ์ดไปตำแหน่งของเป้าหมาย', () => {
    expect(reorderCaseIds(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b'])
    expect(reorderCaseIds(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'c', 'a'])
  })

  it('ลากทับตัวเอง/รหัสไม่อยู่ในวันนั้น = ไม่มีอะไรเปลี่ยน (ไม่ยิง API)', () => {
    expect(reorderCaseIds(['a', 'b'], 'a', 'a')).toBeNull()
    expect(reorderCaseIds(['a', 'b'], 'z', 'a')).toBeNull()
  })
})

describe('banner เพื่อนร่วมทีมจังหวัดเดียวกัน (`41` §7.4)', () => {
  it('คืนชื่อเพื่อนร่วมทีมที่มีเคสจังหวัดเดียวกัน ไม่นับตัวเอง และไม่ซ้ำชื่อ', () => {
    const names = teammatesInProvince(
      [
        item({ agentId: 'me', agentName: 'ฉัน' }),
        item({ agentId: 'x', agentName: 'สมหญิง' }),
        item({ agentId: 'x', agentName: 'สมหญิง' }),
        item({ agentId: 'y', agentName: 'อนันต์', province: 'ระยอง' }),
      ],
      'ชลบุรี',
      'me',
    )
    expect(names).toEqual(['สมหญิง'])
  })

  it('ไม่มีจังหวัด = ไม่แสดง banner', () => {
    expect(teammatesInProvince([item({ agentId: 'x' })], null, 'me')).toEqual([])
  })
})

describe('ที่อยู่ + ช่องทางติดต่อ (`41` §6.3 · §7.7)', () => {
  it('ประกอบที่อยู่บรรทัดเดียวและข้ามช่องที่ว่าง', () => {
    expect(
      formatFieldAddress({
        detail: '99/1 หมู่ 2',
        subdistrict: 'สุรศักดิ์',
        district: 'ศรีราชา',
        province: 'ชลบุรี',
        postalCode: '20110',
      }),
    ).toBe('99/1 หมู่ 2 ตำบลสุรศักดิ์ อำเภอศรีราชา จังหวัดชลบุรี 20110')

    expect(
      formatFieldAddress({ detail: null, subdistrict: null, district: null, province: 'ชลบุรี', postalCode: null }),
    ).toBe('จังหวัดชลบุรี')

    expect(
      formatFieldAddress({ detail: null, subdistrict: null, district: null, province: null, postalCode: null }),
    ).toBeNull()
  })

  it('ที่อยู่ว่างไม่มีลิงก์แผนที่', () => {
    expect(
      mapsSearchHref({ detail: null, subdistrict: null, district: null, province: null, postalCode: null }),
    ).toBeNull()
    expect(
      mapsSearchHref({ detail: '99/1', subdistrict: null, district: null, province: 'ชลบุรี', postalCode: null }),
    ).toContain('https://www.google.com/maps/search/')
  })

  it('tel: ตัดขีดออก · LINE/Facebook ปล่อยลิงก์เต็มผ่านตรง ๆ', () => {
    expect(telHref('081-234-5678')).toBe('tel:0812345678')
    expect(telHref('   ')).toBeNull()
    expect(telHref(null)).toBeNull()
    expect(lineHref('somchai')).toBe('https://line.me/ti/p/~somchai')
    expect(lineHref('')).toBeNull()
    expect(facebookHref('https://facebook.com/somchai')).toBe('https://facebook.com/somchai')
    expect(facebookHref('สมชาย ใจดี')).toContain('search/people')
  })

  it('ทรัพย์แสดง IMEI ก่อน S/N', () => {
    expect(assetSummary({ assetDescription: 'iPhone 15', imei: '123456789012345' })).toBe(
      'iPhone 15 (IMEI: 123456789012345)',
    )
    expect(assetSummary({ assetDescription: 'iPad', imei: null, serialNo: 'SN-1' })).toBe('iPad (S/N: SN-1)')
    expect(assetSummary({ assetDescription: null })).toBe('—')
  })
})
