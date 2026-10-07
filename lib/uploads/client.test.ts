import { afterEach, describe, expect, it, vi } from 'vitest'

/** อัปโหลดค้างต้องจบด้วย error ที่ผู้ใช้อ่านได้ ไม่ล็อก modal ตลอดไป (preship R2-024) และ abort request จริง (R3-026) */

const uploadToSignedUrlMock = vi.hoisted(() => vi.fn())
const clientOptions = vi.hoisted(() => ({ fetch: null as null | ((input: string, init?: RequestInit) => Promise<Response>) }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: (_url: string, _key: string, options: { global: { fetch: (input: string, init?: RequestInit) => Promise<Response> } }) => {
    clientOptions.fetch = options.global.fetch
    return { storage: { from: () => ({ uploadToSignedUrl: uploadToSignedUrlMock }) } }
  },
}))
vi.mock('@/lib/env-public', () => ({
  getPublicEnv: () => ({ NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon' }),
}))
vi.mock('@/lib/api/types', () => ({
  callApi: async () => ({ data: { path: 'org/x/receipt.jpg', token: 'tok-1' } }),
  jsonRequest: (method: string, body: unknown) => ({ method, body: JSON.stringify(body) }),
}))

const { StorageUploadError, uploadTimeoutMs, uploadToStorage } = await import('@/lib/uploads/client')

/** จำลองอัปโหลดผ่าน fetch ของ client (เหมือน storage-js) — ค้างจนกว่า signal จะถูก abort */
function hangingUploadViaClientFetch(seenSignals: AbortSignal[]) {
  const fetchMock = vi.fn((_input: string, init?: RequestInit) => {
    const signal = init?.signal ?? undefined
    if (signal !== undefined) seenSignals.push(signal)
    return new Promise<Response>((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  uploadToSignedUrlMock.mockImplementation(async (path: string, token: string) => {
    const doFetch = clientOptions.fetch
    if (doFetch === null) throw new Error('client not created')
    try {
      await doFetch(`https://example.supabase.co/storage/v1/object/upload/sign/case-documents/${path}?token=${token}`, {
        method: 'PUT',
      })
      return { data: {}, error: null }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  })
  return fetchMock
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  uploadToSignedUrlMock.mockReset()
})

describe('uploadToStorage — timeout (R2-024)', () => {
  it('อัปโหลดสำเร็จ ⇒ คืน path จาก server', async () => {
    uploadToSignedUrlMock.mockResolvedValue({ data: {}, error: null })
    const file = new File(['x'], 'receipt.jpg', { type: 'image/jpeg' })
    await expect(uploadToStorage({ kind: 'expense_receipt' } as never, file)).resolves.toBe('org/x/receipt.jpg')
  })

  it('ค้างเกินเวลา ⇒ StorageUploadError ข้อความไทย', async () => {
    vi.useFakeTimers()
    uploadToSignedUrlMock.mockReturnValue(new Promise(() => undefined))
    const file = new File(['x'], 'receipt.jpg', { type: 'image/jpeg' })
    const pending = uploadToStorage({ kind: 'expense_receipt' } as never, file)
    const assertion = expect(pending).rejects.toBeInstanceOf(StorageUploadError)
    await vi.advanceTimersByTimeAsync(uploadTimeoutMs(file.size))
    await assertion
    await expect(pending).rejects.toThrow(/ใช้เวลานานเกินไป/)
  })

  it('เวลารอเพิ่มตามขนาดไฟล์ (วิดีโอใหญ่บนเน็ตช้าไม่ถูกตัดก่อนเวลา)', () => {
    expect(uploadTimeoutMs(0)).toBe(120_000)
    expect(uploadTimeoutMs(50 * 1024 * 1024)).toBeGreaterThan(600_000)
  })
})

describe('uploadToStorage — abort จริง (R3-026)', () => {
  it('หมดเวลา ⇒ request ที่ค้างถูก abort (ไม่วิ่งต่อเบื้องหลัง)', async () => {
    vi.useFakeTimers()
    const signals: AbortSignal[] = []
    hangingUploadViaClientFetch(signals)
    const file = new File(['x'], 'receipt.jpg', { type: 'image/jpeg' })
    const pending = uploadToStorage({ kind: 'expense_receipt' } as never, file)
    const assertion = expect(pending).rejects.toThrow(/ใช้เวลานานเกินไป/)
    await vi.advanceTimersByTimeAsync(uploadTimeoutMs(file.size))
    await assertion
    expect(signals).toHaveLength(1)
    expect(signals[0]?.aborted).toBe(true)
  })

  it('ผู้เรียกกดยกเลิก ⇒ abort request + ข้อความยกเลิก', async () => {
    const signals: AbortSignal[] = []
    hangingUploadViaClientFetch(signals)
    const controller = new AbortController()
    const file = new File(['x'], 'receipt.jpg', { type: 'image/jpeg' })
    const pending = uploadToStorage({ kind: 'expense_receipt' } as never, file, { signal: controller.signal })
    await vi.waitFor(() => expect(signals).toHaveLength(1))
    controller.abort()
    await expect(pending).rejects.toThrow(/ยกเลิกการอัปโหลด/)
    expect(signals[0]?.aborted).toBe(true)
  })

  it('signal ถูก abort ก่อนเริ่ม ⇒ ไม่ขอโทเคน/ไม่อัปโหลด', async () => {
    const controller = new AbortController()
    controller.abort()
    const file = new File(['x'], 'receipt.jpg', { type: 'image/jpeg' })
    await expect(uploadToStorage({ kind: 'expense_receipt' } as never, file, { signal: controller.signal })).rejects.toBeInstanceOf(
      StorageUploadError,
    )
    expect(uploadToSignedUrlMock).not.toHaveBeenCalled()
  })
})
