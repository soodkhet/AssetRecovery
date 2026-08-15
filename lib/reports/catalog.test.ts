import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  REPORT_CATEGORIES,
  REPORT_DEFINITIONS,
  findReport,
  reportsOfCategory,
} from '@/lib/reports/catalog'

/**
 * ทะเบียนรายงานต้องตรงกับ `docs/96` **ตัวต่อตัว** — เอกสารคือ SSOT
 * (แก้เอกสารแล้วลืมแก้โค้ด หรือแก้โค้ดแล้วลืมแก้เอกสาร = เทสต์แดงทันที)
 */

const spec = readFileSync(fileURLToPath(new URL('../../docs/96-reports.md', import.meta.url)), 'utf8')

function section(from: string, to: string): string {
  const start = spec.indexOf(from)
  const end = spec.indexOf(to, start + 1)
  expect(start, `หา "${from}" ใน 96 ไม่เจอ`).toBeGreaterThan(-1)
  expect(end, `หา "${to}" ใน 96 ไม่เจอ`).toBeGreaterThan(start)
  return spec.slice(start, end)
}

describe('ทะเบียนรายงาน ↔ `96`', () => {
  it('มีครบ 17 ตัว 4 หมวด · code ไม่ซ้ำ · id ไม่ซ้ำ', () => {
    expect(REPORT_DEFINITIONS).toHaveLength(17)
    expect(new Set(REPORT_DEFINITIONS.map((r) => r.code)).size).toBe(17)
    expect(new Set(REPORT_DEFINITIONS.map((r) => r.id)).size).toBe(17)
    expect(reportsOfCategory('F')).toHaveLength(5)
    expect(reportsOfCategory('O')).toHaveLength(5)
    expect(reportsOfCategory('A')).toHaveLength(4)
    expect(reportsOfCategory('E')).toHaveLength(3)
    for (const category of REPORT_CATEGORIES) expect(reportsOfCategory(category).length).toBeGreaterThan(0)
  })

  it('endpoint ของทุกตัวตรงกับรายการใน §9', () => {
    const paths = section('## 9. API Endpoints', '## 10. Permission Matrix')
    for (const report of REPORT_DEFINITIONS) {
      expect(paths.includes(report.path), `${report.code} ${report.path}`).toBe(true)
    }
    // ทุกบรรทัด `GET /api/reports/...` ในเอกสารต้องมีรายงานรองรับ (ไม่มี endpoint ตกหล่น)
    const documented = [...paths.matchAll(/GET (\/api\/reports\/\S+)/g)].map((match) => match[1])
    expect(documented).toHaveLength(17)
    for (const path of documented) {
      expect(REPORT_DEFINITIONS.some((report) => report.path === path), path).toBe(true)
    }
  })

  it('โหมดแคชตรงกับตาราง §8 (F1–F3+E = รายวัน · F4/F5+A = สด · O = รายชั่วโมง)', () => {
    const caching = section('## 8. Caching Strategy', '## 9. API Endpoints')
    expect(caching).toContain('F1, F2, F3, E1-E3')
    expect(caching).toContain('F4, F5')
    expect(caching).toContain('O1-O5')
    expect(caching).toContain('A1-A4')

    const byCode = Object.fromEntries(REPORT_DEFINITIONS.map((report) => [report.code, report.cacheMode]))
    for (const code of ['F1', 'F2', 'F3', 'E1', 'E2', 'E3']) expect(byCode[code], code).toBe('daily')
    for (const code of ['F4', 'F5', 'A1', 'A2', 'A3', 'A4']) expect(byCode[code], code).toBe('realtime')
    for (const code of ['O1', 'O2', 'O3', 'O4', 'O5']) expect(byCode[code], code).toBe('hourly')
  })

  it('รหัสรายงานทุกตัวมีหัวข้อของตัวเองใน §6', () => {
    const reports = section('## 6. รายงานทั้งหมด', '## 7. Data Sources')
    for (const report of REPORT_DEFINITIONS) {
      expect(reports.includes(`#### ${report.code} —`), report.code).toBe(true)
    }
  })

  it('หา definition จาก id ได้ · id แปลก ๆ คืน null (route ต้องตอบ 404 เอง)', () => {
    expect(findReport('gross-profit')?.code).toBe('F1')
    expect(findReport('kpi-summary')?.category).toBe('E')
    expect(findReport('ไม่มีจริง')).toBeNull()
    expect(findReport('')).toBeNull()
  })
})
