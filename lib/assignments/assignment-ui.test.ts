import { describe, expect, it } from 'vitest'
import {
  ASSIGNMENT_STATE_LABEL,
  assignedTimeline,
  assignmentRowActions,
  assignmentStateBadgeGroup,
  expiresInText,
  KANBAN_CARD_FILTERS,
  kanbanCardMatches,
  PENDING_REASSIGNMENT_LABEL,
  reassignConfirmLabel,
  reassignWarning,
  teamSideBadgeClass,
  teamSideLabel,
} from '@/lib/assignments/assignment-ui'
import { AssignmentError } from '@/lib/assignments/errors'

/**
 * `40` §7.2/§7.3/§7.5 + §20 — ตรรกะหน้าจอที่ห้ามหลุดไปอยู่ใน JSX
 * (สาขา reassign · การซ่อนปุ่มของหัวหน้า · วันเวลากำกับ · filter ระดับการ์ด)
 */

describe('สถานะ + badge ของหน้ามอบหมาย (`40` §7.2)', () => {
  it('ป้ายสถานะ 3 ค่าตรงตาม §7.2', () => {
    expect(ASSIGNMENT_STATE_LABEL.ready_to_assign).toBe('พร้อมมอบหมาย')
    expect(ASSIGNMENT_STATE_LABEL.assigned).toBe('มอบหมายแล้ว (รอรับ)')
    expect(ASSIGNMENT_STATE_LABEL.accepted).toBe('รับงานแล้ว')
  })

  it('badge ของ pending_reassignment แยกจากสถานะหลัก', () => {
    expect(PENDING_REASSIGNMENT_LABEL).not.toBe(ASSIGNMENT_STATE_LABEL.accepted)
    expect(assignmentStateBadgeGroup('accepted')).toBe('success')
    expect(assignmentStateBadgeGroup('ready_to_assign')).toBe('pending')
    expect(assignmentStateBadgeGroup('assigned')).toBe('sent')
  })

  it('badge ทีม inhouse/outsource ใช้คนละสี (เขียว/ส้ม)', () => {
    expect(teamSideLabel('inhouse')).toBe('Inhouse')
    expect(teamSideLabel('outsource')).toBe('Outsource')
    expect(teamSideLabel(null)).toBeNull()
    expect(teamSideBadgeClass('inhouse')).not.toBe(teamSideBadgeClass('outsource'))
    expect(teamSideBadgeClass('inhouse')).toContain('emerald')
    expect(teamSideBadgeClass('outsource')).toContain('orange')
  })
})

describe('วันเวลากำกับผู้รับผิดชอบ (`40` §7.2)', () => {
  const assignedAt = '2026-08-14T03:30:00Z' // 10:30 น. เวลาไทย
  const acceptedAt = '2026-08-14T05:00:00Z' // 12:00 น. เวลาไทย

  it('ready_to_assign ไม่มีวันเวลาให้แสดง', () => {
    expect(assignedTimeline({ state: 'ready_to_assign', assignedAt: null, acceptedAt: null })).toBeNull()
  })

  it('assigned แสดงเฉพาะเวลามอบหมาย (พ.ศ. · DD/MM/YYYY HH:mm)', () => {
    expect(assignedTimeline({ state: 'assigned', assignedAt, acceptedAt: null })).toBe(
      'มอบหมายเมื่อ 14/08/2569 10:30',
    )
  })

  it('accepted แสดงทั้งเวลามอบหมายและเวลารับงาน', () => {
    expect(assignedTimeline({ state: 'accepted', assignedAt, acceptedAt })).toBe(
      'มอบหมายเมื่อ 14/08/2569 10:30 • รับงานเมื่อ 14/08/2569 12:00',
    )
  })
})

