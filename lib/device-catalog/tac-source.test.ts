import { describe, expect, it } from 'vitest'
import { TAC_SOURCE_URL } from '@/lib/device-catalog/tac'
import {
  TAC_COMMITS_API_URL,
  TacSourceError,
  createGithubTacSourceClient,
  parseCommitsResponse,
} from '@/lib/device-catalog/tac-source'
import { tacSyncOptionsFromPayload } from '@/lib/device-catalog/tac-sync-job'

/** client ของแหล่งไฟล์ TAC (มติ PO U166 → U167) — fetch เป็น mock เสมอ **ห้ามเรียกเน็ตจริง** */

interface Call {
  url: string
  headers: Record<string, string>
}

function mockFetch(respond: (url: string, headers: Record<string, string>) => Response | Promise<Response>) {
  const calls: Call[] = []
  const fetchImpl = async (input: string, init?: RequestInit): Promise<Response> => {
    const headers = (init?.headers ?? {}) as Record<string, string>
    calls.push({ url: input, headers })
    return respond(input, headers)
  }
  return { calls, fetchImpl }
}

describe('commits API ของไฟล์', () => {
  it('อ่าน sha + วันที่ (committer ก่อน author)', () => {
    expect(
      parseCommitsResponse([{ sha: 'abc', commit: { committer: { date: '2026-09-01T10:00:00Z' }, author: { date: '2026-08-01T00:00:00Z' } } }]),
    ).toEqual({ sha: 'abc', committedAt: new Date('2026-09-01T10:00:00Z') })
    expect(parseCommitsResponse([{ sha: 'abc', commit: { author: { date: '2026-08-01T00:00:00Z' } } }])?.committedAt.toISOString()).toBe(
      '2026-08-01T00:00:00.000Z',
    )
  })

  it('รูปแบบผิด/ว่าง = null', () => {
    expect(parseCommitsResponse([])).toBeNull()
    expect(parseCommitsResponse({ message: 'API rate limit exceeded' })).toBeNull()
    expect(parseCommitsResponse([{ sha: 'abc', commit: { committer: { date: 'ไม่ใช่วันที่' } } }])).toBeNull()
  })

  it('เรียก URL ไฟล์ path เดียว per_page=1 · rate limit (403)/เน็ตล่ม = null ไม่โยน', async () => {
    const ok = mockFetch(() => Response.json([{ sha: 's1', commit: { committer: { date: '2026-09-01T00:00:00Z' } } }]))
    expect(await createGithubTacSourceClient(ok.fetchImpl).latestCommit()).toMatchObject({ sha: 's1' })
    expect(ok.calls[0]?.url).toBe(TAC_COMMITS_API_URL)
    expect(TAC_COMMITS_API_URL).toContain('path=tac_full.csv&per_page=1')

    const limited = mockFetch(() => new Response('{"message":"rate limit"}', { status: 403 }))
    expect(await createGithubTacSourceClient(limited.fetchImpl).latestCommit()).toBeNull()

    const down = mockFetch(() => {
      throw new Error('getaddrinfo ENOTFOUND')
    })
    expect(await createGithubTacSourceClient(down.fetchImpl).latestCommit()).toBeNull()
  })
})

describe('ดาวน์โหลดไฟล์', () => {
  it('ส่ง If-None-Match เมื่อมี ETag · 304 = not_modified', async () => {
    const mock = mockFetch((_url, headers) =>
      headers['If-None-Match'] === '"e1"' ? new Response(null, { status: 304 }) : new Response('x', { status: 200 }),
    )
    const client = createGithubTacSourceClient(mock.fetchImpl)
    expect(await client.download('"e1"')).toEqual({ status: 'not_modified' })
    expect(mock.calls[0]).toMatchObject({ url: TAC_SOURCE_URL, headers: { 'If-None-Match': '"e1"' } })
  })

  it('200 = เนื้อไฟล์ + ETag ใหม่ · ไม่มี ETag เดิม = ไม่ส่ง header', async () => {
    const mock = mockFetch(() => new Response('Brand,TAC,SPECS\n', { status: 200, headers: { etag: '"e2"' } }))
    const result = await createGithubTacSourceClient(mock.fetchImpl).download(null)
    expect(result).toEqual({ status: 'ok', text: 'Brand,TAC,SPECS\n', etag: '"e2"' })
    expect(mock.calls[0]?.headers).toEqual({})
  })

  it('5xx/เน็ตล่ม = TacSourceError (job บันทึกประวัติแล้ว retry)', async () => {
    const failing = mockFetch(() => new Response('oops', { status: 503 }))
    await expect(createGithubTacSourceClient(failing.fetchImpl).download(null)).rejects.toMatchObject({
      name: 'TacSourceError',
      status: 503,
    })
    const down = mockFetch(() => {
      throw new Error('socket hang up')
    })
    await expect(createGithubTacSourceClient(down.fetchImpl).download(null)).rejects.toBeInstanceOf(TacSourceError)
  })
})

describe('payload ของ job', () => {
  it('ค่าเริ่มต้น = รอบรายวัน · ผู้ดูแลกด = manual + force + ผู้สั่ง · มี filePath = นำเข้าไฟล์', () => {
    expect(tacSyncOptionsFromPayload({ source: 'cron' })).toEqual({ trigger: 'daily', force: false, filePath: null, actor: null })
    expect(tacSyncOptionsFromPayload({ trigger: 'manual', force: true, actorId: 'u1', actorRole: 'ธุรการ' })).toEqual({
      trigger: 'manual',
      force: true,
      filePath: null,
      actor: { id: 'u1', roleName: 'ธุรการ' },
    })
    expect(tacSyncOptionsFromPayload({ trigger: 'file', filePath: 'organization/x/device-tac/a.csv' })).toMatchObject({
      trigger: 'file',
      filePath: 'organization/x/device-tac/a.csv',
    })
    expect(tacSyncOptionsFromPayload({ trigger: 'file' })).toMatchObject({ trigger: 'daily', filePath: null })
    expect(tacSyncOptionsFromPayload(null)).toMatchObject({ trigger: 'daily' })
  })
})
