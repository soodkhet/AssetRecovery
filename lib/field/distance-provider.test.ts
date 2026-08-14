import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearDistanceCache,
  DistanceUnavailableError,
  googleDistanceProvider,
  resolveRouteMeters,
} from '@/lib/field/distance-provider'

const origin = { latitude: 13.7563, longitude: 100.5018 }
const stop1 = { latitude: 13.8, longitude: 100.6 }
const stop2 = { latitude: 13.9, longitude: 100.7 }

function okResponse(meters: number): Response {
  return new Response(JSON.stringify({ status: 'OK', rows: [{ elements: [{ status: 'OK', distance: { value: meters } }] }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  clearDistanceCache()
})

describe('googleDistanceProvider (`41` §6.4.2)', () => {
  it('ยิงทีละช่วงและรวมระยะทางตามลำดับจุด', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => okResponse(1_500))
    const provider = googleDistanceProvider('test-key', { fetchImpl, backoffMs: 0 })

    await expect(resolveRouteMeters([origin, stop1, stop2], provider)).resolves.toBe(3_000)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('cache ช่วงเดิม — เรียกซ้ำไม่ยิง API ใหม่', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => okResponse(800))
    const provider = googleDistanceProvider('test-key', { fetchImpl, backoffMs: 0 })

    await resolveRouteMeters([origin, stop1], provider)
    await resolveRouteMeters([origin, stop1], provider)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('จุดเดียว (ไม่มีเช็คอิน) = 0 เมตร ไม่เรียก API เลย', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => okResponse(999))
    const provider = googleDistanceProvider('test-key', { fetchImpl, backoffMs: 0 })

    await expect(resolveRouteMeters([origin], provider)).resolves.toBe(0)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('ปลายทางล่มชั่วคราว (5xx) = retry แล้วสำเร็จ', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('boom', { status: 503 }))
      .mockResolvedValueOnce(okResponse(2_000))
    const provider = googleDistanceProvider('test-key', { fetchImpl, backoffMs: 0 })

    await expect(resolveRouteMeters([origin, stop1], provider)).resolves.toBe(2_000)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('key ผิด (4xx) = ไม่ retry แล้วโยนทันที', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('denied', { status: 403 }))
    const provider = googleDistanceProvider('bad-key', { fetchImpl, backoffMs: 0 })

    await expect(resolveRouteMeters([origin, stop1], provider)).rejects.toBeInstanceOf(DistanceUnavailableError)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('quota หมด = retry ครบจำนวนครั้งแล้วโยน (ให้ job มาทำต่อตาม D10)', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ status: 'OVER_QUERY_LIMIT' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    )
    const provider = googleDistanceProvider('test-key', { fetchImpl, attempts: 3, backoffMs: 0 })

    await expect(resolveRouteMeters([origin, stop1], provider)).rejects.toThrow(DistanceUnavailableError)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('ZERO_RESULTS = 0 เมตรของช่วงนั้น (retry อีกกี่รอบก็ได้ผลเดิม)', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ status: 'OK', rows: [{ elements: [{ status: 'ZERO_RESULTS' }] }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    )
    const provider = googleDistanceProvider('test-key', { fetchImpl, backoffMs: 0 })

    await expect(resolveRouteMeters([origin, stop1], provider)).resolves.toBe(0)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

describe('ยังไม่ตั้ง GOOGLE_MAPS_API_KEY (D10)', () => {
  it('provider = null ⇒ โยน DistanceUnavailableError ไม่ใช่คิดเป็น 0', async () => {
    await expect(resolveRouteMeters([origin, stop1], null)).rejects.toBeInstanceOf(DistanceUnavailableError)
  })

  it('ไม่มีช่วงให้คำนวณ ⇒ 0 เมตร แม้ไม่มี provider', async () => {
    await expect(resolveRouteMeters([origin], null)).resolves.toBe(0)
  })
})