describe('ปุ่มบนแถว — settings ปิด = ซ่อน ไม่ใช่ disabled (`40` §7.2 · §20)', () => {
  it('ready_to_assign → ปุ่มมอบหมาย · assigned/accepted → ปุ่มเปลี่ยนผู้รับผิดชอบ', () => {
    expect(
      assignmentRowActions({ state: 'ready_to_assign', hasPendingReassignment: false, canAct: true }),
    ).toEqual([{ action: 'assign', label: 'มอบหมาย', tone: 'primary' }])
    expect(assignmentRowActions({ state: 'assigned', hasPendingReassignment: false, canAct: true })).toEqual([
      { action: 'reassign', label: 'เปลี่ยนผู้รับผิดชอบ', tone: 'secondary' },
    ])
    expect(assignmentRowActions({ state: 'accepted', hasPendingReassignment: false, canAct: true })).toEqual([
      { action: 'reassign', label: 'เปลี่ยนผู้รับผิดชอบ', tone: 'secondary' },
    ])
  })

  it('canAct = false (หัวหน้าที่ settings ปิด) ไม่คืนปุ่มเลยทุกสถานะ', () => {
    for (const state of ['ready_to_assign', 'assigned', 'accepted'] as const) {
      expect(assignmentRowActions({ state, hasPendingReassignment: false, canAct: false })).toEqual([])
    }
  })

  it('มีคำขอค้างอยู่ = ขอซ้ำไม่ได้ (REASSIGNMENT_ALREADY_PENDING)', () => {
    expect(assignmentRowActions({ state: 'accepted', hasPendingReassignment: true, canAct: true })).toEqual([])
  })
})

describe('สาขาของ reassign บน modal (`40` §7.3)', () => {
  it('assigned = เปลี่ยนทันที ไม่มีคำเตือน', () => {
    expect(reassignConfirmLabel('assigned')).toBe('ยืนยันเปลี่ยน')
    expect(reassignWarning('assigned')).toBeNull()
  })

  it('accepted = ส่งคำขอ + เตือนว่าไม่เปลี่ยนทันที', () => {
    expect(reassignConfirmLabel('accepted')).toBe('ส่งคำขอเปลี่ยนผู้รับผิดชอบ')
    expect(reassignWarning('accepted')).toContain('ไม่มีผลทันที')
  })

  it('เคสที่ยังไม่ถูกมอบหมายเปลี่ยนคนไม่ได้ — โยน error ตัวเดียวกับ API', () => {
    expect(() => reassignConfirmLabel('ready_to_assign')).toThrow(AssignmentError)
  })
})

describe('filter ระดับการ์ดของ Kanban (`40` §7.5 · §20)', () => {
  const assigned = { state: 'assigned', hasPendingReassignment: false } as const
  const accepted = { state: 'accepted', hasPendingReassignment: false } as const
  const waiting = { state: 'accepted', hasPendingReassignment: true } as const

  it('all ผ่านทุกการ์ด', () => {
    for (const card of [assigned, accepted, waiting]) {
      expect(kanbanCardMatches(card, 'all')).toBe(true)
    }
  })

  it('กรองตามสถานะงานได้ตรงตัว', () => {
    expect(kanbanCardMatches(assigned, 'assigned')).toBe(true)
    expect(kanbanCardMatches(accepted, 'assigned')).toBe(false)
    expect(kanbanCardMatches(accepted, 'accepted')).toBe(true)
  })

  it('pending_consent เลือกเฉพาะการ์ดที่มีคำขอค้าง (เคสยัง accepted อยู่)', () => {
    expect(kanbanCardMatches(waiting, 'pending_consent')).toBe(true)
    expect(kanbanCardMatches(accepted, 'pending_consent')).toBe(false)
    // การ์ดที่มีคำขอค้างยังนับเป็น accepted ตามปกติด้วย (`40` §6.1 accepted_at ไม่ถูกล้าง)
    expect(kanbanCardMatches(waiting, 'accepted')).toBe(true)
  })

  it('มี filter ครบ 4 ตัวตาม §7.5', () => {
    expect([...KANBAN_CARD_FILTERS]).toEqual(['all', 'assigned', 'accepted', 'pending_consent'])
  })
})

describe('เวลาที่เหลือของคำขอ (`40` §6.1.1)', () => {
  const now = new Date('2026-08-14T03:00:00Z')

  it('นับถอยหลังเป็นชั่วโมง/นาที', () => {
    expect(expiresInText('2026-08-14T05:30:00Z', now)).toBe('เหลืออีก 2 ชม. 30 นาที')
    expect(expiresInText('2026-08-14T03:45:00Z', now)).toBe('เหลืออีก 45 นาที')
  })

  it('เลยกำหนดแล้วบอกว่ารอระบบเปลี่ยนอัตโนมัติ (job อาจยังไม่รัน)', () => {
    expect(expiresInText('2026-08-14T02:59:00Z', now)).toBe('หมดเวลาแล้ว — รอระบบเปลี่ยนให้อัตโนมัติ')
  })
})
