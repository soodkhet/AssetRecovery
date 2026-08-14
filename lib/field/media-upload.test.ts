import { describe, expect, it } from 'vitest'
import {
  FIELD_MEDIA_ACCEPT,
  FIELD_MEDIA_CAPTURE,
  FIELD_MEDIA_KINDS,
  checkFieldMediaCandidate,
  fieldEvidencePath,
  isFieldMediaMime,
} from '@/lib/field/media-upload'

describe('ชนิดไฟล์ที่รับได้ต่อประเภทสื่อ (`41` §6.4)', () => {
  it('accept/capture ครบทุกประเภท', () => {
    for (const kind of FIELD_MEDIA_KINDS) {
      expect(FIELD_MEDIA_ACCEPT[kind]).not.toBe('')
      expect(Object.keys(FIELD_MEDIA_CAPTURE)).toContain(kind)
    }
    expect(FIELD_MEDIA_CAPTURE.audio).toBeNull()
  })

  it('เทียบ MIME ตามหมวด', () => {
    expect(isFieldMediaMime('photo', 'image/jpeg')).toBe(true)
    expect(isFieldMediaMime('photo', 'video/mp4')).toBe(false)
    expect(isFieldMediaMime('video', 'video/quicktime')).toBe(true)
    expect(isFieldMediaMime('audio', 'audio/mp4')).toBe(true)
    expect(isFieldMediaMime('product_photo', 'IMAGE/PNG')).toBe(true)
  })
})

describe('checkFieldMediaCandidate', () => {
  it('ไฟล์ถูกชนิดและขนาดพอดี = ผ่าน', () => {
    expect(checkFieldMediaCandidate('photo', { name: 'a.jpg', type: 'image/jpeg', size: 1024 })).toBeNull()
  })

  it('ผิดชนิด = บอกชื่อไฟล์และประเภทที่รับ', () => {
    const message = checkFieldMediaCandidate('video', { name: 'a.jpg', type: 'image/jpeg', size: 1024 })
    expect(message).toContain('a.jpg')
    expect(message).toContain('วิดีโอ')
  })

  it('ไม่มี MIME (ไฟล์จากกล้องบางเครื่อง) = ปล่อยผ่าน', () => {
    expect(checkFieldMediaCandidate('video', { name: 'clip', type: '', size: 2048 })).toBeNull()
  })

  it('ใหญ่เกินเพดานของประเภทนั้น = ไม่ผ่าน (วิดีโอเพดานสูงกว่ารูป)', () => {
    const big = 20 * 1024 * 1024
    expect(checkFieldMediaCandidate('photo', { name: 'a.jpg', type: 'image/jpeg', size: big })).toContain('ใหญ่เกิน')
    expect(checkFieldMediaCandidate('video', { name: 'a.mp4', type: 'video/mp4', size: big })).toBeNull()
  })

  it('ไฟล์ว่าง = ไม่ผ่าน', () => {
    expect(checkFieldMediaCandidate('photo', { name: 'a.jpg', type: 'image/jpeg', size: 0 })).toContain('ว่างเปล่า')
  })
})

describe('fieldEvidencePath', () => {
  it('แยกตามเคส + ชนิดสื่อ และล้างชื่อไฟล์ให้เป็น ASCII (นามสกุลยังอยู่)', () => {
    expect(fieldEvidencePath('case-1', 'photo', 'รูป หน้าบ้าน.JPG', 'key-1')).toBe(
      'cases/case-1/field_evidence/photo/key-1-file.jpg',
    )
    expect(fieldEvidencePath('case-1', 'photo', 'front view.PNG', 'key-1')).toBe(
      'cases/case-1/field_evidence/photo/key-1-front-view.png',
    )
  })

  it('คนละ prefix กับเอกสารเคส (bucket เดียวกันแต่ไม่ปนกัน)', () => {
    expect(fieldEvidencePath('case-1', 'video', 'clip.mp4', 'key-2')).toBe(
      'cases/case-1/field_evidence/video/key-2-clip.mp4',
    )
  })
})
