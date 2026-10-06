import { Page, StyleSheet, View } from '@react-pdf/renderer'
import { Letterhead } from '@/components/pdf/letterhead'
import { Text } from '@/components/pdf/text'
import { THAI_FONT } from '@/components/pdf/thai-font'
import type { ReceiptDocColumn, ReceiptStyleDoc } from '@/lib/documents/receipt-style-doc'
import type { DocLetterhead } from '@/lib/organization/profile'

/**
 * หน้าเอกสาร "แบบใบเสร็จ" ตาม mockup `reference/documents.html` ข้อ 6–8 (มติ PO U100/U101) —
 * ใช้ร่วมกันโดยใบเบิกเงินทดรอง / ใบรับคืนเงินทดรอง / ใบรับรองแทนใบเสร็จรับเงิน
 *
 * หัวเอกสารกลาง (`letterhead.tsx`) → ชื่อเอกสาร + ฉบับ (ขวา) → วันที่/เลขที่ → กล่องสองฝ่าย → ตาราง →
 * รวม + ตัวอักษร → (คำรับรอง) → หมายเหตุ → ลายเซ็น → ท้ายกระดาษ (ชื่อองค์กร · เลขที่ · หน้า x/y)
 * ⚠️ ค่าทุกช่องประกอบเสร็จแล้วจาก builder ที่เป็น pure — ที่นี่แค่พิมพ์ (Rule 01)
 */

const BORDER = '#0f172a'

const styles = StyleSheet.create({
  page: {
    fontFamily: THAI_FONT,
    fontSize: 9,
    paddingHorizontal: 40,
    paddingTop: 34,
    paddingBottom: 56,
    color: '#0f172a',
  },
  titleRow: { alignItems: 'flex-end', marginTop: -4 },
  title: { fontSize: 17, fontWeight: 700 },
  titleEn: { fontSize: 8.5, color: '#475569', marginTop: 1 },
  copy: { fontSize: 8.5, color: '#334155', marginTop: 2 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  metaText: { fontSize: 9.5 },
  bold: { fontWeight: 700 },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 3 },
  metaCell: { width: '50%', fontSize: 8.5, color: '#334155', marginBottom: 1 },
  parties: { flexDirection: 'row', borderWidth: 1, borderColor: BORDER, marginTop: 8 },
  partyLeft: { flex: 1, padding: 7, borderRightWidth: 1, borderColor: BORDER },
  partyRight: { flex: 1, padding: 7 },
  partyLabel: { fontSize: 8, color: '#475569', marginBottom: 2 },
  partyName: { fontSize: 9.5, fontWeight: 700, marginBottom: 1 },
  partyLine: { fontSize: 8.5, lineHeight: 1.45 },
  table: { borderWidth: 1, borderColor: BORDER, marginTop: 8 },
  headRow: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderBottomWidth: 1, borderColor: BORDER },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#cbd5e1' },
  th: { fontSize: 8.5, fontWeight: 700, paddingHorizontal: 6, paddingVertical: 5 },
  td: { fontSize: 9, paddingHorizontal: 6, paddingVertical: 5 },
  sub: { fontSize: 8, color: '#475569', marginTop: 1 },
  deduct: { color: '#334155' },
  fullRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#cbd5e1', paddingHorizontal: 6, paddingVertical: 5 },
  choice: { fontSize: 9, marginRight: 10 },
  summaryRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#cbd5e1' },
  summaryLabel: { flex: 1, fontSize: 9, textAlign: 'right', paddingHorizontal: 6, paddingVertical: 5 },
  summaryValue: { width: 110, fontSize: 9, textAlign: 'right', paddingHorizontal: 6, paddingVertical: 5 },
  totalRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: BORDER, backgroundColor: '#f8fafc' },
  totalText: { fontWeight: 700, fontSize: 10 },
  words: { fontSize: 9, textAlign: 'center', paddingHorizontal: 6, paddingVertical: 6 },
  certification: { borderWidth: 1, borderColor: BORDER, padding: 8, marginTop: 10, fontSize: 9, lineHeight: 1.5 },
  note: { fontSize: 8, color: '#475569', marginTop: 6, lineHeight: 1.45 },
  cancelBox: { borderWidth: 1.5, borderColor: '#b91c1c', backgroundColor: '#fef2f2', padding: 7, marginTop: 8 },
  cancelTitle: { fontSize: 13, fontWeight: 700, color: '#b91c1c', textAlign: 'center' },
  cancelDetail: { fontSize: 8.5, color: '#b91c1c', textAlign: 'center', marginTop: 2 },
  signRow: { flexDirection: 'row', gap: 18, marginTop: 30 },
  signBox: { flex: 1, alignItems: 'center' },
  signLine: { width: '85%', borderBottomWidth: 1, borderColor: '#64748b', height: 22 },
  signName: { fontSize: 8.5, marginTop: 3 },
  signRole: { fontSize: 9, fontWeight: 700, marginTop: 1 },
  signDate: { fontSize: 8, color: '#475569', marginTop: 1 },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7.5,
    color: '#64748b',
    borderTopWidth: 1,
    borderColor: '#cbd5e1',
    paddingTop: 4,
  },
})

function cellStyle(column: ReceiptDocColumn): { width?: number; flex?: number; textAlign: 'left' | 'center' | 'right' } {
  return column.width === undefined ? { flex: 1, textAlign: column.align } : { width: column.width, textAlign: column.align }
}

