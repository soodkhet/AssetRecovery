import { afterEach, describe, expect, it, vi } from 'vitest'
import { FetchTimeoutError, fetchWithTimeout } from '@/lib/api/fetch-with-timeout'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

/** fetch ปลอมที่ค้างจนถูก abort */
function hangingFetch() {
  return vi.fn(
    (_input: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      }),
  )
}

describe('fetchWithTimeout (R2-017)', () => {
  it('ตอบทันเวลา ⇒ คืน Response ตามปกติ', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('ok', { status: 200 })))
    const response = await fetchWithTimeout('/api/x')
    expect(await response.text()).toBe('ok')
  })

  it('server ค้างเกินเวลา ⇒ FetchTimeoutError (ไม่หมุนไม่จบ)', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', hangingFetch())
    const pending = fetchWithTimeout('/api/x', undefined, 1000)
    const assertion = expect(pending).rejects.toBeInstanceOf(FetchTimeoutError)
    await vi.advanceTimersByTimeAsync(1000)
    await assertion
  })

  it('ผู้เรียกยกเลิกเอง ⇒ error เดิม ไม่ใช่ timeout', async () => {
    vi.stubGlobal('fetch', hangingFetch())
    const controller = new AbortController()
    const pending = fetchWithTimeout('/api/x', { signal: controller.signal }, 60_000)
    controller.abort()
    await expect(pending).rejects.not.toBeInstanceOf(FetchTimeoutError)
  })
})
