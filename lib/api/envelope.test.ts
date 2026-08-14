import { describe, expect, it } from 'vitest'
import { apiFailure, apiSuccess, readEnvelope } from '@/lib/api/envelope'

/** รูปแบบตาม `44` §15 — `{ success, data, error }` ครบทั้งสามช่องเสมอ ทั้งกรณีสำเร็จและผิดพลาด */

describe('apiSuccess()', () => {
  it('คืน envelope สำเร็จ status 200 และ error = null', async () => {
    const response = apiSuccess({ id: 'lot-1' })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, data: { id: 'lot-1' }, error: null })
  })

  it('รับ status 201 ตอนสร้าง + แนบ warning ได้ (`08` §14 · D1)', async () => {
    const warning = { code: 'INVITE_SEND_FAILED', title: 'ส่งคำเชิญไม่สำเร็จ', message: 'ลองส่งใหม่ภายหลัง' }
    const response = apiSuccess({ id: 'u1' }, { status: 201, warning })
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ success: true, data: { id: 'u1' }, error: null, warning })
  })
})

describe('apiFailure()', () => {
  it('คืน envelope ผิดพลาดพร้อม field เดียวตามสเปค `44` §15', async () => {
    const response = apiFailure(
      {
        code: 'MIXED_COMPANY_LOT',
        title: 'สร้าง Lot ไม่ได้',
        message: 'ไม่สามารถสร้าง Lot ที่มี Asset จากบริษัทไฟแนนซ์ต่างกันได้',
        field: 'assetIds',
      },
      400,
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      success: false,
      data: null,
      error: {
        code: 'MIXED_COMPANY_LOT',
        title: 'สร้าง Lot ไม่ได้',
        message: 'ไม่สามารถสร้าง Lot ที่มี Asset จากบริษัทไฟแนนซ์ต่างกันได้',
        field: 'assetIds',
      },
    })
  })
})

describe('readEnvelope()', () => {
  it('อ่าน envelope ใหม่ได้ตรง ๆ', () => {
    expect(readEnvelope({ success: true, data: 42, error: null }, true)).toEqual({
      success: true,
      data: 42,
      error: null,
    })
  })

  it('อ่าน response แบบ Phase 1 (`{ data }` ล้วน) ได้เหมือนกัน', () => {
    expect(readEnvelope({ data: ['a'] }, true)).toEqual({ success: true, data: ['a'], error: null })
  })

  it('อ่าน error แบบ Phase 1 (`{ error }` ล้วน) เป็น envelope ผิดพลาด', () => {
    const body = { error: { code: 'ROLE_NOT_FOUND', title: 'ไม่พบ role', message: 'ลองใหม่' } }
    expect(readEnvelope(body, false)).toEqual({ success: false, data: null, error: body.error })
  })

  it('body ที่อ่านไม่ออกแต่ HTTP ไม่ ok → error กลาง ไม่ใช่ success ปลอม', () => {
    const result = readEnvelope('<html>502</html>', false)
    expect(result.success).toBe(false)
  })
})
