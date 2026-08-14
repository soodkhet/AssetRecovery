import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { API_CONTRACT, apiPath, CONTRACT_BY_ID, type EndpointId } from '@/lib/api/contract'

/**
 * เทียบ contract กับ `docs/45` §6.1–6.5 แบบตัวต่อตัว — เทสต์นี้คือยามกัน "โค้ดหลุด spec"
 * (endpoint หายไป/พิมพ์ path ผิด/เพิ่ม endpoint ที่เอกสารไม่มี จะดังที่นี่ก่อนถึง review)
 */

const DOC = readFileSync(fileURLToPath(new URL('../../docs/45-case-warehouse-api-contracts.md', import.meta.url)), 'utf8')

function section(from: string, to: string): string {
  const start = DOC.indexOf(from)
  const end = DOC.indexOf(to)
  expect(start, `หา "${from}" ในไฟล์ 45 ไม่เจอ`).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return DOC.slice(start, end)
}

/** `/api/field/cases?status={status}` → `/api/field/cases` (contract เก็บ query แยกช่อง) */
function docEndpoints(): Set<string> {
  const body = section('## 6. API Endpoints', '## 7. Events')
  const found = new Set<string>()
  for (const line of body.split('\n')) {
    const match = /^(GET|POST|PATCH|DELETE)\s+(\S+)/.exec(line.trim())
    if (match === null) continue
    const [, method, rawPath] = match
    found.add(`${method} ${rawPath?.split('?')[0]}`)
  }
  return found
}

const contractEndpoints = new Set(
  (Object.keys(API_CONTRACT) as EndpointId[]).map((id) => `${CONTRACT_BY_ID[id].method} ${CONTRACT_BY_ID[id].path}`),
)

describe('API contract ↔ docs/45 §6', () => {
  it('ครอบคลุมทุก endpoint ที่ไฟล์ 45 ประกาศไว้ (47 ตัว)', () => {
    const fromDoc = docEndpoints()
    expect(fromDoc.size).toBe(47)
    expect([...fromDoc].filter((entry) => !contractEndpoints.has(entry))).toEqual([])
  })

  it('ไม่มี endpoint ที่โผล่ในโค้ดแต่ไม่มีในเอกสาร', () => {
    const fromDoc = docEndpoints()
    expect([...contractEndpoints].filter((entry) => !fromDoc.has(entry))).toEqual([])
  })

  it('method + path ไม่ซ้ำกันเอง', () => {
    expect(contractEndpoints.size).toBe(Object.keys(API_CONTRACT).length)
  })

  it('ทุก path ขึ้นต้น /api และไม่มี trailing slash (`45` §8)', () => {
    for (const id of Object.keys(API_CONTRACT) as EndpointId[]) {
      const { path } = CONTRACT_BY_ID[id]
      expect(path.startsWith('/api/'), `${id}: ${path}`).toBe(true)
      expect(path.endsWith('/'), `${id}: ${path}`).toBe(false)
    }
  })

  it('endpoint ของ Field Tracker อยู่ใน namespace /api/field/* เท่านั้น (`45` §8)', () => {
    for (const id of Object.keys(API_CONTRACT) as EndpointId[]) {
      const { module, path } = CONTRACT_BY_ID[id]
      if (module !== 'field') continue
      expect(path.startsWith('/api/field/'), `${id}: ${path}`).toBe(true)
    }
  })
})

describe('apiPath()', () => {
  it('แทนค่า path param และ encode ให้', () => {
    expect(apiPath('case.detail', { id: 'abc/def' })).toBe('/api/cases/abc%2Fdef')
    expect(apiPath('assignment.agentCases', { team_id: 't1', agent_id: 'a1' })).toBe('/api/teams/t1/agents/a1/cases')
  })

  it('endpoint ที่ไม่มี param เรียกได้โดยไม่ต้องส่ง params', () => {
    expect(apiPath('case.list')).toBe('/api/cases')
    expect(apiPath('field.reorderCases')).toBe('/api/field/cases/reorder')
  })

  it('ต่อ query string ตามลำดับที่ส่ง และข้ามค่า undefined', () => {
    expect(apiPath('case.list', undefined, { status: 'draft', province: undefined, page: 2 })).toBe(
      '/api/cases?status=draft&page=2',
    )
  })

  it('array กลายเป็น key ซ้ำ (filter หลายค่าแบบ `44` §15)', () => {
    expect(apiPath('asset.list', undefined, { status: ['in_custody', 'handed_over'] })).toBe(
      '/api/assets?status=in_custody&status=handed_over',
    )
  })

  it('ปฏิเสธ query key ที่สเปคไม่ได้ประกาศไว้', () => {
    expect(() => apiPath('asset.list', undefined, { imei: '355000000000001' })).toThrow(/ไม่รับ query "imei"/)
  })

  it('ปฏิเสธ path param ที่ว่าง', () => {
    expect(() => apiPath('case.detail', { id: '' })).toThrow(/ขาด path param "id"/)
  })
})
