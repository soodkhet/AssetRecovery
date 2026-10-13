import { describe, expect, it } from 'vitest'
import {
  buildCaseActivityTimeline,
  mergeCaseHistory,
  type CaseActivityAuditRow,
  type CaseActivityInput,
} from '@/lib/cases/activity-timeline'
import type { CaseStatusTimelineEntry } from '@/lib/cases/status-timeline'

/** ประวัติเคส — เหตุการณ์หลังรับเคส (`38` v3.21 · ข้อสังเกต mytester "ประวัติเคสหยุดที่รับเคส") */

const A1 = 'assign-1'
const A2 = 'assign-2'
const ASSET = 'asset-1'

function row(partial: Partial<CaseActivityAuditRow> & Pick<CaseActivityAuditRow, 'action' | 'createdAt'>): CaseActivityAuditRow {
  return {
    targetType: 'case_assignments',
    targetId: A1,
    before: null,
    after: null,
    reason: null,
    actorName: 'หัวหน้าทีม',
    ...partial,
  }
}

function input(audits: CaseActivityAuditRow[], lots: CaseActivityInput['lots'] = []): CaseActivityInput {
  return {
    audits,
    lots,
    userNames: new Map([
      ['u-1', 'สมชาย'],
      ['u-2', 'สมศรี'],
    ]),
    assignmentAgents: new Map([
      [A1, 'u-1'],
      [A2, 'u-2'],
    ]),
  }
}

const at = (iso: string) => new Date(iso)

