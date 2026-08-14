import { describe, expect, it } from 'vitest'
import {
  CASE_SOURCE_LABEL,
  CASE_STATUS_LABEL,
  assetTypeLabel,
  caseSourceBadgeClass,
  caseSourceLabel,
  caseStatusBadgeGroup,
  caseStatusLabel,
} from '@/lib/cases/status-display'
import { CASE_STATUSES } from '@/lib/cases/state-machine'
import { STATUS_BADGE_CLASS } from '@/lib/ui/status-badge'

describe('ป้ายสถานะเคส (`38` §7.2 · `04` §8.1)', () => {
  it('มีข้อความไทยครบทุกสถานะของ state machine — เพิ่มสถานะใหม่แล้วลืมใส่ label = เทสต์แดง', () => {
    for (const status of CASE_STATUSES) {
      expect(CASE_STATUS_LABEL[status]).toBeTruthy()
    }
    expect(Object.keys(CASE_STATUS_LABEL)).toHaveLength(CASE_STATUSES.length)
  })

  it('ทุกสถานะแมปเข้ากลุ่มสีที่มีอยู่จริงใน 10 กลุ่มของ `04` §8.1', () => {
    for (const status of CASE_STATUSES) {
      expect(STATUS_BADGE_CLASS[caseStatusBadgeGroup(status)]).toBeTruthy()
    }
  })

  it('ใช้สีตาม mockup: รอพิจารณา=เหลือง · ขอข้อมูลเพิ่ม=ม่วง · ไม่รับเคส=แดง · ร่าง=เทา', () => {
    expect(caseStatusBadgeGroup('pending_review')).toBe('pending')
    expect(caseStatusBadgeGroup('need_info')).toBe('cleared')
    expect(caseStatusBadgeGroup('rejected')).toBe('critical')
    expect(caseStatusBadgeGroup('draft')).toBe('neutral')
  })

  it('สถานะที่ไม่รู้จักคืนค่าดิบ + กลุ่มเทากลาง (ไม่กลืนความผิดปกติ)', () => {
    expect(caseStatusLabel('weird_status')).toBe('weird_status')
    expect(caseStatusBadgeGroup('weird_status')).toBe('neutral')
    expect(caseStatusLabel(null)).toBe('—')
  })
})

describe('ป้ายช่องทางรับเคส + ประเภททรัพย์', () => {
  it('ครบ 3 ช่องทางตาม `38` §6.1 และมีคลาสสีของตัวเอง', () => {
    expect(Object.keys(CASE_SOURCE_LABEL)).toEqual(['api', 'import', 'manual'])
    expect(caseSourceLabel('manual')).toBe('กรอกมือ')
    expect(caseSourceBadgeClass('api')).toContain('blue')
  })

  it('ค่าที่ไม่รู้จักไม่ทำให้หน้าจอพัง', () => {
    expect(caseSourceLabel('sms')).toBe('sms')
    expect(caseSourceBadgeClass('sms')).toBe(caseSourceBadgeClass('manual'))
    expect(assetTypeLabel('smartphone')).toBe('สมาร์ทโฟน')
    expect(assetTypeLabel(null)).toBe('—')
  })
})
