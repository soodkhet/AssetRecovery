import { describe, expect, it } from 'vitest'
import { isValidUploadDiscardToken, uploadDiscardToken } from '@/lib/uploads/discard-token'

/** mytester6 T-015/T-019 — ทิ้งไฟล์ที่อัปโหลดค้างได้เฉพาะผู้ใช้คนที่ขอ path นั้น */
describe('โทเคนทิ้งไฟล์ที่อัปโหลดค้าง', () => {
  const secret = 'server-secret'
  const path = 'cases/11111111-1111-4111-8111-111111111111/field_evidence/photo/abc-photo.jpg'

  it('ผู้ใช้คนเดิม + path เดิม ⇒ ผ่าน', () => {
    const token = uploadDiscardToken(secret, 'user-a', path)
    expect(isValidUploadDiscardToken(secret, 'user-a', path, token)).toBe(true)
  })

  it('ผู้ใช้อื่น / path อื่น / secret อื่น / โทเคนผิดรูป ⇒ ไม่ผ่าน', () => {
    const token = uploadDiscardToken(secret, 'user-a', path)
    expect(isValidUploadDiscardToken(secret, 'user-b', path, token)).toBe(false)
    expect(isValidUploadDiscardToken(secret, 'user-a', `${path}x`, token)).toBe(false)
    expect(isValidUploadDiscardToken('other-secret', 'user-a', path, token)).toBe(false)
    expect(isValidUploadDiscardToken(secret, 'user-a', path, '')).toBe(false)
    expect(isValidUploadDiscardToken(secret, 'user-a', path, `${token}=`)).toBe(false)
  })

  it('secret ว่าง ⇒ โยน (fail closed)', () => {
    expect(() => uploadDiscardToken('', 'user-a', path)).toThrow()
  })
})
