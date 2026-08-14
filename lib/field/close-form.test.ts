import { describe, expect, it } from 'vitest'
import {
  EMPTY_CLOSE_FORM,
  appendMedia,
  canSubmitCloseForm,
  closeCasePayload,
  closeDraftPayload,
  closeFormMissing,
  closeFormMode,
  closeFormFromDetail,
  closeMissingSummary,
  hasCloseFormRevision,
  removeMediaAt,
  resubmitClosePayload,
  type CloseFormState,
} from '@/lib/field/close-form'
import type { FieldCaseDetailDto } from '@/lib/field/types'

function detailOf(overrides: Partial<FieldCaseDetailDto> = {}): FieldCaseDetailDto {
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
    acceptedAt: '2026-08-01T04:00:00.000Z',
    scheduleDate: '2026-08-20',
    scheduleOrder: 1,
    closedAt: null,
    outcome: null,
    hasDraft: false,
    hasPendingReassignment: false,
    checkinCount: 0,
    commissionSatang: null,
    noSuccessFeeSatang: null,
    companyName: 'ไฟแนนซ์ ก',
    teamId: 'team-1',
    teamName: 'ทีมชลบุรี',
    fuelMode: 'DAILY_FLAT',
    debtorNationalId: null,
    debtorPassportNo: null,
    debtorPhoneMobile: null,
    debtorPhoneWork: null,
    debtorLineId: null,
    debtorFacebook: null,
    imei: null,
    serialNo: null,
    currentAddress: { detail: null, subdistrict: null, district: null, province: null, postalCode: null },
    workAddress: { detail: null, subdistrict: null, district: null, province: null, postalCode: null },
    idCardAddress: { detail: null, subdistrict: null, district: null, province: null, postalCode: null },
    contacts: [],
    documents: [],
    productPhotos: [],
    checkins: [],
    travelOrigin: null,
    draft: null,
    submittedEvidence: null,
    pendingReassignment: null,
    rejectReason: null,
    ...overrides,
  }
}

const checkin = {
  id: 'checkin-1',
  checkinType: 'address',
  latitude: 13.7,
  longitude: 100.5,
  addressNote: 'บ้านลูกหนี้',
  note: null,
  checkedInAt: '2026-08-20T03:00:00.000Z',
}

function formOf(overrides: Partial<CloseFormState> = {}): CloseFormState {
  return { ...EMPTY_CLOSE_FORM, ...overrides }
}

describe('closeFormMode (`41` §7.6)', () => {
  it('โหมดปกติ — แก้ได้ทุกอย่าง มีปุ่มบันทึก Draft', () => {
    const mode = closeFormMode(detailOf())
    expect(mode).toMatchObject({
      revision: false,
      outcomeLocked: false,
      checkinLocked: false,
      canSaveDraft: true,
      submitLabel: 'ยืนยันปิดงาน',
    })
  })

  it('โหมด needs_revision — ล็อก outcome/เช็คอิน ไม่มีปุ่ม Draft ปุ่มเดียวคือส่งกลับ (§10.1)', () => {
    const mode = closeFormMode(detailOf({ status: 'needs_revision' }))
    expect(mode).toMatchObject({
      revision: true,
      outcomeLocked: true,
      checkinLocked: true,
      canSaveDraft: false,
      submitLabel: 'ส่งกลับยืนยันอีกครั้ง',
    })
  })

  it('กล่องจุดเริ่มเดินทางแสดงเฉพาะทีม PER_KM (§6.4.1)', () => {
    expect(closeFormMode(detailOf({ fuelMode: 'PER_KM' })).showTravelOrigin).toBe(true)
    expect(closeFormMode(detailOf({ fuelMode: 'DAILY_FLAT' })).showTravelOrigin).toBe(false)
    expect(closeFormMode(detailOf({ fuelMode: null })).showTravelOrigin).toBe(false)
  })
})

describe('closeFormFromDetail (`41` §6.5 draft autoload)', () => {
  it('ไม่มี draft = ฟอร์มเปล่า', () => {
    expect(closeFormFromDetail(detailOf())).toEqual(EMPTY_CLOSE_FORM)
  })

  it('บันทึก Draft แล้วเปิดใหม่ = เห็นของเดิมครบ (§20)', () => {
    const form = closeFormFromDetail(
      detailOf({
        hasDraft: true,
        draft: {
          outcome: 'closed_success',
          photos: ['p1'],
          videos: [],
          productPhotos: [],
          audioUrl: null,
          note: 'ยังไม่ครบ',
          updatedAt: '2026-08-20T05:00:00.000Z',
        },
      }),
    )
    expect(form.outcome).toBe('closed_success')
    expect(form.photos).toEqual(['p1'])
    expect(form.note).toBe('ยังไม่ครบ')
  })

  it('โหมดตีกลับ = ตั้งค่าจากหลักฐานชุดที่ส่งไปแล้ว (draft ถูกลบไปตอน submit)', () => {
    const form = closeFormFromDetail(
      detailOf({
        status: 'needs_revision',
        submittedEvidence: {
          outcome: 'closed_fail',
          photos: ['p1', 'p2'],
          videos: ['v1'],
          productPhotos: [],
          audioUrl: 'a1',
          submittedAt: '2026-08-20T06:00:00.000Z',
        },
      }),
    )
    expect(form.outcome).toBe('closed_fail')
    expect(form.photos).toEqual(['p1', 'p2'])
    expect(form.audioUrl).toBe('a1')
  })
})

