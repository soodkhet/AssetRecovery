import { describe, expect, it } from 'vitest'
import {
  rejectedUploadPath,
  uploadDisplayName,
  withoutUpload,
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
    assetCapacity: null,
    assetColor: null,
    debtAmountSatang: 1_000_000,
    assignedAt: '2026-08-01T03:00:00.000Z',
    acceptedAt: '2026-08-01T04:00:00.000Z',
    scheduleDate: '2026-08-20',
    scheduleOrder: 1,
    closedAt: null,
    resubmittedAt: null,
    outcome: null,
    hasDraft: false,
    hasPendingReassignment: false,
    checkinCount: 0,
    commissionSatang: null,
    noSuccessFeeSatang: null,
    reassignedAway: null,
    expenseStatuses: [],
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
          failReason: null,
          failReasonDetail: null,
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
          note: 'บ้านปิด เพื่อนบ้านบอกย้ายออกแล้ว',
          failReason: 'moved_unreachable',
          failReasonDetail: null,
          submittedAt: '2026-08-20T06:00:00.000Z',
        },
      }),
    )
    expect(form.outcome).toBe('closed_fail')
    expect(form.photos).toEqual(['p1', 'p2'])
    expect(form.audioUrl).toBe('a1')
    // UAT Q15 — บันทึกเพิ่มเติมของชุดเดิมตั้งเป็นค่าเริ่มต้นของฟอร์มส่งกลับ
    expect(form.note).toBe('บ้านปิด เพื่อนบ้านบอกย้ายออกแล้ว')
    // UAT Q16 — เหตุผลไม่สำเร็จของรอบเดิม (ล็อก)
    expect(form.failReason).toBe('moved_unreachable')
  })
})

