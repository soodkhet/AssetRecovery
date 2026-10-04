import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))

const { portalAssetPhotoSection, portalAssetPhotoViewable, portalPhotoContentType } = await import(
  '@/lib/portal/queries/assets'
)

/** ส่วน pure ของรูปทรัพย์พอร์ทัล (Portal-P4 · `97` §6.1/§17 · D6) — ส่วนที่แตะ DB อยู่ `portal-api-cases.db.test.ts` */
describe('portal asset photos — pure', () => {
  it('เลือกหมวดส่งมอบก่อน (ตาราง §17) ไม่มีจึงใช้หมวดเคส', () => {
    expect(portalAssetPhotoSection({ portal_handover: 'view', portal_download: 'view' })).toBe('handover')
    expect(portalAssetPhotoSection({ portal_cases: 'view', portal_download: 'view' })).toBe('cases')
    // มีหมวดส่งมอบแต่ไม่มีดาวน์โหลด ⇒ ไม่ผ่านทางส่งมอบ (ยามหมวดเคสจะปฏิเสธต่อเอง)
    expect(portalAssetPhotoSection({ portal_handover: 'view', portal_cases: 'view' })).toBe('cases')
  })

  it('เคสติดตามสำเร็จเปิดได้ทุกหมวด · ทรัพย์ในล็อตเปิดได้เฉพาะหมวดส่งมอบ', () => {
    expect(portalAssetPhotoViewable({ caseRecovered: true, inLot: false }, 'cases')).toBe(true)
    expect(portalAssetPhotoViewable({ caseRecovered: false, inLot: true }, 'handover')).toBe(true)
    expect(portalAssetPhotoViewable({ caseRecovered: false, inLot: true }, 'cases')).toBe(false)
    expect(portalAssetPhotoViewable({ caseRecovered: false, inLot: false }, 'handover')).toBe(false)
  })

  it('ชนิดไฟล์: ค่าที่ server ตรวจไว้ (image/* เท่านั้น) → นามสกุล → octet-stream', () => {
    expect(portalPhotoContentType('a/b.jpg', { 'a/b.jpg': 'image/webp' })).toBe('image/webp')
    expect(portalPhotoContentType('a/b.jpg', { 'a/b.jpg': 'text/html' })).toBe('image/jpeg')
    expect(portalPhotoContentType('a/b.PNG', {})).toBe('image/png')
    expect(portalPhotoContentType('a/b.svg', {})).toBe('application/octet-stream')
  })
})
