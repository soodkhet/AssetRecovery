import { join } from 'node:path'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { THAI_FONT_FILES } from '@/components/pdf/thai-font'
import { REPORT_PDF_GLYPH_REPLACEMENTS, reportPdfSafePayload, reportPdfText } from '@/lib/reports/pdf-text'
import type { ReportPayload } from '@/lib/reports/payload'

/** mytester J-04 — PDF รายงานต้องไม่มีอักษรที่ฟอนต์ไทยไม่มี glyph (เดิม ⇒ เป็นกล่อง · → เป็นอักษรเพี้ยน) */

interface FontLike {
  hasGlyphForCodePoint(codePoint: number): boolean
}

function openThaiFont(): FontLike {
  const localRequire = createRequire(import.meta.url)
  const fontkitPath = localRequire.resolve('fontkit', { paths: [localRequire.resolve('@react-pdf/renderer')] })
  const fontkit = localRequire(fontkitPath) as { openSync(path: string): FontLike }
  return fontkit.openSync(join(process.cwd(), THAI_FONT_FILES.regular))
}

function missingGlyphs(font: FontLike, text: string): string[] {
  return [...new Set([...text])].filter(
    (char) => !/\s/.test(char) && !font.hasGlyphForCodePoint(char.codePointAt(0) ?? 0),
  )
}

const PAYLOAD: ReportPayload = {
  report: { code: 'E1', id: 'kpi-summary', title: 'KPI ภาพรวม', category: 'E' },
  range: { preset: 'this_year', label: 'ปี 2569', from: '2026-01-01', to: '2026-12-31' },
  columns: [
    { key: 'month', header: 'เดือน → ปี', type: 'text' },
    { key: 'revenue', header: 'รายได้', type: 'money' },
  ],
  rows: [{ month: 'ม.ค. ⇒ มี.ค.', revenue: 100 }],
  kpis: [{ key: 'ar', label: 'AR ≥ 90 วัน', value: 'N/A', type: 'text', hint: '↑ จากเดือนก่อน' }],
  totalRow: { month: 'รวม ↔', revenue: 100 },
  note: 'AR ค้างรับเป็นยอด ณ วันที่คำนวณ ⇒ ไม่มีการเทียบ · ตั้งค่า → SLA',
  reconciliation: {
    title: 'กระทบยอด ↔ ใบกำกับ',
    lines: [{ key: 'a', label: 'รายได้ ≤ เอกสาร', sign: '+', amountSatang: 100 }],
    differenceSatang: 0,
    balanced: true,
    note: '✓ ตรงกัน',
  },
  cache: {
    mode: 'daily',
    computedAt: '2026-10-04T03:00:00Z',
    fromCache: false,
    stale: false,
    expiresAt: null,
    refreshAvailableAt: null,
    refreshThrottled: false,
  },
}

describe('reportPdfText / reportPdfSafePayload (mytester J-04)', () => {
  const font = openThaiFont()

  it('ฟอนต์ไม่มีอักษรทุกตัวในตารางแทนที่ (ยืนยันว่าต้องแทน)', () => {
    const keys = Object.keys(REPORT_PDF_GLYPH_REPLACEMENTS).join('')
    expect(missingGlyphs(font, keys)).toEqual([...keys])
  })

  it('ค่าที่ใช้แทนพิมพ์ได้ครบ', () => {
    expect(missingGlyphs(font, Object.values(REPORT_PDF_GLYPH_REPLACEMENTS).join(''))).toEqual([])
  })

  it('แทนลูกศรในข้อความ', () => {
    expect(reportPdfText('ก ⇒ ข → ค')).toBe('ก => ข > ค')
    expect(reportPdfText('ไม่มีสัญลักษณ์ — · ÷ −')).toBe('ไม่มีสัญลักษณ์ — · ÷ −')
  })

  it('ทุกข้อความที่ PDF พิมพ์จาก payload ผ่านการแทนแล้ว · ตัวเลขไม่เปลี่ยน', () => {
    const safe = reportPdfSafePayload(PAYLOAD)
    const texts = [
      safe.report.title,
      safe.range.label,
      ...safe.columns.map((column) => column.header),
      ...safe.rows.flatMap((row) => Object.values(row).map(String)),
      ...safe.kpis.flatMap((kpi) => [kpi.label, String(kpi.value), kpi.hint ?? '']),
      ...Object.values(safe.totalRow ?? {}).map(String),
      safe.note ?? '',
      safe.reconciliation?.title ?? '',
      ...(safe.reconciliation?.lines.map((line) => line.label) ?? []),
      safe.reconciliation?.note ?? '',
    ]
    expect(missingGlyphs(font, texts.join(' '))).toEqual([])
    expect(safe.rows[0]?.['revenue']).toBe(100)
    expect(safe.reconciliation?.lines[0]?.amountSatang).toBe(100)
  })
})
