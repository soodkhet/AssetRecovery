import { afterEach, describe, expect, it, vi } from 'vitest'
import { isSessionLost, loginUrlFor, noticeSessionLost, SESSION_EXPIRED_EVENT } from '@/lib/api/session-expiry'
import { callApi, describeApiFailure, jsonRequest, labelFieldMessage, withContextSuffix, withFieldsSuffix } from '@/lib/api/types'

describe('withContextSuffix — ต่อท้ายรายชื่อจากข้อมูลประกอบของ error', () => {
  it('companies (TEMPLATE_IN_USE) ต่อท้ายเหมือนเดิม', () => {
    expect(withContextSuffix('ใช้อยู่', { companies: ['A', 'B'] })).toBe('ใช้อยู่ (A, B)')
  })

  it('payees (UNVERIFIED_PAYEE_IN_PAYOUT) บอกชื่อผู้รับที่ยังไม่ยืนยัน (BUG-110)', () => {
    expect(withContextSuffix('มีผู้รับที่ยังไม่ยืนยัน', { payees: ['นาย ก', 'นาง ข'] })).toBe(
      'มีผู้รับที่ยังไม่ยืนยัน (นาย ก, นาง ข)',
    )
  })

  it('รายการที่ไม่ใช่ string (object) หรือว่าง → ไม่ต่อท้าย', () => {
    expect(withContextSuffix('m', { payees: [{ payeeName: 'x' }] })).toBe('m')
    expect(withContextSuffix('m', { payees: [] })).toBe('m')
    expect(withContextSuffix('m', {})).toBe('m')
  })
})

describe('callApi — ข้อความเมื่อไม่มี envelope จาก server (preship PS-006/PS-007)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  const stubFetch = (impl: (input: string, init?: RequestInit) => Promise<Response>) =>
    vi.stubGlobal('fetch', vi.fn(impl))

  it('500 ที่ไม่ใช่ JSON ⇒ "ระบบขัดข้องชั่วคราว" ไม่ใช่ "เชื่อมต่อไม่สำเร็จ"', async () => {
    stubFetch(async () => new Response('<html>Internal Server Error</html>', { status: 500 }))
    const result = await callApi('/api/x')
    expect(result.error?.title).toBe('ระบบขัดข้องชั่วคราว')
    expect(result.error?.message).toContain('HTTP 500')
  })

  it('500 แบบ envelope ใช้ข้อความจาก server ตามเดิม', async () => {
    stubFetch(async () =>
      Response.json(
        { success: false, data: null, error: { code: 'INTERNAL_ERROR', title: 'ระบบขัดข้องชั่วคราว', message: 'จาก server' } },
        { status: 500 },
      ),
    )
    const result = await callApi('/api/x')
    expect(result.error).toMatchObject({ code: 'INTERNAL_ERROR', message: 'จาก server' })
  })

  it('เน็ตหลุด (fetch reject) ⇒ "เชื่อมต่อระบบไม่สำเร็จ" · คำขอที่บันทึกข้อมูลเตือนให้ตรวจรายการก่อนส่งซ้ำ', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch')
    })
    const get = await callApi('/api/x')
    expect(get.error?.title).toBe('เชื่อมต่อระบบไม่สำเร็จ')
    expect(get.error?.message).not.toContain('ตรวจในรายการ')
    const post = await callApi('/api/x', { method: 'POST' })
    expect(post.error?.message).toContain('ตรวจในรายการก่อนส่งซ้ำ')
  })

  it('server ไม่ตอบเกินเวลา ⇒ ยกเลิกคำขอ + "ระบบตอบช้าเกินไป"', async () => {
    vi.useFakeTimers()
    stubFetch(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }),
    )
    const pending = callApi('/api/x', { method: 'PATCH' }, { timeoutMs: 1_000 })
    await vi.advanceTimersByTimeAsync(1_000)
    const result = await pending
    expect(result.error?.title).toBe('ระบบตอบช้าเกินไป')
    expect(result.error?.message).toContain('ตรวจในรายการก่อนส่งซ้ำ')
  })

  it('ผู้เรียกยกเลิกเอง (signal) ยังยกเลิก fetch ได้ — ไม่นับเป็น timeout', async () => {
    stubFetch(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }),
    )
    const caller = new AbortController()
    const pending = callApi('/api/x', { signal: caller.signal })
    caller.abort()
    const result = await pending
    expect(result.error?.title).toBe('เชื่อมต่อระบบไม่สำเร็จ')
  })

  it('สำเร็จ ⇒ data ตามเดิม', async () => {
    stubFetch(async () => Response.json({ success: true, data: { id: 1 }, error: null }))
    expect(await callApi<{ id: number }>('/api/x')).toEqual({ data: { id: 1 } })
  })
})

