import { describe, expect, it } from 'vitest'
import { DEFAULT_ASSIGNMENT_POLICY } from '@/lib/assignments/policy'
import {
  DEFAULT_ASSIGNMENT_POLICY_VALUES,
  MAX_ACCEPT_DEADLINE_HOURS,
  MAX_REASSIGN_TIMEOUT_HOURS,
  MIN_REASSIGN_TIMEOUT_HOURS,
  describeAcceptDeadline,
  toAssignmentPolicyAuditPayload,
} from '@/lib/settings/assignment-policy'
import { assignmentPolicyFieldsSchema, assignmentPolicyUpdateSchema } from '@/lib/settings/schemas'

/** นโยบายการมอบหมายงาน (`40` §6.4/§11 — UAT BUG-002 · มติ PO 03/10/2569) */
describe('ค่าเริ่มต้นและ payload ของนโยบายการมอบหมายงาน', () => {
  it('ค่าเริ่มต้นตรงสเปค: timeout 3 ชม. · หัวหน้าทีมทำได้ทุกกลุ่ม · ไม่มีเส้นตายกดรับงาน', () => {
    expect(DEFAULT_ASSIGNMENT_POLICY_VALUES).toEqual({
      reassignTimeoutHours: 3,
      supervisorCanAssignSystem: true,
      supervisorCanAssignInhouse: true,
      supervisorCanAssignOutsource: true,
      acceptDeadlineHours: null,
    })
    expect(DEFAULT_ASSIGNMENT_POLICY_VALUES.reassignTimeoutHours).toBe(DEFAULT_ASSIGNMENT_POLICY.reassignTimeoutHours)
  })

  it('payload ของ audit ใช้ชื่อคอลัมน์จริง และไม่แตะ sla_alert_hours (เป็นของแท็บ SLA)', () => {
    const payload = toAssignmentPolicyAuditPayload({
      reassignTimeoutHours: 5,
      supervisorCanAssignSystem: true,
      supervisorCanAssignInhouse: false,
      supervisorCanAssignOutsource: true,
      acceptDeadlineHours: 24,
    })
    expect(payload).toEqual({
      reassign_timeout_hours: 5,
      supervisor_can_assign_system: true,
      supervisor_can_assign_inhouse: false,
      supervisor_can_assign_outsource: true,
      accept_deadline_hours: 24,
    })
    expect(payload).not.toHaveProperty('sla_alert_hours')
  })

  it('ป้ายเส้นตายกดรับงาน — null = ไม่จำกัดเวลา', () => {
    expect(describeAcceptDeadline(null)).toBe('ไม่จำกัดเวลา')
    expect(describeAcceptDeadline(24)).toBe('24 ชั่วโมง')
  })
})

describe('assignmentPolicyUpdateSchema', () => {
  const valid = {
    ...DEFAULT_ASSIGNMENT_POLICY_VALUES,
    reason: 'ปรับตามมติที่ประชุมทีมติดตาม',
  }

  it('รับค่าเริ่มต้นพร้อมเหตุผล', () => {
    expect(assignmentPolicyUpdateSchema.safeParse(valid).success).toBe(true)
  })

  it('timeout ต้องเป็นจำนวนเต็มชั่วโมงในช่วง 1–168', () => {
    expect(assignmentPolicyUpdateSchema.safeParse({ ...valid, reassignTimeoutHours: 0 }).success).toBe(false)
    expect(assignmentPolicyUpdateSchema.safeParse({ ...valid, reassignTimeoutHours: 2.5 }).success).toBe(false)
    expect(
      assignmentPolicyUpdateSchema.safeParse({ ...valid, reassignTimeoutHours: MAX_REASSIGN_TIMEOUT_HOURS + 1 }).success,
    ).toBe(false)
    expect(
      assignmentPolicyUpdateSchema.safeParse({ ...valid, reassignTimeoutHours: MIN_REASSIGN_TIMEOUT_HOURS }).success,
    ).toBe(true)
    expect(
      assignmentPolicyUpdateSchema.safeParse({ ...valid, reassignTimeoutHours: MAX_REASSIGN_TIMEOUT_HOURS }).success,
    ).toBe(true)
  })

  it('เส้นตายกดรับงาน: null = ไม่จำกัด · ตัวเลขต้องเป็นจำนวนเต็ม ≥ 1 และไม่เกินเพดาน', () => {
    expect(assignmentPolicyUpdateSchema.safeParse({ ...valid, acceptDeadlineHours: null }).success).toBe(true)
    expect(assignmentPolicyUpdateSchema.safeParse({ ...valid, acceptDeadlineHours: 24 }).success).toBe(true)
    expect(assignmentPolicyUpdateSchema.safeParse({ ...valid, acceptDeadlineHours: 0 }).success).toBe(false)
    expect(
      assignmentPolicyUpdateSchema.safeParse({ ...valid, acceptDeadlineHours: MAX_ACCEPT_DEADLINE_HOURS + 1 }).success,
    ).toBe(false)
  })

  it('สวิตช์หัวหน้าทีมต้องครบทั้ง 3 Role Group และเป็น boolean', () => {
    const { supervisorCanAssignSystem: _omit, ...missing } = valid
    expect(assignmentPolicyUpdateSchema.safeParse(missing).success).toBe(false)
    expect(assignmentPolicyUpdateSchema.safeParse({ ...valid, supervisorCanAssignInhouse: 'false' }).success).toBe(false)
  })

  it('ไม่มีเหตุผล/เหตุผลว่าง = ไม่ผ่าน (กระทบสิทธิ์ — reason บังคับ)', () => {
    expect(assignmentPolicyUpdateSchema.safeParse({ ...valid, reason: '' }).success).toBe(false)
    expect(assignmentPolicyUpdateSchema.safeParse({ ...valid, reason: '    ' }).success).toBe(false)
    expect(assignmentPolicyFieldsSchema.safeParse(DEFAULT_ASSIGNMENT_POLICY_VALUES).success).toBe(true)
  })
})
