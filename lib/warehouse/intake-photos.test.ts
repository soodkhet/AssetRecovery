import { describe, expect, it } from 'vitest'
import { INTAKE_PHOTO_ANGLES } from '@/lib/warehouse/intake'
import {
  angleOfIntakePhoto,
  flattenIntakePhotos,
  groupIntakePhotos,
  intakePhotoPath,
  intakePhotoWarning,
} from '@/lib/warehouse/intake-photos'

const ASSET_ID = '11111111-1111-4111-8111-111111111111'

describe('intakePhotoPath', () => {
  it('เข้ารหัสมุมไว้ใน path และล้างชื่อไฟล์ให้ปลอดภัย', () => {
    const path = intakePhotoPath(ASSET_ID, 'front', 'device front.JPG', 'key-1')
    expect(path).toBe(`assets/${ASSET_ID}/intake/front/key-1-device-front.jpg`)
  })

  it('path ที่สร้างอ่านมุมกลับได้ทุกมุม', () => {
    for (const angle of INTAKE_PHOTO_ANGLES) {
      expect(angleOfIntakePhoto(intakePhotoPath(ASSET_ID, angle, 'a.jpg', 'k'))).toBe(angle)
    }
  })
})

describe('angleOfIntakePhoto', () => {
  it('คืน null เมื่อไม่ใช่ path ของรูปรับเข้าคลัง', () => {
    expect(angleOfIntakePhoto('cases/abc/field_evidence/photo/k-a.jpg')).toBeNull()
  })

  it('คืน null เมื่อมุมไม่อยู่ในรายการ 7 มุม', () => {
    expect(angleOfIntakePhoto(`assets/${ASSET_ID}/intake/selfie/k-a.jpg`)).toBeNull()
  })
})

describe('groupIntakePhotos', () => {
  it('แยกรูปตามมุม + นับมุมที่ถ่ายแล้ว', () => {
    const groups = groupIntakePhotos([
      intakePhotoPath(ASSET_ID, 'front', 'a.jpg', 'k1'),
      intakePhotoPath(ASSET_ID, 'imei', 'b.jpg', 'k2'),
    ])
    expect(groups.byAngle.front).toContain('/front/')
    expect(groups.byAngle.imei).toContain('/imei/')
    expect(groups.byAngle.back).toBeNull()
    expect(groups.filledAngles).toBe(2)
    expect(groups.others).toEqual([])
  })

  it('มุมซ้ำ = เก็บรูปล่าสุดไว้ที่มุม รูปเดิมไปอยู่ others (ห้ามทิ้งรูป)', () => {
    const first = intakePhotoPath(ASSET_ID, 'front', 'a.jpg', 'k1')
    const second = intakePhotoPath(ASSET_ID, 'front', 'b.jpg', 'k2')
    const groups = groupIntakePhotos([first, second])
    expect(groups.byAngle.front).toBe(second)
    expect(groups.others).toEqual([first])
    expect(groups.filledAngles).toBe(1)
  })

  it('รูปเก่าที่ไม่มีมุมยังถูกเก็บไว้ใน others', () => {
    const groups = groupIntakePhotos(['legacy/photo-1.jpg'])
    expect(groups.others).toEqual(['legacy/photo-1.jpg'])
    expect(groups.filledAngles).toBe(0)
  })
})

describe('flattenIntakePhotos', () => {
  it('เรียงตามลำดับมุมมาตรฐานแล้วต่อท้ายด้วยรูปไม่มีมุม', () => {
    const imei = intakePhotoPath(ASSET_ID, 'imei', 'a.jpg', 'k1')
    const front = intakePhotoPath(ASSET_ID, 'front', 'b.jpg', 'k2')
    const flat = flattenIntakePhotos(groupIntakePhotos([imei, 'legacy.jpg', front]))
    expect(flat).toEqual([front, imei, 'legacy.jpg'])
  })
})

describe('intakePhotoWarning', () => {
  it('ครบ 7 มุม = ไม่มีคำเตือน', () => {
    expect(intakePhotoWarning(INTAKE_PHOTO_ANGLES.length)).toBeNull()
  })

  it('ไม่ครบ = เตือนจำนวนมุมที่ขาด แต่ยังรับเข้าคลังต่อได้', () => {
    const warning = intakePhotoWarning(5)
    expect(warning).toContain('2')
    expect(warning).toContain('รับเข้าคลังต่อได้')
  })
})