describe('closeFormMissing (`41` §12 · §20 — บอกครบครั้งเดียว)', () => {
  it('มีแค่เช็คอิน ไม่มีรูป/วิดีโอ → บอกทั้งรูปและวิดีโอพร้อมกัน', () => {
    const missing = closeFormMissing(formOf({ outcome: 'closed_fail' }), detailOf({ checkins: [checkin] }))
    expect(missing).toEqual(['CLOSE_PHOTO_REQUIRED', 'CLOSE_VIDEO_REQUIRED'])
    expect(closeMissingSummary(missing)).toBe('ยังขาด: รูปถ่ายอย่างน้อย 1 รูป · วิดีโออย่างน้อย 1 คลิป')
  })

  it('ปิดงานสำเร็จไม่มีรูปสินค้า → CLOSE_PRODUCT_PHOTO_REQUIRED', () => {
    const missing = closeFormMissing(
      formOf({ outcome: 'closed_success', photos: ['p1'], videos: ['v1'] }),
      detailOf({ checkins: [checkin] }),
    )
    expect(missing).toEqual(['CLOSE_PRODUCT_PHOTO_REQUIRED'])
  })

  it('ปิดงานไม่สำเร็จไม่ต้องมีรูปสินค้า → ครบ', () => {
    const detail = detailOf({ checkins: [checkin] })
    const form = formOf({ outcome: 'closed_fail', photos: ['p1'], videos: ['v1'] })
    expect(closeFormMissing(form, detail)).toEqual([])
    expect(canSubmitCloseForm(form, detail)).toBe(true)
  })

  it('ยังไม่เลือก outcome → CLOSE_OUTCOME_REQUIRED มาก่อนเสมอ', () => {
    expect(closeFormMissing(formOf(), detailOf())[0]).toBe('CLOSE_OUTCOME_REQUIRED')
  })

  it('ทีม PER_KM ไม่มีจุดเริ่มเดินทาง → CLOSE_TRAVEL_ORIGIN_REQUIRED (ทีม DAILY_FLAT ไม่เช็ค)', () => {
    const form = formOf({ outcome: 'closed_fail', photos: ['p1'], videos: ['v1'] })
    expect(closeFormMissing(form, detailOf({ fuelMode: 'PER_KM', checkins: [checkin] }))).toEqual([
      'CLOSE_TRAVEL_ORIGIN_REQUIRED',
    ])
    expect(closeFormMissing(form, detailOf({ fuelMode: 'DAILY_FLAT', checkins: [checkin] }))).toEqual([])
  })

  it('closeMissingSummary คืน null เมื่อครบแล้ว', () => {
    expect(closeMissingSummary([])).toBeNull()
  })
})

describe('โหมดตีกลับ — ต้องแก้สื่อจริงก่อนส่งกลับ (`41` §8 CLOSE_NO_EVIDENCE_REVISION)', () => {
  const detail = detailOf({
    status: 'needs_revision',
    checkins: [checkin],
    submittedEvidence: {
      outcome: 'closed_success',
      photos: ['p1'],
      videos: ['v1'],
      productPhotos: ['pp1'],
      audioUrl: null,
      submittedAt: '2026-08-20T06:00:00.000Z',
    },
  })

  it('ยังไม่แก้อะไรเลย = ส่งกลับไม่ได้', () => {
    const form = closeFormFromDetail(detail)
    expect(hasCloseFormRevision(form, detail)).toBe(false)
    expect(canSubmitCloseForm(form, detail)).toBe(false)
  })

  it('เพิ่มรูปแล้ว = ส่งกลับได้', () => {
    const form = closeFormFromDetail(detail)
    const edited = { ...form, photos: appendMedia(form.photos, ['p2']) }
    expect(hasCloseFormRevision(edited, detail)).toBe(true)
    expect(canSubmitCloseForm(edited, detail)).toBe(true)
  })

  it('แก้สื่อแล้วแต่ลบจนหลักฐานไม่ครบ = ยังส่งไม่ได้', () => {
    const form = closeFormFromDetail(detail)
    const edited = { ...form, productPhotos: removeMediaAt(form.productPhotos, 0) }
    expect(hasCloseFormRevision(edited, detail)).toBe(true)
    expect(closeFormMissing(edited, detail)).toEqual(['CLOSE_PRODUCT_PHOTO_REQUIRED'])
    expect(canSubmitCloseForm(edited, detail)).toBe(false)
  })
})

describe('payload ของแต่ละปุ่ม', () => {
  const form = formOf({ outcome: 'closed_success', photos: ['p1'], videos: ['v1'], productPhotos: ['pp1'] })

  it('close-draft ส่ง travelOrigin เฉพาะเมื่อมีพิกัดใหม่', () => {
    expect(closeDraftPayload(form)).not.toHaveProperty('travelOrigin')
    expect(
      closeDraftPayload(form, { latitude: 13.7, longitude: 100.5, source: 'manual_adjusted' }).travelOrigin,
    ).toEqual({ latitude: 13.7, longitude: 100.5, source: 'manual_adjusted' })
  })

  it('close ส่ง outcome · resubmit-close ไม่มี outcome (ล็อกตามรอบเดิม)', () => {
    expect(closeCasePayload(form).outcome).toBe('closed_success')
    expect(resubmitClosePayload(form)).not.toHaveProperty('outcome')
    expect(resubmitClosePayload(form).photos).toEqual(['p1'])
  })
})

describe('ตัวช่วยรายการสื่อ', () => {
  it('เพิ่ม/ลบไฟล์โดยไม่แก้ของเดิม (immutable)', () => {
    const list = ['a', 'b']
    expect(appendMedia(list, ['c'])).toEqual(['a', 'b', 'c'])
    expect(removeMediaAt(list, 0)).toEqual(['b'])
    expect(removeMediaAt(list, 9)).toEqual(['a', 'b'])
    expect(list).toEqual(['a', 'b'])
  })
})
