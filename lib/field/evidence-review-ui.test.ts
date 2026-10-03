import { describe, expect, it } from 'vitest'
import { canRejectFieldEvidence, checkinTypeLabel, fieldEvidenceFile } from '@/lib/field/evidence-review-ui'

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
