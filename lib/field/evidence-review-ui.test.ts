import { describe, expect, it } from 'vitest'
import {
  canRejectFieldEvidence,
  checkinTypeLabel,
  evidenceRoundBadge,
  fieldEvidenceAccess,
  fieldEvidenceFile,
  revisionEditableHint,
} from '@/lib/field/evidence-review-ui'

describe('หน้าตรวจหลักฐานปิดงาน (UAT BUG-045)', () => {
  it('ปุ่มตีกลับแสดงเฉพาะสถานะปิดงาน', () => {
    const pending = { evidenceStatus: 'pending' }
    expect(canRejectFieldEvidence({ ...pending, assignmentStatus: 'closed_success' })).toBe(true)
    expect(canRejectFieldEvidence({ ...pending, assignmentStatus: 'closed_fail' })).toBe(true)
    expect(canRejectFieldEvidence({ ...pending, assignmentStatus: 'needs_revision' })).toBe(false)
    expect(canRejectFieldEvidence({ ...pending, assignmentStatus: 'scheduled' })).toBe(false)
    expect(canRejectFieldEvidence(null)).toBe(false)
  })

  it('หลักฐานที่ผ่านอัตโนมัติแล้วซ่อนปุ่มตีกลับ (มติ PO 03/10/2569 — UAT Q14)', () => {
    expect(canRejectFieldEvidence({ assignmentStatus: 'closed_success', evidenceStatus: 'approved' })).toBe(false)
    expect(canRejectFieldEvidence({ assignmentStatus: 'closed_fail', evidenceStatus: 'approved' })).toBe(false)
  })

  it('แปลง path หลักฐานเป็นไฟล์ที่เปิดดูได้ — ตัด uuid นำหน้า และชนิดหลักมาจากช่องที่เก็บ', () => {
    const path = 'cases/c1/field_evidence/video/0f8fad5b-d9cb-469f-a165-70867728950e-clip.MP4'
    expect(fieldEvidenceFile(path, 'video')).toEqual({ fileUrl: path, originalName: 'clip.MP4', mimeType: 'video/mp4' })
    expect(fieldEvidenceFile('cases/c1/field_evidence/photo/x.jpg', 'photo').mimeType).toBe('image/jpeg')
    expect(fieldEvidenceFile('cases/c1/field_evidence/product_photo/noext', 'product_photo')).toEqual({
      fileUrl: 'cases/c1/field_evidence/product_photo/noext',
      originalName: 'noext',
      mimeType: 'image/*',
    })
    expect(fieldEvidenceFile('a.m4a', 'audio').mimeType).toBe('audio/mp4')
  })

  it('ชื่อประเภทเช็คอินเป็นภาษาไทย (ชนิดที่ไม่รู้จักคืนค่าเดิม)', () => {
    expect(checkinTypeLabel('address')).toBe('ที่อยู่ลูกหนี้')
    expect(checkinTypeLabel('unknown')).toBe('unknown')
  })
})

describe('fieldEvidenceAccess (มติชั่วคราว M10 DO-03)', () => {
  const base = {
    id: 'u',
    organizationId: 'o',
    supabaseUid: 's',
    email: 'e@test.local',
    fullName: 'ผู้ใช้',
    status: 'active',
    roleId: 'r',
    roleName: 'ผู้จัดการทีมติดตามทรัพย์',
    roleGroup: 'inhouse',
    isSuperadmin: false,
    teamId: null,
    companyId: null,
    capabilities: {},
    loginAt: new Date().toISOString(),
  } as const

  it('ผู้ถือ reject_evidence = full · scope ทีม = team (อ่านอย่างเดียว) · พนักงาน/บริษัท = none', () => {
    expect(
      fieldEvidenceAccess({
        ...base,
        capabilities: { reject_evidence: 'view' },
        scope: { kind: 'global', teamIds: [], companyId: null, userId: 'u' },
      }),
    ).toBe('full')
    expect(fieldEvidenceAccess({ ...base, scope: { kind: 'team', teamIds: ['t1'], companyId: null, userId: 'u' } })).toBe('team')
    expect(fieldEvidenceAccess({ ...base, scope: { kind: 'team', teamIds: [], companyId: null, userId: 'u' } })).toBe('none')
    expect(fieldEvidenceAccess({ ...base, scope: { kind: 'self', teamIds: [], companyId: null, userId: 'u' } })).toBe('none')
    expect(
      fieldEvidenceAccess({ ...base, roleGroup: 'finance_company', scope: { kind: 'company', teamIds: [], companyId: 'c', userId: 'u' } }),
    ).toBe('none')
  })
})

describe('revisionEditableHint — mytester3 V3-02 (จุดเริ่มเดินทางปรับได้ในโหมดแก้ไขหลักฐาน)', () => {
  it('ทีมคิดค่าน้ำมันตามระยะทาง ⇒ รวมจุดเริ่มเดินทาง', () => {
    expect(revisionEditableHint(true)).toBe(
      'แก้ไขได้เฉพาะรูป/วิดีโอ/เสียง/รูปสินค้า และจุดเริ่มเดินทาง — เช็คอินและผลการติดตามล็อกไว้ตามรอบเดิม',
    )
  })
  it('ทีมเหมาจ่ายรายวัน (ไม่มีกล่องจุดเริ่มเดินทาง) ⇒ เฉพาะสื่อหลักฐาน', () => {
    expect(revisionEditableHint(false)).toBe('แก้ไขได้เฉพาะรูป/วิดีโอ/เสียง/รูปสินค้า — เช็คอินและผลการติดตามล็อกไว้ตามรอบเดิม')
  })
  it('ฝั่งผู้อนุมัติ (ไม่รู้โหมดค่าน้ำมัน) ⇒ บอกเงื่อนไข', () => {
    expect(revisionEditableHint(null)).toContain('และจุดเริ่มเดินทาง (ทีมที่คิดค่าน้ำมันตามระยะทาง)')
  })
})

describe('ป้ายรอบของกล่องหลักฐานปิดงาน (mytester7 S7-AG1-02)', () => {
  it('เคสรอบ 2 ที่หลักฐานยังเป็นของรอบ 1 = "รอบที่ 1 (รอบก่อน)"', () => {
    expect(evidenceRoundBadge(1, 2)).toEqual({ label: 'รอบที่ 1 (รอบก่อน)', previousRound: true })
  })
  it('หลักฐานของรอบปัจจุบัน (รอบ ≥ 2) = "รอบที่ n" · เคสรอบเดียว/ไม่รู้รอบ = ไม่มีป้าย', () => {
    expect(evidenceRoundBadge(2, 2)).toEqual({ label: 'รอบที่ 2', previousRound: false })
    expect(evidenceRoundBadge(1, 1)).toBeNull()
    expect(evidenceRoundBadge(undefined, 2)).toBeNull()
  })
})
