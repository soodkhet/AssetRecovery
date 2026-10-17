import { describe, expect, it, vi } from 'vitest'

/** mytester6 T-015/T-019 — ทิ้งไฟล์ที่อัปโหลดแล้วไม่ได้ใช้: ส่งเฉพาะ path ที่หน้านี้อัปโหลดเอง (มีโทเคน) */

const uploadToSignedUrlMock = vi.hoisted(() => vi.fn(async () => ({ data: {}, error: null })))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ storage: { from: () => ({ uploadToSignedUrl: uploadToSignedUrlMock }) } }),
}))
vi.mock('@/lib/env-public', () => ({
  getPublicEnv: () => ({ NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon' }),
}))
const callApiMock = vi.hoisted(() =>
  vi.fn(async (input: string, init?: RequestInit) => {
    if (input === '/api/storage/upload-url') {
      const body = JSON.parse(String(init?.body)) as { fileName: string }
      return { data: { path: `cases/x/field_evidence/photo/${body.fileName}`, token: 'tok', discardToken: `dt-${body.fileName}` } }
    }
    return { data: { removed: 1 } }
  }),
)
vi.mock('@/lib/api/types', () => ({
  callApi: callApiMock,
  jsonRequest: (method: string, body: unknown) => ({ method, body: JSON.stringify(body) }),
}))

const { discardStagedUploads, isStagedUpload, uploadToStorage } = await import('@/lib/uploads/client')

function discardCalls(): Array<{ items: Array<{ path: string; discardToken: string }>; keepalive: unknown }> {
  return callApiMock.mock.calls
    .filter(([input]) => input === '/api/storage/discard')
    .map(([, init]) => ({ ...(JSON.parse(String(init?.body)) as { items: Array<{ path: string; discardToken: string }> }), keepalive: init?.keepalive }))
}

describe('discardStagedUploads', () => {
  it('ส่งเฉพาะไฟล์ที่หน้านี้อัปโหลด + โทเคนของไฟล์นั้น · ทิ้งแล้วไม่ส่งซ้ำ', async () => {
    const path = await uploadToStorage({ kind: 'field_evidence', caseId: 'x', mediaKind: 'photo' } as never, new File(['a'], 'a.jpg'))
    expect(isStagedUpload(path)).toBe(true)

    discardStagedUploads([path, 'cases/x/field_evidence/photo/old-from-server.jpg', path])
    expect(discardCalls()).toEqual([{ items: [{ path, discardToken: 'dt-a.jpg' }], keepalive: true }])
    expect(isStagedUpload(path)).toBe(false)

    discardStagedUploads([path])
    expect(discardCalls()).toHaveLength(1)
  })

  it('ไม่มีไฟล์ของหน้านี้เลย ⇒ ไม่ยิงคำขอ', () => {
    const before = discardCalls().length
    discardStagedUploads(['cases/x/field_evidence/photo/unknown.jpg'])
    expect(discardCalls()).toHaveLength(before)
  })
})
