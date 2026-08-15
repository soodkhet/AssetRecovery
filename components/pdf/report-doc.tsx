import { Document, Page, Text, View, renderToBuffer } from '@react-pdf/renderer'
import { DocFooter, DocHeader, MetaCell, docStyles } from '@/components/pdf/internal-doc'
import { ensureThaiFont } from '@/components/pdf/thai-font'
import { fmtDateTime } from '@/lib/format/datetime'
import { reportTextRows } from '@/lib/reports/export'
import { formatCellText, type ReportPayload } from '@/lib/reports/payload'

/**
 * PDF ของเมนูรายงาน (`96` §11 "ทุกรายงานมีปุ่ม Export PDF" · E13 "PDF ฝัง Noto Sans Thai")
 *
 * เป็น **เอกสารภายใน** (`28` §6.1) ⇒ ใช้ชิ้นส่วนร่วมของ `internal-doc.tsx` ห้ามใช้ชุดเอกสารทางการ
 * ตารางเรนเดอร์จาก `payload.columns/rows` ชุดเดียวกับหน้าจอ (`96` §13) — ไม่มี query ซ้ำในไฟล์นี้
 *
 * แนวนอน (landscape) เพราะรายงานส่วนใหญ่กว้างเกิน A4 ตั้ง (สูงสุด ~10 คอลัมน์ตาม `96` §6)
 */

const NUMERIC_TYPES = new Set(['money', 'number', 'percent'])

function columnFlex(payload: ReportPayload, index: number): number {
  const column = payload.columns[index]
  if (column === undefined) return 1
  return column.type === 'text' ? 2 : 1
}

export function ReportDocument({
  payload,
  generatedAt,
  generatedByName,
}: {
  payload: ReportPayload
  generatedAt: Date
  generatedByName: string
}): React.JSX.Element {
  const rows = reportTextRows(payload)
  const hasTotalRow = payload.totalRow !== null

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={docStyles.page}>
        <DocHeader
          headerNote="เอกสารภายใน — ใช้เพื่อการบริหารจัดการ ไม่ใช่เอกสารทางภาษี"
          title={payload.report.title}
          titleEn={payload.report.code}
        />

        <View style={docStyles.metaGrid}>
          <MetaCell label="ช่วงเวลา" value={payload.range.label} />
          <MetaCell label="ข้อมูล ณ" value={fmtDateTime(payload.cache.computedAt)} />
          <MetaCell label="ออกรายงานเมื่อ" value={fmtDateTime(generatedAt)} />
          <MetaCell label="ออกโดย" value={generatedByName} />
        </View>

        {payload.kpis.length > 0 && (
          <View style={docStyles.metaGrid}>
            {payload.kpis.map((kpi) => (
              <MetaCell key={kpi.key} label={kpi.label} value={formatCellText(kpi.value, kpi.type)} />
            ))}
          </View>
        )}

        <View style={docStyles.table}>
          <View style={docStyles.tableHeader} fixed>
            {payload.columns.map((column, index) => (
              <Text
                key={column.key}
                style={[
                  docStyles.th,
                  { flex: columnFlex(payload, index) },
                  ...(NUMERIC_TYPES.has(column.type) ? [docStyles.amount] : []),
                ]}
              >
                {column.header}
              </Text>
            ))}
          </View>

          {rows.map((cells, rowIndex) => {
            const isTotal = hasTotalRow && rowIndex === rows.length - 1
            return (
              <View key={rowIndex} style={isTotal ? docStyles.totalRow : docStyles.tableRow} wrap={false}>
                {cells.map((cell, index) => (
                  <Text
                    key={payload.columns[index]?.key ?? index}
                    style={[
                      isTotal ? docStyles.tdBold : docStyles.td,
                      { flex: columnFlex(payload, index) },
                      ...(NUMERIC_TYPES.has(payload.columns[index]?.type ?? 'text') ? [docStyles.amount] : []),
                    ]}
                  >
                    {cell}
                  </Text>
                ))}
              </View>
            )
          })}
        </View>

        {rows.length === 0 && <Text style={docStyles.noteText}>ไม่มีข้อมูลในช่วงเวลาที่เลือก</Text>}
        {payload.note !== null && <Text style={docStyles.noteText}>{payload.note}</Text>}

        <DocFooter left={`${payload.report.code} · ${payload.range.label}`} />
      </Page>
    </Document>
  )
}

export async function renderReportPdf(options: {
  payload: ReportPayload
  generatedAt: Date
  generatedByName: string
}): Promise<Buffer> {
  ensureThaiFont()
  return renderToBuffer(
    <ReportDocument
      payload={options.payload}
      generatedAt={options.generatedAt}
      generatedByName={options.generatedByName}
    />,
  )
}
