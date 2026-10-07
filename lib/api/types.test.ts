import { afterEach, describe, expect, it, vi } from 'vitest'
import { callApi, describeApiFailure, withContextSuffix, withFieldsSuffix } from '@/lib/api/types'

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
    expect(withFieldsSuffix('แก้ไขข้อมูล', { failReasonDetail: 'ยาวเกิน 1,000 ตัวอักษร' })).toBe('แก้ไขข้อมูล — ยาวเกิน 1,000 ตัวอักษร')
    expect(withFieldsSuffix('x', { a: '1', b: '1', c: '2', d: '3', e: '4' })).toBe('x — 1 · 2 · 3 และอีก 1 ข้อ')
  })
})
