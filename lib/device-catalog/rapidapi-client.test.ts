import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MOBILE_SPECS_HOST,
  DeviceSpecsApiError,
  DeviceSpecsQuotaError,
  createRapidApiDeviceSpecsClient,
  parseBrandList,
  parseModelList,
  rapidApiConfigFromEnv,
  type FetchLike,
  type FetchResponseLike,
} from '@/lib/device-catalog/rapidapi-client'

/**
 * client RapidAPI (DEC-016) — **fixture/mock เท่านั้น ห้ามเรียก API จริง** (มติ PO U155)
 * fetch ถูกแทนด้วยฟังก์ชันที่ตอบจาก fixture ตาม path
 */

const FAKE_KEY = 'test-key-not-real'

function response(status: number, body: unknown, remaining?: number): FetchResponseLike {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'x-ratelimit-requests-remaining' && remaining !== undefined ? String(remaining) : null,
    },
    json: async () => body,
  }
}

function fakeFetch(routes: Record<string, () => FetchResponseLike>): { fetch: FetchLike; calls: Array<{ url: string; headers: Record<string, string> }> } {
  const calls: Array<{ url: string; headers: Record<string, string> }> = []
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, headers: init.headers })
    const path = url.replace(`https://${DEFAULT_MOBILE_SPECS_HOST}`, '')
    const route = routes[path]
    return route === undefined ? response(404, { message: 'not found' }) : route()
  }
  return { fetch, calls }
}

describe('อ่าน env', () => {
  it('ไม่มี key = null (job ข้าม) · มี key = host เริ่มต้น', () => {
    expect(rapidApiConfigFromEnv({})).toBeNull()
    expect(rapidApiConfigFromEnv({ RAPIDAPI_KEY: '  ' })).toBeNull()
    expect(rapidApiConfigFromEnv({ RAPIDAPI_KEY: FAKE_KEY })).toEqual({ apiKey: FAKE_KEY, host: DEFAULT_MOBILE_SPECS_HOST })
    expect(rapidApiConfigFromEnv({ RAPIDAPI_KEY: FAKE_KEY, RAPIDAPI_MOBILE_SPECS_HOST: 'other.example' })?.host).toBe('other.example')
  })
})

describe('parser รับได้หลายรูปแบบ', () => {
  it('แบรนด์: array ของข้อความ/อ็อบเจกต์ และ { data: [] }', () => {
    expect(parseBrandList(['Samsung', ' Apple ', ''])).toEqual(['Samsung', 'Apple'])
    expect(parseBrandList({ data: [{ brandValue: 'OPPO' }, { brandName: 'vivo' }, { x: 1 }] })).toEqual(['OPPO', 'vivo'])
    expect(parseBrandList(null)).toEqual([])
  })

  it('รุ่น: ชื่อ + รหัส + ปี (ถ้ามี)', () => {
    expect(
      parseModelList([
        { modelValue: 'Galaxy A55', phoneCustomId: 'samsung-a55', launchAnnounced: '2024, March 11' },
        { phoneModel: 'Galaxy S24' },
        'Galaxy Z Fold6',
        { nothing: true },
      ]),
    ).toEqual([
      { externalId: 'samsung-a55', name: 'Galaxy A55', releaseYear: 2024 },
      { externalId: null, name: 'Galaxy S24', releaseYear: null },
      { externalId: null, name: 'Galaxy Z Fold6', releaseYear: null },
    ])
  })
})

describe('client (mock fetch)', () => {
  it('ส่ง header ของ RapidAPI + จำโควตาที่เหลือ + ลอง path แบบ provider ก่อน', async () => {
    const { fetch, calls } = fakeFetch({ '/brands': () => response(200, ['Samsung'], 42) })
    const client = createRapidApiDeviceSpecsClient({ apiKey: FAKE_KEY, host: DEFAULT_MOBILE_SPECS_HOST }, fetch)
    expect(await client.listBrands()).toEqual(['Samsung'])
    expect(calls[0]?.headers).toEqual({ 'x-rapidapi-key': FAKE_KEY, 'x-rapidapi-host': DEFAULT_MOBILE_SPECS_HOST })
    expect(client.quotaRemaining()).toBe(42)
    expect(client.requestCount()).toBe(1)
  })

  it('path แบบ provider ได้ 404 → ลองแบบ /gsm แล้วจำไว้ใช้ต่อ', async () => {
    const { fetch, calls } = fakeFetch({
      '/gsm/all-brands': () => response(200, ['Apple']),
      '/gsm/get-models-by-brandname/Apple': () => response(200, ['iPhone 16']),
    })
    const client = createRapidApiDeviceSpecsClient({ apiKey: FAKE_KEY, host: DEFAULT_MOBILE_SPECS_HOST }, fetch)
    expect(await client.listBrands()).toEqual(['Apple'])
    expect(await client.listModels('Apple')).toEqual([{ externalId: null, name: 'iPhone 16', releaseYear: null }])
    expect(calls.map((call) => call.url.replace(`https://${DEFAULT_MOBILE_SPECS_HOST}`, ''))).toEqual([
      '/brands',
      '/gsm/all-brands',
      '/gsm/get-models-by-brandname/Apple',
    ])
  })

  it('429 = DeviceSpecsQuotaError · 5xx = DeviceSpecsApiError', async () => {
    const quota = fakeFetch({ '/brands': () => response(429, {}) })
    await expect(
      createRapidApiDeviceSpecsClient({ apiKey: FAKE_KEY, host: DEFAULT_MOBILE_SPECS_HOST }, quota.fetch).listBrands(),
    ).rejects.toBeInstanceOf(DeviceSpecsQuotaError)

    const down = fakeFetch({ '/brands': () => response(503, {}) })
    const error = await createRapidApiDeviceSpecsClient({ apiKey: FAKE_KEY, host: DEFAULT_MOBILE_SPECS_HOST }, down.fetch)
      .listBrands()
      .catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(DeviceSpecsApiError)
    expect((error as DeviceSpecsApiError).status).toBe(503)
  })
})
