import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PORTAL_SECTION_CAPABILITY, PORTAL_DOWNLOAD_CAPABILITY } from '@/lib/portal/access'
import { PORTAL_ENDPOINTS, portalEndpointOf } from '@/lib/portal/contract'

interface SpecRow {
  method: string
  path: string
  capabilities: string[]
}

/** ดึงตาราง endpoint ของ `97` §17 จาก markdown จริง */
function specRows(): SpecRow[] {
  const markdown = readFileSync(join(process.cwd(), 'docs/97-client-portal.md'), 'utf8')
  const start = markdown.indexOf('## 17.')
  const end = markdown.indexOf('## 18.', start)
  return markdown
    .slice(start, end)
    .split('\n')
    .filter((line) => /^\|\s*GET\s*\|/.test(line) || /^\|\s*(POST|PATCH|PUT|DELETE)\s*\|/.test(line))
    .map((line) => {
      const cells = line.split('|').map((cell) => cell.trim())
      return {
        method: cells[1] ?? '',
        path: cells[2] ?? '',
        capabilities: [...(cells[3] ?? '').matchAll(/`([a-z_]+)`/g)].map((match) => match[1] ?? ''),
      }
    })
}

describe('portal contract ↔ 97 §17', () => {
  const rows = specRows()

  it('16 endpoint ตรงกับ spec ทั้งลำดับ path และ capability (U95 +1 ใบแจ้งหนี้)', () => {
    expect(rows).toHaveLength(16)
    expect(PORTAL_ENDPOINTS).toHaveLength(16)
    expect(PORTAL_ENDPOINTS.map((endpoint) => ({ method: endpoint.method, path: endpoint.path, capabilities: [...endpoint.capabilities] }))).toEqual(rows)
  })

  it('GET เท่านั้น · namespace /api/portal/ · path ไม่ซ้ำ', () => {
    expect(rows.every((row) => row.method === 'GET')).toBe(true)
    expect(PORTAL_ENDPOINTS.every((endpoint) => endpoint.method === 'GET' && endpoint.path.startsWith('/api/portal/'))).toBe(true)
    expect(new Set(PORTAL_ENDPOINTS.map((endpoint) => endpoint.path)).size).toBe(16)
  })

  it('section/download สอดคล้องกับ capability', () => {
    for (const endpoint of PORTAL_ENDPOINTS) {
      expect(endpoint.capabilities[0]).toBe(PORTAL_SECTION_CAPABILITY[endpoint.section])
      expect(endpoint.capabilities.includes(PORTAL_DOWNLOAD_CAPABILITY)).toBe(endpoint.download)
      expect(endpoint.dto.startsWith('file:')).toBe(endpoint.download)
    }
  })

  it('portalEndpointOf', () => {
    expect(portalEndpointOf('/api/portal/cases/:id')?.dto).toBe('PortalCaseDetailDto')
    expect(portalEndpointOf('/api/portal/cases/new')).toBeUndefined()
  })
})
