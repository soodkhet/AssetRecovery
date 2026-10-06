import { TAC_SOURCE_URL } from '@/lib/device-catalog/tac'

/**
 * HTTP client ของแหล่งไฟล์ TAC บน GitHub (มติ PO U166 → U167 → U168 · DEC-017)
 *
 * แยกเป็นโมดูลเดียวที่ **mock ได้** (`TacSourceClient`) — job รับ client ผ่านพารามิเตอร์ ⇒ เทสต์ใช้ fixture เท่านั้น
 * **ห้ามเรียกเน็ตจริงในเทสต์** · ไม่ใช้ token/คีย์ใด ๆ (GitHub REST แบบไม่ยืนยันตัวตน 60 ครั้ง/ชม. — job ใช้วันละ 1–2 ครั้ง)
 *
 * - `latestCommit()` — `GET /repos/MoazEb/tac-database/commits?path=tac_full.csv&per_page=1` → sha + วันที่แก้ล่าสุด
 *   ล้ม (rate limit/เน็ต/รูปแบบผิด) = `null` **ไม่โยน** (job ไป fallback ETag ต่อ)
 * - `download(etag)` — ไฟล์ดิบ · ส่ง If-None-Match เมื่อมี ETag · 304 = ไม่เปลี่ยน · ล้ม = โยน {@link TacSourceError}
 */

export const TAC_COMMITS_API_URL =
  'https://api.github.com/repos/MoazEb/tac-database/commits?path=tac_full.csv&per_page=1'

const REQUEST_TIMEOUT_MS = 120_000

export interface TacSourceCommit {
  sha: string
  committedAt: Date
}

export type TacDownloadResult =
  | { status: 'not_modified' }
  | { status: 'ok'; text: string; etag: string | null }

export interface TacSourceClient {
  latestCommit(): Promise<TacSourceCommit | null>
  download(etag: string | null): Promise<TacDownloadResult>
}

/** ดาวน์โหลดไม่สำเร็จ (5xx/เครือข่าย/หมดเวลา) — job บันทึกประวัติ "ล้มเหลว" แล้วโยนต่อให้ retry ตามระบบเดิม */
export class TacSourceError extends Error {
  readonly status: number | null
  constructor(message: string, status: number | null) {
    super(message)
    this.name = 'TacSourceError'
    this.status = status
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

/** อ่าน sha + วันที่จากผลของ commits API — รูปแบบผิด = `null` (pure · ทดสอบได้) */
export function parseCommitsResponse(body: unknown): TacSourceCommit | null {
  if (!Array.isArray(body) || body.length === 0) return null
  const first: unknown = body[0]
  if (first === null || typeof first !== 'object') return null
  const record = first as Record<string, unknown>
  const sha = record['sha']
  const commit = record['commit']
  if (typeof sha !== 'string' || sha === '' || commit === null || typeof commit !== 'object') return null
  const commitRecord = commit as Record<string, unknown>
  const pick = (key: string): string | null => {
    const person = commitRecord[key]
    if (person === null || typeof person !== 'object') return null
    const date = (person as Record<string, unknown>)['date']
    return typeof date === 'string' ? date : null
  }
  const dateText = pick('committer') ?? pick('author')
  if (dateText === null) return null
  const committedAt = new Date(dateText)
  return Number.isNaN(committedAt.getTime()) ? null : { sha, committedAt }
}

export function createGithubTacSourceClient(fetchImpl: FetchLike = fetch): TacSourceClient {
  return {
    async latestCommit() {
      try {
        const response = await fetchImpl(TAC_COMMITS_API_URL, {
          headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'asset-recovery-tac-sync' },
          signal: AbortSignal.timeout(30_000),
        })
        if (!response.ok) return null
        return parseCommitsResponse(await response.json())
      } catch {
        return null
      }
    },
    async download(etag) {
      let response: Response
      try {
        response = await fetchImpl(TAC_SOURCE_URL, {
          headers: etag === null ? {} : { 'If-None-Match': etag },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
      } catch (error) {
        throw new TacSourceError(`ดาวน์โหลดไฟล์ TAC ไม่สำเร็จ — ${error instanceof Error ? error.message : 'เชื่อมต่อไม่ได้'}`, null)
      }
      if (response.status === 304) return { status: 'not_modified' }
      if (!response.ok) throw new TacSourceError(`ดาวน์โหลดไฟล์ TAC ไม่สำเร็จ (HTTP ${response.status})`, response.status)
      return { status: 'ok', text: await response.text(), etag: response.headers.get('etag') }
    },
  }
}
