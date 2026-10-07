import { describe, expect, it } from 'vitest'
import { toTeamViewCaseDetail, toTeamViewListItem } from '@/lib/field/team-view'
import type { FieldCaseDetailDto, FieldCaseListItemDto } from '@/lib/field/types'

/** preship R3-005 (PDPA) — เพื่อนร่วมทีมเห็นแค่ชื่อลูกหนี้/พื้นที่/วัน/ชื่อพนักงาน/สถานะ */

function itemOf(overrides: Partial<FieldCaseListItemDto> = {}): FieldCaseListItemDto {
  return {
    caseId: 'case-1',
    assignmentId: 'assign-1',
    caseRef: 'REF-001',
    trackingRound: 2,
    status: 'scheduled',
    group: 'tracking',
    agentId: 'agent-b',
    agentName: 'สมหญิง ทีมเดียวกัน',
    debtorName: 'ลูกหนี้ ก',
    province: 'ชลบุรี',
    district: 'ศรีราชา',
    assetDescription: 'iPhone 15',
    assetCapacity: '256GB',
    assetColor: 'ดำ',
    debtAmountSatang: 1_000_000,
    assignedAt: '2026-08-01T03:00:00.000Z',
    acceptedAt: '2026-08-01T04:00:00.000Z',
    scheduleDate: '2026-08-20',
    scheduleOrder: 1,
    closedAt: '2026-08-21T04:00:00.000Z',
    resubmittedAt: null,
    outcome: 'closed_success',
    hasDraft: true,
    hasPendingReassignment: true,
    checkinCount: 3,
    commissionSatang: 150_000,
    noSuccessFeeSatang: 50_000,
    reassignedAway: null,
    expenseStatuses: ['pending_approval'],
    ...overrides,
  }
}

const PII_DETAIL_KEYS: readonly (keyof FieldCaseDetailDto)[] = [
  'companyName',
  'debtorNationalId',
  'debtorPassportNo',
  'debtorPhoneMobile',
  'debtorPhoneWork',
  'debtorLineId',
  'debtorFacebook',
  'imei',
  'serialNo',
  'currentAddress',
  'workAddress',
  'idCardAddress',
  'contacts',
  'documents',
  'productPhotos',
  'checkins',
  'travelOrigin',
  'draft',
  'submittedEvidence',
  'pendingReassignment',
  'rejectReason',
  'commissionSatang',
  'noSuccessFeeSatang',
  'debtAmountSatang',
  'assetDescription',
]

describe('toTeamViewCaseDetail', () => {
  it('คืนเฉพาะ allowlist มุมมองทีม', () => {
    const view = toTeamViewCaseDetail(itemOf())
    expect(view).toEqual({
      access: 'team',
      caseId: 'case-1',
      assignmentId: 'assign-1',
      caseRef: 'REF-001',
      trackingRound: 2,
      status: 'scheduled',
      group: 'tracking',
      agentId: 'agent-b',
      agentName: 'สมหญิง ทีมเดียวกัน',
      debtorName: 'ลูกหนี้ ก',
      province: 'ชลบุรี',
      district: 'ศรีราชา',
      scheduleDate: '2026-08-20',
      scheduleOrder: 1,
    })
  })

  it('ไม่หลุด PII/เงิน แม้ส่ง DTO เต็มเข้ามา (allowlist ไม่ใช่ denylist)', () => {
    const full = {
      ...itemOf(),
      access: 'full',
      debtorNationalId: '1101700012345',
      debtorPhoneMobile: '0812345678',
      imei: '356789012345678',
    } as unknown as FieldCaseListItemDto
    const view = toTeamViewCaseDetail(full) as unknown as Record<string, unknown>
    for (const key of PII_DETAIL_KEYS) expect(view).not.toHaveProperty(key)
    const raw = JSON.stringify(view)
    expect(raw).not.toContain('1101700012345')
    expect(raw).not.toContain('0812345678')
    expect(raw).not.toContain('356789012345678')
  })
})

describe('toTeamViewListItem', () => {
  it('เคสของผู้เรียกเอง = คืนเหมือนเดิมทุก field', () => {
    const own = itemOf({ agentId: 'me' })
    expect(toTeamViewListItem(own, 'me')).toBe(own)
  })

  it('เคสของเพื่อนร่วมทีม = ล้างมูลหนี้/ค่าตอบแทน/ทรัพย์/สถานะงาน คงชื่อ/พื้นที่/วัน', () => {
    const item = toTeamViewListItem(itemOf(), 'me')
    expect(item).toMatchObject({
      caseRef: 'REF-001',
      debtorName: 'ลูกหนี้ ก',
      province: 'ชลบุรี',
      district: 'ศรีราชา',
      scheduleDate: '2026-08-20',
      agentId: 'agent-b',
      agentName: 'สมหญิง ทีมเดียวกัน',
      status: 'scheduled',
      group: 'tracking',
    })
    expect(item.debtAmountSatang).toBeNull()
    expect(item.commissionSatang).toBeNull()
    expect(item.noSuccessFeeSatang).toBeNull()
    expect(item.assetDescription).toBeNull()
    expect(item.assetCapacity).toBeNull()
    expect(item.assetColor).toBeNull()
    expect(item.outcome).toBeNull()
    expect(item.closedAt).toBeNull()
    expect(item.hasDraft).toBe(false)
    expect(item.hasPendingReassignment).toBe(false)
    expect(item.checkinCount).toBe(0)
    expect(item.expenseStatuses).toEqual([])
    expect(item.reassignedAway).toBeNull()
  })
})
