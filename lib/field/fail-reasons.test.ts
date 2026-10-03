import { describe, expect, it } from 'vitest'
import { missingCloseEvidence, type CloseEvidenceInput } from '@/lib/field/evidence'
import {
  CLOSE_FAIL_REASONS,
  CLOSE_FAIL_REASON_LABEL,
  closeFailReasonForStorage,
  closeFailReasonLabel,
  closeFailReasonText,
  isCloseFailReasonComplete,
} from '@/lib/field/fail-reasons'

/** มติ PO 03/10/2569 (UAT Q16 · BUG-057) — ปิดงานไม่สำเร็จต้องเลือกเหตุผล */

describe('รายการเหตุผลมาตรฐาน', () => {
  it('ค่าเริ่มต้น 5 ข้อตามมติ PO (ลงท้ายด้วย "อื่น ๆ")', () => {
    expect(CLOSE_FAIL_REASONS.map((code) => CLOSE_FAIL_REASON_LABEL[code])).toEqual([
      'ไม่พบลูกหนี้',
      'ลูกหนี้ปฏิเสธคืน',
      'ย้ายที่อยู่ติดต่อไม่ได้',
      'ทรัพย์สูญหายหรือเสียหาย',
      'อื่น ๆ (ระบุ)',
    ])
  })

  it('รหัสที่เลิกใช้แล้วยังแสดงได้ (คืนรหัสดิบ ไม่ซ่อนข้อมูลเดิม)', () => {
    expect(closeFailReasonLabel('debtor_refused')).toBe('ลูกหนี้ปฏิเสธคืน')
    expect(closeFailReasonLabel('legacy_code')).toBe('legacy_code')
  })

  it('ข้อความสรุป "เหตุผล — คำอธิบาย"', () => {
    expect(closeFailReasonText(null, null)).toBeNull()
    expect(closeFailReasonText('debtor_not_found', null)).toBe('ไม่พบลูกหนี้')
    expect(closeFailReasonText('debtor_not_found', 'ไป 3 รอบ')).toBe('ไม่พบลูกหนี้ — ไป 3 รอบ')
    expect(closeFailReasonText('other', 'ร้านปิดถาวร')).toBe('อื่น ๆ — ร้านปิดถาวร')
  })
})

describe('ครบตามกติกา', () => {
  it('ต้องมีรหัส · "อื่น ๆ" ต้องอธิบาย', () => {
    expect(isCloseFailReasonComplete(null, null)).toBe(false)
    expect(isCloseFailReasonComplete('', null)).toBe(false)
    expect(isCloseFailReasonComplete('debtor_refused', null)).toBe(true)
    expect(isCloseFailReasonComplete('other', null)).toBe(false)
    expect(isCloseFailReasonComplete('other', '  ')).toBe(false)
    expect(isCloseFailReasonComplete('other', 'ร้านปิดถาวร')).toBe(true)
  })

  const base: CloseEvidenceInput = {
    outcome: 'closed_fail',
    checkinCount: 1,
    photoCount: 1,
    videoCount: 1,
    productPhotoCount: 0,
    hasTravelOrigin: true,
    fuelMode: null,
  }

  it('missingCloseEvidence: ไม่สำเร็จไม่มีเหตุผล → CLOSE_FAIL_REASON_REQUIRED', () => {
    expect(missingCloseEvidence({ ...base, failReason: null })).toEqual(['CLOSE_FAIL_REASON_REQUIRED'])
    expect(missingCloseEvidence({ ...base, failReason: 'other', failReasonDetail: '' })).toEqual([
      'CLOSE_FAIL_REASON_REQUIRED',
    ])
    expect(missingCloseEvidence({ ...base, failReason: 'debtor_not_found' })).toEqual([])
  })

  it('missingCloseEvidence: สำเร็จไม่ตรวจเหตุผล · undefined = ไม่ตรวจ (ล็อกตามรอบเดิมตอน resubmit)', () => {
    expect(missingCloseEvidence({ ...base, outcome: 'closed_success', productPhotoCount: 1, failReason: null })).toEqual(
      [],
    )
    expect(missingCloseEvidence(base)).toEqual([])
  })
})

describe('ค่าที่เก็บลงหลักฐาน', () => {
  it('เคสสำเร็จไม่เก็บเหตุผล แม้ draft ค้างค่าไว้', () => {
    expect(closeFailReasonForStorage('closed_success', 'other', 'x')).toEqual({ failReason: null, failReasonDetail: null })
  })

  it('เคสไม่สำเร็จเก็บรหัส + คำอธิบายที่ตัดช่องว่างแล้ว (ว่าง = null)', () => {
    expect(closeFailReasonForStorage('closed_fail', 'other', '  ร้านปิดถาวร ')).toEqual({
      failReason: 'other',
      failReasonDetail: 'ร้านปิดถาวร',
    })
    expect(closeFailReasonForStorage('closed_fail', 'debtor_refused', '   ')).toEqual({
      failReason: 'debtor_refused',
      failReasonDetail: null,
    })
  })
})