export function ReceiptStylePage({ doc, letterhead }: { doc: ReceiptStyleDoc; letterhead: DocLetterhead }): React.JSX.Element {
  const [left, right] = doc.parties
  // ช่องที่ยืดเต็ม = ช่องรายละเอียด (พิมพ์บรรทัดรองใต้ช่องนี้)
  const flexIndex = doc.columns.findIndex((column) => column.width === undefined)
  const amountWidth = doc.columns.find((column) => column.align === 'right' && column.width !== undefined)?.width ?? 110
  // คอลัมน์หลังช่องเงิน (เช่น "หมายเหตุ" ของใบรับรองแทนใบเสร็จ) — แถวรวมเว้นช่องให้ตรงกัน
  const amountIndex = doc.columns.findIndex((column) => column.align === 'right')
  const trailingWidth = doc.columns
    .slice(amountIndex + 1)
    .reduce((sum, column) => sum + (column.width ?? 0), 0)

  return (
    <Page size="A4" style={styles.page}>
      <Letterhead letterhead={letterhead} />
      <View style={styles.titleRow}>
        <Text style={styles.title}>{doc.title}</Text>
        <Text style={styles.titleEn}>{doc.titleEn}</Text>
        {doc.copyLabel === null ? null : <Text style={styles.copy}>{doc.copyLabel}</Text>}
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.metaText}>
          <Text style={styles.bold}>วันที่: </Text>
          {doc.dateText}
        </Text>
        <Text style={styles.metaText}>
          <Text style={styles.bold}>เลขที่: </Text>
          {doc.number}
        </Text>
      </View>
      {doc.meta.length === 0 ? null : (
        <View style={styles.metaGrid}>
          {doc.meta.map((entry) => (
            <Text key={entry.label} style={styles.metaCell}>
              <Text style={styles.bold}>{entry.label}: </Text>
              {entry.value}
            </Text>
          ))}
        </View>
      )}

      {doc.cancelled === null ? null : (
        <View style={styles.cancelBox}>
          <Text style={styles.cancelTitle}>{doc.cancelled.title}</Text>
          <Text style={styles.cancelDetail}>{doc.cancelled.detail}</Text>
        </View>
      )}

      <View style={styles.parties}>
        {[left, right].map((party, index) => (
          <View key={party.label} style={index === 0 ? styles.partyLeft : styles.partyRight}>
            <Text style={styles.partyLabel}>{party.label} :</Text>
            <Text style={styles.partyName}>{party.name}</Text>
            {party.lines.map((line) => (
              <Text key={line} style={styles.partyLine}>
                {line}
              </Text>
            ))}
          </View>
        ))}
      </View>

      <View style={styles.table}>
        <View style={styles.headRow}>
          {doc.columns.map((column) => (
            <Text key={column.header} style={[styles.th, cellStyle(column)]}>
              {column.header}
            </Text>
          ))}
        </View>
        {doc.rows.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.row} wrap={false}>
            {doc.columns.map((column, index) => (
              <View key={column.header} style={cellStyle(column)}>
                <Text style={[styles.td, { textAlign: column.align }, row.deduct === true ? styles.deduct : {}]}>
                  {row.cells[index] ?? ''}
                </Text>
                {index === flexIndex && row.sub !== undefined && row.sub !== null ? (
                  <Text style={[styles.sub, { paddingHorizontal: 6, marginTop: -3, paddingBottom: 4 }]}>{row.sub}</Text>
                ) : null}
              </View>
            ))}
          </View>
        ))}

        {doc.choices === null ? null : (
          <View style={styles.fullRow}>
            <Text style={styles.choice}>
              <Text style={styles.bold}>{doc.choices.label} :</Text>
            </Text>
            {doc.choices.options.map((option) => (
              <Text key={option.label} style={styles.choice}>
                {option.checked ? '[X] ' : '[   ] '}
                {option.label}
              </Text>
            ))}
          </View>
        )}
        {doc.infoLine === null ? null : (
          <View style={styles.fullRow}>
            <Text style={{ fontSize: 9 }}>
              <Text style={styles.bold}>{doc.infoLine.label} : </Text>
              {doc.infoLine.text}
            </Text>
          </View>
        )}

        {doc.summary.map((entry) => (
          <View key={entry.label} style={entry.tone === 'total' ? styles.totalRow : styles.summaryRow}>
            <Text style={[styles.summaryLabel, entry.tone === 'total' ? styles.totalText : {}]}>{entry.label}</Text>
            <Text style={[styles.summaryValue, { width: amountWidth }, entry.tone === 'total' ? styles.totalText : {}]}>
              {entry.value}
            </Text>
            {trailingWidth > 0 ? <View style={{ width: trailingWidth }} /> : null}
          </View>
        ))}
        <Text style={styles.words}>{doc.wordsText}</Text>
      </View>

      {doc.certification === null ? null : <Text style={styles.certification}>{doc.certification}</Text>}
      {doc.note === null ? null : <Text style={styles.note}>{doc.note}</Text>}

      <View style={styles.signRow} wrap={false}>
        {doc.signatures.map((signature) => (
          <View key={signature.role} style={styles.signBox}>
            <View style={styles.signLine} />
            <Text style={styles.signName}>( {signature.name ?? '........................................'} )</Text>
            <Text style={styles.signRole}>{signature.role}</Text>
            <Text style={styles.signDate}>วันที่ ......../......../............</Text>
          </View>
        ))}
      </View>

      <View style={styles.footer} fixed>
        <Text>{doc.footerLeft}</Text>
        <Text render={({ pageNumber, totalPages }) => `หน้า ${pageNumber}/${totalPages}`} />
      </View>
    </Page>
  )
}
