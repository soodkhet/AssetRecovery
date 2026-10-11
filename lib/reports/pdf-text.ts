import type { ReportPayload, ReportRow } from '@/lib/reports/payload'

/**
 * ข้อความใน PDF รายงานต้องใช้อักษรที่ฟอนต์ไทยที่ฝังมี glyph จริง (mytester J-04)
 *
 * ฟอนต์ไทยของ PDF ไม่มีลูกศร/เครื่องหมายเปรียบเทียบ (⇒ → ← ↔ ↑ ↓ ≥ ≤ ✓) ⇒ พิมพ์เป็นกล่อง/อักษรเพี้ยน
 * (BUG-166 เป็นต้นเหตุเดียวกันฝั่งหน้าปก Export Pack) · ข้อความต้นทางของรายงานควรเลี่ยงอักษรเหล่านี้อยู่แล้ว
 * ตัวนี้เป็นตาข่ายรองก่อนเรนเดอร์ PDF — แทนด้วยอักษร ASCII ที่ความหมายใกล้เคียงและฟอนต์มีแน่นอน
 * (หน้าจอใช้ฟอนต์ของ browser ที่มีครบ จึงไม่ต้องแปลง)
 */
export const REPORT_PDF_GLYPH_REPLACEMENTS: Readonly<Record<string, string>> = {
  '⇒': '=>',
  '→': '>',
  '←': '<',
  '↔': '<>',
  '↑': '+',
  '↓': '-',
  '≥': '>=',
  '≤': '<=',
  '✓': '/',
}

const PATTERN = new RegExp(`[${Object.keys(REPORT_PDF_GLYPH_REPLACEMENTS).join('')}]`, 'gu')

export function reportPdfText(text: string): string {
  return text.replace(PATTERN, (char) => REPORT_PDF_GLYPH_REPLACEMENTS[char] ?? char)
}

function safeRow(row: ReportRow): ReportRow {
  const next: Record<string, string | number | null> = {}
  for (const [key, value] of Object.entries(row)) next[key] = typeof value === 'string' ? reportPdfText(value) : value
  return next
}

/** payload ที่ทุกข้อความที่ PDF พิมพ์ผ่าน {@link reportPdfText} แล้ว — ตัวเลข/โครงเดิมไม่เปลี่ยน */
export function reportPdfSafePayload(payload: ReportPayload): ReportPayload {
  return {
    ...payload,
    report: { ...payload.report, title: reportPdfText(payload.report.title) },
    range: { ...payload.range, label: reportPdfText(payload.range.label) },
    columns: payload.columns.map((column) => ({ ...column, header: reportPdfText(column.header) })),
    rows: payload.rows.map(safeRow),
    kpis: payload.kpis.map((kpi) => ({
      ...kpi,
      label: reportPdfText(kpi.label),
      value: typeof kpi.value === 'string' ? reportPdfText(kpi.value) : kpi.value,
      ...(kpi.hint === undefined ? {} : { hint: reportPdfText(kpi.hint) }),
    })),
    totalRow: payload.totalRow === null ? null : safeRow(payload.totalRow),
    note: payload.note === null ? null : reportPdfText(payload.note),
    reconciliation:
      payload.reconciliation === null
        ? null
        : {
            ...payload.reconciliation,
            title: reportPdfText(payload.reconciliation.title),
            lines: payload.reconciliation.lines.map((line) => ({ ...line, label: reportPdfText(line.label) })),
            ...(payload.reconciliation.note === undefined ? {} : { note: reportPdfText(payload.reconciliation.note) }),
          },
  }
}