describe('buildCaseActivityTimeline', () => {
  it('ครบวงจร: มอบหมาย → รับงาน → จัดวัน → ปิดไม่สำเร็จ → ตีกลับ → ส่งใหม่สำเร็จ → รับเข้าคลัง → ยืนยันล็อต (เรียงเวลา)', () => {
    const entries = buildCaseActivityTimeline(
      input(
        [
          // ใส่สลับลำดับ — ผลต้องเรียงตามเวลา
          row({ action: 'status_change', after: { status: 'scheduled', scheduledDate: '2026-10-14T00:00:00.000Z' }, createdAt: at('2026-10-13T03:00:00Z') }),
          row({ action: 'create', after: { agentId: 'u-1', status: 'pending_accept', trackingRound: 1 }, createdAt: at('2026-10-13T01:00:00Z') }),
          row({ action: 'status_change', after: { status: 'accepted_unscheduled', events: ['assignment.accepted'] }, createdAt: at('2026-10-13T02:00:00Z'), actorName: 'สมชาย' }),
          row({ action: 'status_change', after: { status: 'closed_fail', failReason: 'debtor_not_found' }, createdAt: at('2026-10-14T05:00:00Z') }),
          row({ action: 'reject', after: { status: 'needs_revision' }, reason: 'รูปไม่ชัด', createdAt: at('2026-10-14T07:00:00Z') }),
          row({ action: 'status_change', after: { status: 'closed_success', resubmittedAt: '2026-10-14T09:00:00Z' }, createdAt: at('2026-10-14T09:00:00Z') }),
          row({ targetType: 'assets', targetId: ASSET, action: 'status_change', after: { assetStatus: 'in_stock', events: ['asset.intake'] }, createdAt: at('2026-10-15T02:00:00Z'), actorName: 'คลัง' }),
          // สลับลำดับงานในวัน = ไม่ใช่เหตุการณ์สำคัญ
          row({ action: 'update', after: { events: ['case.reordered'] }, createdAt: at('2026-10-13T04:00:00Z') }),
        ],
        [{ lotNumber: 'LOT-2569-001', confirmedAt: at('2026-10-16T03:00:00Z'), confirmedByName: 'คลัง' }],
      ),
    )
    expect(entries.map((entry) => entry.label)).toEqual([
      'มอบหมายงานให้ สมชาย',
      'สมชาย รับงาน',
      'จัดวันลงพื้นที่ 14/10/2569',
      'ปิดงานไม่สำเร็จ',
      'ตีกลับหลักฐานให้แก้ไข',
      'ส่งหลักฐานใหม่ — ปิดงานสำเร็จ',
      'คลังรับเครื่องเข้าคลัง',
      'ยืนยันล็อตส่งมอบ LOT-2569-001',
    ])
    expect(entries.map((entry) => entry.kind)).toEqual([
      'assignment',
      'assignment',
      'field',
      'fail',
      'revision',
      'success',
      'warehouse',
      'warehouse',
    ])
    expect(entries[4]).toMatchObject({ note: 'รูปไม่ชัด', actorName: 'หัวหน้าทีม' })
    expect(entries[3]?.note).not.toBeNull()
    expect(entries.at(-1)).toMatchObject({ actorName: 'คลัง', at: '2026-10-16T03:00:00.000Z' })
  })

  it('เปลี่ยนผู้รับผิดชอบ (มอบเอง/ครบเวลา) + มอบหมายรอบติดตามที่ 2', () => {
    const entries = buildCaseActivityTimeline(
      input([
        row({
          action: 'update',
          before: { agentId: 'u-1' },
          after: { agentId: 'u-2', newAssignmentId: A2 },
          reason: 'ลาป่วย',
          createdAt: at('2026-10-13T01:00:00Z'),
        }),
        row({
          action: 'update',
          targetId: A2,
          before: { agentId: 'u-2' },
          after: { agentId: 'u-x', newAssignmentId: 'assign-3', resolution: 'timeout_auto' },
          createdAt: at('2026-10-13T05:00:00Z'),
        }),
        row({ action: 'create', targetId: A2, after: { agentId: 'u-2', trackingRound: 2 }, createdAt: at('2026-10-20T01:00:00Z') }),
      ]),
    )
    expect(entries.map((entry) => entry.label)).toEqual([
      'เปลี่ยนผู้รับผิดชอบ สมชาย → สมศรี',
      'เปลี่ยนผู้รับผิดชอบ สมศรี → พนักงาน (ครบเวลารอความยินยอม)',
      'มอบหมายงานให้ สมศรี (รอบติดตามที่ 2)',
    ])
    expect(entries[0]?.note).toBe('ลาป่วย')
  })

  it('mytester5 C5-01 — เปลี่ยนแบบยินยอม/ครบเวลา: ผู้ทำ = ผู้ส่งคำขอ (ไม่ใช่พนักงานที่กดยินยอม) + "(พนักงานยินยอม)"', () => {
    const base = input([
      // แถวเก่า (ไม่มี requestedBy ใน audit) — หาผู้ขอจาก created_by ของงานใหม่
      row({
        action: 'update',
        before: { agentId: 'u-1' },
        after: { agentId: 'u-2', newAssignmentId: A2, resolution: 'consented' },
        reason: 'ย้ายพื้นที่',
        actorName: 'สมชาย',
        createdAt: at('2026-10-13T09:09:00Z'),
      }),
      // แถวใหม่ — มี requestedBy ใน audit · ครบเวลา actor = ระบบ
      row({
        action: 'update',
        targetId: A2,
        before: { agentId: 'u-2' },
        after: { agentId: 'u-1', newAssignmentId: 'assign-3', resolution: 'timeout_auto', requestedBy: 'mgr' },
        actorName: null,
        createdAt: at('2026-10-14T09:00:00Z'),
      }),
      // มอบเองทันที (ไม่มี resolution) — ผู้ทำ = actor เดิม
      row({
        action: 'update',
        before: { agentId: 'u-1' },
        after: { agentId: 'u-2', newAssignmentId: 'assign-4' },
        createdAt: at('2026-10-15T09:00:00Z'),
      }),
    ])
    const entries = buildCaseActivityTimeline({
      ...base,
      userNames: new Map([...base.userNames, ['mgr', 'ผู้จัดการ นอก']]),
      assignmentCreators: new Map([
        [A2, 'mgr'],
        ['assign-4', 'u-1'],
      ]),
    })
    expect(entries.map((entry) => [entry.label, entry.actorName])).toEqual([
      ['เปลี่ยนผู้รับผิดชอบ สมชาย → สมศรี (พนักงานยินยอม)', 'ผู้จัดการ นอก'],
      ['เปลี่ยนผู้รับผิดชอบ สมศรี → สมชาย (ครบเวลารอความยินยอม)', 'ผู้จัดการ นอก'],
      ['เปลี่ยนผู้รับผิดชอบ สมชาย → สมศรี', 'หัวหน้าทีม'],
    ])
  })

  it('คลังไม่รับเครื่อง ⇒ มีเหตุผล · audit target อื่น/ไม่รู้จัก ⇒ ข้าม', () => {
    const entries = buildCaseActivityTimeline(
      input([
        row({ targetType: 'assets', targetId: ASSET, action: 'reject', after: { assetStatus: 'rejected' }, reason: 'IMEI ไม่ตรง', createdAt: at('2026-10-15T01:00:00Z') }),
        row({ targetType: 'expenses', action: 'create', after: {}, createdAt: at('2026-10-15T02:00:00Z') }),
        row({ action: 'status_change', after: 'ไม่ใช่ object', createdAt: at('2026-10-15T03:00:00Z') }),
      ]),
    )
    expect(entries).toEqual([
      { at: '2026-10-15T01:00:00.000Z', label: 'คลังไม่รับเครื่อง', note: 'IMEI ไม่ตรง', actorName: 'หัวหน้าทีม', kind: 'revision' },
    ])
  })
})

describe('mergeCaseHistory', () => {
  const status = (atIso: string, label: string): CaseStatusTimelineEntry => ({
    at: atIso,
    label,
    fromStatus: null,
    toStatus: 'approved',
    toStatusLabel: 'อนุมัติแล้ว',
    note: null,
    actorName: null,
  })

  it('รวมสถานะเคส + เหตุการณ์ตามเวลา · เวลาเท่ากัน = สถานะเคสก่อน', () => {
    const merged = mergeCaseHistory(
      [status('2026-10-13T01:00:00.000Z', 'สร้างเคส'), status('2026-10-13T03:00:00.000Z', 'รับเคส')],
      [
        { at: '2026-10-13T03:00:00.000Z', label: 'มอบหมายงานให้ สมชาย', note: null, actorName: null, kind: 'assignment' },
        { at: '2026-10-13T02:00:00.000Z', label: 'ก่อนรับเคส', note: null, actorName: null, kind: 'field' },
      ],
    )
    expect(merged.map((item) => `${item.type}:${item.entry.label}`)).toEqual([
      'status:สร้างเคส',
      'activity:ก่อนรับเคส',
      'status:รับเคส',
      'activity:มอบหมายงานให้ สมชาย',
    ])
  })
})