describe('describeApiFailure', () => {
  it('502/504 ของคำขอเขียนข้อมูลเตือนให้ตรวจรายการก่อนส่งซ้ำ (staging S-024) · 500 ไม่เตือน', () => {
    expect(describeApiFailure('server', 'POST', 504).message).toContain('ตรวจในรายการก่อนส่งซ้ำ')
    expect(describeApiFailure('server', 'PATCH', 502).message).toContain('ตรวจในรายการก่อนส่งซ้ำ')
    expect(describeApiFailure('server', 'GET', 504).message).not.toContain('ตรวจในรายการ')
    expect(describeApiFailure('server', 'POST', 500).message).not.toContain('ตรวจในรายการ')
  })

  it('4xx ที่ไม่มี envelope บอกสถานะ', () => {
    expect(describeApiFailure('client', 'GET', 413).message).toContain('HTTP 413')
  })
  it('ข้อความไม่มีเลขอ้างอิงสเปค', () => {
    for (const kind of ['timeout', 'network', 'server', 'client', 'invalid_response'] as const) {
      expect(JSON.stringify(describeApiFailure(kind, 'POST'))).not.toMatch(/§|PS-\d/)
    }
  })
})

describe('withFieldsSuffix — ข้อความรายช่องต่อท้าย (preship R3-012)', () => {
  it('ไม่มี fields ⇒ ข้อความเดิม', () => {
    expect(withFieldsSuffix('แก้ไขข้อมูล', undefined)).toBe('แก้ไขข้อมูล')
    expect(withFieldsSuffix('แก้ไขข้อมูล', {})).toBe('แก้ไขข้อมูล')
  })

  it('ต่อข้อความรายช่อง ไม่ซ้ำ · เกิน 3 ข้อบอกจำนวนที่เหลือ', () => {
    expect(withFieldsSuffix('แก้ไขข้อมูล', { failReasonDetail: 'ยาวเกิน 1,000 ตัวอักษร' })).toBe(
      'แก้ไขข้อมูล — รายละเอียดเหตุผล: ยาวเกิน 1,000 ตัวอักษร',
    )
    expect(withFieldsSuffix('x', { a: '1', b: '1', c: '2', d: '3', e: '4' })).toBe('x — 1 · 2 · 3 และอีก 1 ข้อ')
  })

  it('ข้อความกลางที่ไม่บอกชื่อช่อง ⇒ เติมชื่อช่องที่รู้จัก · ข้อความที่ระบุชื่อช่องเองแล้ว/ช่องไม่รู้จักคงเดิม', () => {
    expect(labelFieldMessage('note', 'ยาวเกิน 500 ตัวอักษร')).toBe('หมายเหตุ: ยาวเกิน 500 ตัวอักษร')
    expect(labelFieldMessage('contacts.0.note', 'กรุณากรอกข้อมูลช่องนี้')).toBe('หมายเหตุ: กรุณากรอกข้อมูลช่องนี้')
    expect(labelFieldMessage('note', 'หมายเหตุยาวเกินไป')).toBe('หมายเหตุยาวเกินไป')
    expect(labelFieldMessage('unknownKey', 'ยาวเกิน 10 ตัวอักษร')).toBe('ยาวเกิน 10 ตัวอักษร')
    expect(withFieldsSuffix('x', { note: 'ยาวเกิน 500 ตัวอักษร', reason: 'ยาวเกิน 500 ตัวอักษร' })).toBe(
      'x — หมายเหตุ: ยาวเกิน 500 ตัวอักษร · เหตุผล: ยาวเกิน 500 ตัวอักษร',
    )
  })
})

