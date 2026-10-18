import { describe, expect, it } from 'vitest'
import {
  blocksTeamChange,
  isTeamOrGroupChange,
  maskClaimAmounts,
  suspendWarnings,
  teamChangeBlockers,
  teamChangeBlockMessage,
} from '@/lib/users/pending-work'
import type { UserPendingWorkDto } from '@/lib/users/types'

const EMPTY: UserPendingWorkDto = { openAssignments: [], pendingClaims: [], approvalQueues: [] }

function assignment(caseRef: string, index = 0) {
  return { assignmentId: `a-${caseRef}-${index}`, caseId: `c-${caseRef}`, caseRef, status: 'scheduled' as const }
}

describe('ย้ายทีม/กลุ่มขณะมีงานค้าง (มติ D7-03 · mytester7 S7-AG7-01/03)', () => {
  it('เปลี่ยนทีม หรือย้ายกลุ่ม = ย้าย · เปลี่ยนแค่บทบาทในกลุ่ม/ทีมเดิม = ไม่ใช่', () => {
    const before = { teamId: 'team-in', roleGroup: 'inhouse' as const }
    expect(isTeamOrGroupChange(before, { teamId: 'team-out', roleGroup: 'outsource' })).toBe(true)
    expect(isTeamOrGroupChange(before, { teamId: 'team-in2', roleGroup: 'inhouse' })).toBe(true)
    expect(isTeamOrGroupChange(before, { teamId: null, roleGroup: 'system' })).toBe(true)
    expect(isTeamOrGroupChange(before, { teamId: 'team-in', roleGroup: 'inhouse' })).toBe(false)
  })

  it('ไม่มีงานค้าง = ย้ายได้ · มีงานภาคสนามเปิด หรือใบเบิกไม่ผูกงานรออนุมัติ = กัน', () => {
    expect(blocksTeamChange(EMPTY)).toBe(false)
    expect(blocksTeamChange({ ...EMPTY, openAssignments: [assignment('SPC-1')] })).toBe(true)
    expect(
      blocksTeamChange({
        ...EMPTY,
        pendingClaims: [{ expenseId: 'e1', expenseType: 'hotel', grossSatang: 79_999, status: 'pending_approval' }],
      }),
    ).toBe(true)
  })

  it('ข้อความปฏิเสธระบุเลขเคส (ไม่ซ้ำ) + ใบเบิก (ชนิด + ยอด) และไม่มีเลขอ้างอิงสเปค', () => {
    const message = teamChangeBlockMessage({
      openAssignments: [assignment('SPC-MT7-1018-005'), assignment('SPC-MT7-1018-014'), assignment('SPC-MT7-1018-005', 1)],
      pendingClaims: [{ expenseId: 'e1', expenseType: 'hotel', grossSatang: 79_999, status: 'pending_approval' }],
    })
    expect(message).toContain('งานภาคสนามที่ยังไม่จบ 2 เคส (SPC-MT7-1018-005, SPC-MT7-1018-014)')
    expect(message).toContain('ค่าที่พัก ฿799.99')
    expect(message).toContain('จึงจะย้ายทีม/กลุ่มได้')
    expect(message).not.toMatch(/§|ไฟล์ \d|`\d\d`/)
  })

  it('เคสเกิน 10 รายการ ⇒ สรุป "และอีก N เคส"', () => {
    const refs = Array.from({ length: 12 }, (_, index) => assignment(`C-${index + 1}`))
    const [line] = teamChangeBlockers({ openAssignments: refs, pendingClaims: [] })
    expect(line).toContain('12 เคส')
    expect(line).toContain('C-10 และอีก 2 เคส')
    expect(line).not.toContain('C-11')
  })
})

describe('กล่องยืนยันระงับเตือนงานค้างทุกชนิด (mytester7 S7-AG7-04)', () => {
  it('ไม่มีงานค้าง ⇒ ไม่มีบรรทัดเตือน', () => {
    expect(suspendWarnings(EMPTY)).toEqual([])
  })

  it('คิวรออนุมัติของผู้ใช้ + ระบุเมื่อเป็นผู้อนุมัติคนเดียว · คิวที่ว่างไม่แสดง · ชนเพดานแสดง N+', () => {
    const lines = suspendWarnings({
      ...EMPTY,
      approvalQueues: [
        { id: 'case_pending_review', label: 'เคสรอพิจารณารับ', count: 1, capped: false, soleApprover: true },
        { id: 'compensation_my_step', label: 'ค่าตอบแทนรออนุมัติ', count: 300, capped: true, soleApprover: false },
        { id: 'advance_pending_approval', label: 'เงินทดรองรออนุมัติ', count: 0, capped: false, soleApprover: true },
      ],
    })
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('เคสรอพิจารณารับ 1 รายการ')
    expect(lines[0]).toContain('ผู้อนุมัติคนเดียว')
    expect(lines[1]).toBe('ค่าตอบแทนรออนุมัติ 300+ รายการ')
  })

  it('งานภาคสนาม + ใบเบิกของผู้ใช้ เตือนด้วย', () => {
    const lines = suspendWarnings({
      openAssignments: [assignment('SPC-1')],
      pendingClaims: [{ expenseId: 'e1', expenseType: 'manual', grossSatang: 10_000, status: 'needs_revision' }],
      approvalQueues: [],
    })
    expect(lines[0]).toContain('งานภาคสนามที่ยังไม่จบ 1 เคส (SPC-1)')
    expect(lines[1]).toContain('ใบเบิกของผู้ใช้ที่รออนุมัติ/ถูกตีกลับ 1 รายการ')
  })
})

describe('ซ่อนยอดเงินใบเบิกจากผู้ที่ดูใบเบิกไม่ได้ (mytester7 security L2)', () => {
  const work = {
    openAssignments: [],
    pendingClaims: [{ expenseId: 'e1', expenseType: 'hotel' as const, grossSatang: 79_999, status: 'pending_approval' as const }],
  }

  it('ดูใบเบิกได้ ⇒ คงยอด · ดูไม่ได้ ⇒ ยอดเป็น null แต่ยังนับจำนวน/ชนิด (ยังกันการย้าย)', () => {
    expect(maskClaimAmounts(work, true)).toBe(work)
    const masked = maskClaimAmounts(work, false)
    expect(masked.pendingClaims[0]?.grossSatang).toBeNull()
    expect(blocksTeamChange(masked)).toBe(true)
  })

  it('ข้อความเมื่อซ่อนยอด: มีชนิดใบเบิก ไม่มียอดเงิน', () => {
    const message = teamChangeBlockMessage(maskClaimAmounts(work, false))
    expect(message).toContain('1 รายการ')
    expect(message).not.toMatch(/฿|799\.99/)
  })
})