describe('closeFormMissing (`41` §12 · §20 — บอกครบครั้งเดียว)', () => {
  it('มีแค่เช็คอิน ไม่มีรูป/วิดีโอ → บอกทั้งรูปและวิดีโอพร้อมกัน', () => {
    const missing = closeFormMissing(
      formOf({ outcome: 'closed_fail', failReason: 'debtor_not_found' }),
      detailOf({ checkins: [checkin] }),
    )
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
    const form = formOf({ outcome: 'closed_fail', photos: ['p1'], videos: ['v1'], failReason: 'debtor_refused' })
    expect(closeFormMissing(form, detail)).toEqual([])
    expect(canSubmitCloseForm(form, detail)).toBe(true)
  })

  it('ปิดงานไม่สำเร็จไม่เลือกเหตุผล → CLOSE_FAIL_REASON_REQUIRED (มติ PO 03/10/2569 Q16)', () => {
    const detail = detailOf({ checkins: [checkin] })
    const form = formOf({ outcome: 'closed_fail', photos: ['p1'], videos: ['v1'] })
    expect(closeFormMissing(form, detail)).toEqual(['CLOSE_FAIL_REASON_REQUIRED'])
    expect(closeMissingSummary(closeFormMissing(form, detail))).toBe('ยังขาด: เหตุผลที่ไม่สำเร็จ')
    expect(canSubmitCloseForm(form, detail)).toBe(false)
  })

  it('เลือก "อื่น ๆ" ต้องอธิบาย — ช่องว่างล้วนไม่นับ', () => {
    const detail = detailOf({ checkins: [checkin] })
    const base = { outcome: 'closed_fail' as const, photos: ['p1'], videos: ['v1'], failReason: 'other' as const }
    expect(closeFormMissing(formOf({ ...base, failReasonDetail: '   ' }), detail)).toEqual(['CLOSE_FAIL_REASON_REQUIRED'])
    expect(closeFormMissing(formOf({ ...base, failReasonDetail: 'ร้านปิดถาวร' }), detail)).toEqual([])
  })

  it('ปิดงานสำเร็จไม่ต้องมีเหตุผล', () => {
    const form = formOf({ outcome: 'closed_success', photos: ['p1'], videos: ['v1'], productPhotos: ['pp1'] })
    expect(closeFormMissing(form, detailOf({ checkins: [checkin] }))).toEqual([])
  })

  it('ยังไม่เลือก outcome → CLOSE_OUTCOME_REQUIRED มาก่อนเสมอ', () => {
    expect(closeFormMissing(formOf(), detailOf())[0]).toBe('CLOSE_OUTCOME_REQUIRED')
  })

  it('ทีม PER_KM ไม่มีจุดเริ่มเดินทาง → CLOSE_TRAVEL_ORIGIN_REQUIRED (ทีม DAILY_FLAT ไม่เช็ค)', () => {
    const form = formOf({ outcome: 'closed_fail', photos: ['p1'], videos: ['v1'], failReason: 'debtor_not_found' })
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
      note: null,
      failReason: null,
      failReasonDetail: null,
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

  it('เหตุผลไม่สำเร็จส่งเฉพาะ outcome = ไม่สำเร็จ · resubmit ไม่ส่ง (ล็อกตามรอบเดิม — UAT Q16)', () => {
    const fail = formOf({ outcome: 'closed_fail', failReason: 'other', failReasonDetail: 'ร้านปิดถาวร' })
    expect(closeCasePayload(fail)).toMatchObject({ failReason: 'other', failReasonDetail: 'ร้านปิดถาวร' })
    expect(closeDraftPayload(fail)).toMatchObject({ failReason: 'other', failReasonDetail: 'ร้านปิดถาวร' })
    // สลับกลับเป็นสำเร็จ — ค่าที่ค้างใน state ไม่ถูกส่งไปปนกับหลักฐาน
    const switched = { ...fail, outcome: 'closed_success' as const }
    expect(closeCasePayload(switched)).toMatchObject({ failReason: null, failReasonDetail: null })
    expect(resubmitClosePayload(fail)).not.toHaveProperty('failReason')
  })

  it('โหมดตีกลับไม่ตรวจเหตุผล (ล็อกตามรอบเดิม แม้รอบเดิมไม่มี)', () => {
    const detail = detailOf({
      status: 'needs_revision',
      checkins: [checkin],
      submittedEvidence: {
        outcome: 'closed_fail',
        photos: ['p1'],
        videos: ['v1'],
        productPhotos: [],
        audioUrl: null,
        note: null,
        failReason: null,
        failReasonDetail: null,
        submittedAt: '2026-08-20T06:00:00.000Z',
      },
    })
    expect(closeFormMissing(formOf({ outcome: 'closed_fail', photos: ['p2'], videos: ['v1'] }), detail)).toEqual([])
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

describe('ไฟล์ที่ server ปัดต้องออกจากฟอร์ม ไม่ถือไว้ให้ autosave ล้มซ้ำ (UAT BUG-070)', () => {
  const bad = 'cases/c1/field_evidence/photo/0b6f3c1e-2a4d-4f7e-9c1a-1234567890ab-fake.jpg'
  const form: CloseFormState = {
    ...EMPTY_CLOSE_FORM,
    outcome: 'closed_success',
    photos: ['p-ok.jpg', bad],
    videos: ['v.mp4'],
  }

  it('อ่าน path จาก error กลุ่ม UPLOAD_* เท่านั้น', () => {
    expect(rejectedUploadPath({ code: 'UPLOAD_FILE_TYPE_INVALID', payload: { path: bad } })).toBe(bad)
    expect(rejectedUploadPath({ code: 'CLOSE_PHOTO_REQUIRED', payload: { path: bad } })).toBeNull()
    expect(rejectedUploadPath({ code: 'UPLOAD_FILE_NOT_FOUND' })).toBeNull()
    expect(rejectedUploadPath(undefined)).toBeNull()
  })

  it('เอาไฟล์ออกจากทุกช่อง · ไม่อยู่ในฟอร์มคืนตัวเดิม', () => {
    const cleaned = withoutUpload(form, bad)
    expect(cleaned.photos).toEqual(['p-ok.jpg'])
    expect(cleaned.videos).toEqual(['v.mp4'])
    expect(withoutUpload(form, 'อื่น')).toBe(form)
    expect(withoutUpload({ ...form, audioUrl: bad }, bad).audioUrl).toBeNull()
  })

  it('ชื่อไฟล์ที่ผู้ใช้เห็นตัด uuid หน้าออก', () => {
    expect(uploadDisplayName(bad)).toBe('fake.jpg')
    expect(uploadDisplayName('a/b/plain.png')).toBe('plain.png')
  })
})