describe('callApi — session หมดอายุ (preship R8-009)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const stub = (status: number, code: string) => {
    const dispatchEvent = vi.fn()
    vi.stubGlobal('window', { dispatchEvent })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ success: false, data: null, error: { code, title: 't', message: 'm' } }), { status })),
    )
    return dispatchEvent
  }

  it('401 UNAUTHENTICATED ⇒ ประกาศ event ให้ shell เปิดกล่องเข้าสู่ระบบ · ผู้เรียกยังได้ error เดิม', async () => {
    const dispatchEvent = stub(401, 'UNAUTHENTICATED')
    const result = await callApi('/api/x', jsonRequest('POST', {}))
    expect(result.error?.code).toBe('UNAUTHENTICATED')
    expect(dispatchEvent).toHaveBeenCalledTimes(1)
    expect((dispatchEvent.mock.calls[0]?.[0] as Event).type).toBe(SESSION_EXPIRED_EVENT)
  })

  it('401 SESSION_EXPIRED (session ครบ 24 ชม. — กรณีจริงที่พบบ่อยสุด) ⇒ ประกาศเช่นกัน (R9-003)', async () => {
    const dispatchEvent = stub(401, 'SESSION_EXPIRED')
    const result = await callApi('/api/x')
    expect(result.error?.code).toBe('SESSION_EXPIRED')
    expect(dispatchEvent).toHaveBeenCalledTimes(1)
  })

  it('403 / error อื่น ⇒ ไม่ประกาศ', async () => {
    const dispatchEvent = stub(403, 'PERMISSION_DENIED')
    await callApi('/api/x')
    expect(dispatchEvent).not.toHaveBeenCalled()
  })

  it('isSessionLost: เฉพาะ 401 ของ session — INVALID_CREDENTIALS / 403 ไม่นับ', () => {
    expect(isSessionLost(401, 'UNAUTHENTICATED')).toBe(true)
    expect(isSessionLost(401, 'SESSION_EXPIRED')).toBe(true)
    expect(isSessionLost(401, 'INVALID_CREDENTIALS')).toBe(false)
    expect(isSessionLost(403, 'SESSION_EXPIRED')).toBe(false)
  })

  it('noticeSessionLost (ดาวน์โหลดที่ไม่ผ่าน callApi): 401 ของ session ⇒ ประกาศ · อื่น ๆ ไม่ · ผู้เรียกยังอ่าน body ได้ (R9-014)', async () => {
    const dispatchEvent = vi.fn()
    vi.stubGlobal('window', { dispatchEvent })
    const envelope = (code: string) => JSON.stringify({ success: false, data: null, error: { code, title: 't', message: 'm' } })
    const expired = new Response(envelope('SESSION_EXPIRED'), { status: 401 })
    await noticeSessionLost(expired)
    expect(dispatchEvent).toHaveBeenCalledTimes(1)
    expect(await expired.json()).toMatchObject({ error: { code: 'SESSION_EXPIRED' } })
    await noticeSessionLost(new Response(envelope('PERMISSION_DENIED'), { status: 403 }))
    await noticeSessionLost(new Response('<html>401</html>', { status: 401 }))
    await noticeSessionLost(new Response(new Blob(['%PDF']), { status: 200 }))
    expect(dispatchEvent).toHaveBeenCalledTimes(1)
  })

  it('loginUrlFor เก็บ path + query ไว้ใน next', () => {
    expect(loginUrlFor('/finance', '?tab=revenue&bill_status=sent')).toBe('/login?next=%2Ffinance%3Ftab%3Drevenue%26bill_status%3Dsent')
    expect(loginUrlFor('/', '')).toBe('/login')
  })
})
