import { describe, expect, it } from 'vitest'
import {
  DEFAULT_STATUS_GROUP,
  knownBadgeStatuses,
  STATUS_BADGE_CLASS,
  statusBadgeClass,
  statusBadgeGroup,
  type StatusBadgeGroup,
} from '@/lib/ui/status-badge'

/** ยามของ `04` §8.1 — 10 กลุ่มสีตายตัว ห้ามเพิ่ม/เปลี่ยนคลาสโดยไม่แก้ mockup + เอกสารคู่กัน */

const EXPECTED_CLASSES: Record<StatusBadgeGroup, string> = {
  success: 'bg-emerald-100 text-emerald-800',
  sent: 'bg-blue-100 text-blue-800',
  partial: 'bg-cyan-100 text-cyan-800',
  pending: 'bg-amber-100 text-amber-800',
  cleared: 'bg-purple-100 text-purple-800',
  neutral: 'bg-slate-100 text-slate-700',
  critical: 'bg-red-100 text-red-800',
  warning: 'bg-orange-100 text-orange-800',
  superseded: 'bg-slate-200 text-slate-500',
  info: 'bg-blue-50 text-blue-600',
}

describe('STATUS_BADGE_CLASS', () => {
  it('มีครบ 10 กลุ่มและคลาสตรงกับ `04` §8.1 เป๊ะ', () => {
    expect(Object.keys(STATUS_BADGE_CLASS)).toHaveLength(10)
    expect(STATUS_BADGE_CLASS).toEqual(EXPECTED_CLASSES)
  })
})

describe('statusBadgeGroup', () => {
  const cases: ReadonlyArray<[string, StatusBadgeGroup]> = [
    ['completed', 'success'],
    ['locked', 'success'],
    ['matched', 'success'],
    // `35` §8 — badge 4 สีของรายการเดินบัญชี (แดง/เขียว/ฟ้า/เทา)
    ['auto_matched', 'success'],
    ['verified', 'success'],
    ['paid', 'success'],
    ['closed', 'success'],
    ['approved', 'success'],
    ['active', 'success'],
    ['accepted', 'success'],
    // `33` §8 — รอบนำส่ง WHT ที่ยื่นแบบแล้ว
    ['filed', 'success'],
    // `34` §8 — ข้อยกเว้นที่แก้ต้นทางจริงแล้ว
    ['resolved', 'success'],
    ['sent', 'sent'],
    // `30` §6.1 — รอบบัญชีที่ส่งสำนักงานบัญชีแล้ว
    ['sent_to_accountant', 'sent'],
    ['ready_for_billing', 'sent'],
    ['billed', 'sent'],
    ['file_generated', 'sent'],
    ['manual_matched', 'sent'],
    ['exported', 'sent'],
    ['partially_paid', 'partial'],
    ['answered', 'partial'],
    ['checking', 'pending'],
    ['collecting', 'pending'],
    ['pending', 'pending'],
    ['pending_approval', 'pending'],
    ['cleared', 'cleared'],
    ['pending_warehouse_confirm', 'cleared'],
    // `34` §8 — ข้อยกเว้นที่ผู้บริหารอนุมัติให้ข้าม (คนละสีกับ `resolved` เสมอ — §6.3)
    ['authorized', 'cleared'],
    ['draft', 'neutral'],
    ['in_progress', 'neutral'],
    ['not_exported', 'neutral'],
    ['unmatched_resolved', 'neutral'],
    ['critical', 'critical'],
    ['open', 'critical'],
    ['unmatched', 'critical'],
    ['suspended', 'critical'],
    ['deactivated', 'critical'],
    ['rejected', 'critical'],
    ['unverified', 'critical'],
    // `31` §9.1 · `33` §10 — เอกสารทางภาษีที่ถูกยกเลิก (terminal ห้ามลบ)
    ['cancelled', 'critical'],
    ['needs_revision', 'warning'],
    ['warning', 'warning'],
    ['superseded', 'superseded'],
    ['info', 'info'],
  ]

  it.each(cases)('%s → กลุ่ม %s', (status, group) => {
    expect(statusBadgeGroup(status)).toBe(group)
    expect(statusBadgeClass(status)).toBe(EXPECTED_CLASSES[group])
  })

  it('ครอบคลุมทุกสถานะที่ตาราง `04` §8.1 ระบุไว้ (ไม่มีตกหล่น/เกิน)', () => {
    expect([...knownBadgeStatuses()].sort()).toEqual(cases.map(([status]) => status).sort())
  })

  it('normalize ตัวพิมพ์และช่องว่าง', () => {
    expect(statusBadgeGroup('  APPROVED ')).toBe('success')
  })

  it('สถานะที่ยังไม่จัดหมวด/ค่าว่าง → กลุ่มกลาง ไม่สื่อความหมายผิด', () => {
    expect(statusBadgeGroup('closed_success')).toBe(DEFAULT_STATUS_GROUP)
    expect(statusBadgeGroup(null)).toBe(DEFAULT_STATUS_GROUP)
    expect(statusBadgeGroup('')).toBe(DEFAULT_STATUS_GROUP)
    expect(statusBadgeClass(undefined)).toBe(EXPECTED_CLASSES[DEFAULT_STATUS_GROUP])
  })
})
