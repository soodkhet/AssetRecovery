import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer'
import { ensureThaiFont, THAI_FONT } from '@/components/pdf/thai-font'
import type { HandoverDocModel } from '@/lib/warehouse/handover-doc'
import { EMPTY_DOC_VALUE } from '@/lib/warehouse/handover-doc'

/**
 * ใบส่งมอบสินทรัพย์คืน (`44` §6.4) — เอกสาร**ภายใน** ไม่ใช่เอกสารทางการทางภาษี
 * เลย์เอาต์ตาม mockup `reference/warehouse.html` (modal `view-delivery-doc`)
 *
 * เรนเดอร์ฝั่ง server ด้วย `@react-pdf/renderer` (`28` §7 — ห้ามสลับไป library อื่นโดยไม่มี DEC)
 *
 * ⚠️ ฟอนต์ไทย register ผ่าน `ensureThaiFont()` (`components/pdf/thai-font.ts`) — ใช้ร่วมทุกเอกสาร
 * ⚠️ วันที่ทุกจุดเป็น พ.ศ. มาแล้วจาก `buildHandoverDoc()` — component นี้ **ห้าม format วันที่เอง**
 */

/** สัดส่วนคอลัมน์ของตารางรายการ (รวม = 100) */
const COLUMN_WIDTHS = ['5%', '17%', '20%', '22%', '22%', '14%'] as const

const styles = StyleSheet.create({
  page: { fontFamily: THAI_FONT, fontSize: 9, paddingHorizontal: 36, paddingTop: 36, paddingBottom: 56, color: '#0f172a' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  title: { fontSize: 16, fontWeight: 700 },
  issuerName: { fontSize: 9, color: '#64748b', marginTop: 3 },
  headerRight: { alignItems: 'flex-end' },
  docRef: { fontSize: 11, fontWeight: 700 },
  headerMeta: { fontSize: 8, color: '#64748b', marginTop: 2 },
  partyRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  partyBox: { flex: 1, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 6, padding: 10 },
  partyLabel: { fontSize: 8, color: '#64748b', marginBottom: 4 },
  partyName: { fontSize: 10, fontWeight: 700 },
  partyLine: { fontSize: 8, color: '#475569', marginTop: 2 },
  table: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 6, marginBottom: 16 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#f8fafc', borderBottomWidth: 1, borderColor: '#e2e8f0' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#f1f5f9' },
  th: { fontSize: 8, fontWeight: 700, color: '#475569', paddingHorizontal: 6, paddingVertical: 5 },
  td: { fontSize: 8, paddingHorizontal: 6, paddingVertical: 5 },
  tdMuted: { fontSize: 7, color: '#94a3b8' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  summaryText: { fontSize: 9, fontWeight: 700 },
  noteText: { fontSize: 8, color: '#475569', maxWidth: '70%' },
  signRow: { flexDirection: 'row', gap: 28, marginTop: 8 },
  signBox: { flex: 1, borderTopWidth: 1, borderColor: '#cbd5e1', paddingTop: 10, alignItems: 'center' },
  signLabel: { fontSize: 8, color: '#64748b' },
  signLine: { fontSize: 9, marginTop: 22 },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 36,
    right: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7,
    color: '#94a3b8',
  },
})

function PartyBox({
  label,
  name,
  lines,
}: {
  label: string
  name: string
  lines: readonly (string | null)[]
}): React.JSX.Element {
  return (
    <View style={styles.partyBox}>
      <Text style={styles.partyLabel}>{label}</Text>
      <Text style={styles.partyName}>{name}</Text>
      {lines
        .filter((line): line is string => line !== null && line.trim() !== '')
        .map((line, index) => (
          <Text key={index} style={styles.partyLine}>
            {line}
          </Text>
        ))}
    </View>
  )
}

export function HandoverNote({ doc }: { doc: HandoverDocModel }): React.JSX.Element {
  return (
    <Document title={`${doc.title} ${doc.docRef}`} author={doc.issuer.name}>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>{doc.title}</Text>
            <Text style={styles.issuerName}>{doc.issuer.name}</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.docRef}>เลขที่: {doc.docRef}</Text>
            <Text style={styles.headerMeta}>เลขล็อต: {doc.lotNumber}</Text>
            <Text style={styles.headerMeta}>วันที่: {doc.issuedAtLabel}</Text>
            <Text style={styles.headerMeta}>รูปแบบ: {doc.typeLabel}</Text>
          </View>
        </View>

        <View style={styles.partyRow}>
          <PartyBox
            label="ผู้ส่งมอบ"
            name={doc.issuer.name}
            lines={[
              doc.issuer.address,
              doc.issuer.taxId === null ? null : `เลขประจำตัวผู้เสียภาษี ${doc.issuer.taxId}`,
              doc.issuer.phone === null ? null : `โทร. ${doc.issuer.phone}`,
            ]}
          />
          <PartyBox
            label="ผู้รับมอบ"
            name={doc.recipient.name}
            lines={[
              doc.recipient.address,
              doc.recipient.taxId === null ? null : `เลขประจำตัวผู้เสียภาษี ${doc.recipient.taxId}`,
              doc.recipient.contactPerson === EMPTY_DOC_VALUE ? null : `ผู้ประสานงาน: ${doc.recipient.contactPerson}`,
              doc.recipient.deliveryAddr === EMPTY_DOC_VALUE ? null : `ที่อยู่จัดส่ง: ${doc.recipient.deliveryAddr}`,
            ]}
          />
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader} fixed>
            <Text style={[styles.th, { width: COLUMN_WIDTHS[0] }]}>#</Text>
            <Text style={[styles.th, { width: COLUMN_WIDTHS[1] }]}>เลขสัญญา</Text>
            <Text style={[styles.th, { width: COLUMN_WIDTHS[2] }]}>ชื่อลูกหนี้</Text>
            <Text style={[styles.th, { width: COLUMN_WIDTHS[3] }]}>อุปกรณ์</Text>
            <Text style={[styles.th, { width: COLUMN_WIDTHS[4] }]}>IMEI / Serial</Text>
            <Text style={[styles.th, { width: COLUMN_WIDTHS[5] }]}>สภาพ</Text>
          </View>
          {doc.rows.map((row) => (
            <View key={row.caseRef + String(row.no)} style={styles.tableRow} wrap={false}>
              <Text style={[styles.td, { width: COLUMN_WIDTHS[0] }]}>{row.no}</Text>
              <Text style={[styles.td, { width: COLUMN_WIDTHS[1] }]}>{row.caseRef}</Text>
              <Text style={[styles.td, { width: COLUMN_WIDTHS[2] }]}>{row.debtorName}</Text>
              <Text style={[styles.td, { width: COLUMN_WIDTHS[3] }]}>{row.deviceDesc}</Text>
              <View style={[styles.td, { width: COLUMN_WIDTHS[4] }]}>
                <Text>{row.identifier}</Text>
                {row.identifierActual === null ? null : (
                  <Text style={styles.tdMuted}>ตรวจจริง: {row.identifierActual}</Text>
                )}
              </View>
              <View style={[styles.td, { width: COLUMN_WIDTHS[5] }]}>
                <Text>{row.condition}</Text>
                {row.conditionNote === null ? null : <Text style={styles.tdMuted}>{row.conditionNote}</Text>}
              </View>
            </View>
          ))}
        </View>

        <View style={styles.summaryRow}>
          <Text style={styles.noteText}>{doc.note === EMPTY_DOC_VALUE ? '' : `หมายเหตุ: ${doc.note}`}</Text>
          <Text style={styles.summaryText}>รวมทั้งสิ้น {doc.totalCount} เครื่อง</Text>
        </View>

        <View style={styles.signRow}>
          <View style={styles.signBox}>
            <Text style={styles.signLabel}>ลายมือชื่อผู้ส่งมอบ</Text>
            <Text style={styles.signLine}>............................................</Text>
            <Text style={styles.signLabel}>วันที่ ..............................................</Text>
          </View>
          <View style={styles.signBox}>
            <Text style={styles.signLabel}>ลายมือชื่อผู้รับมอบ</Text>
            <Text style={styles.signLine}>............................................</Text>
            <Text style={styles.signLabel}>วันที่ ..............................................</Text>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text>
            {doc.docRef} · {doc.lotNumber}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `หน้า ${pageNumber}/${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

/** เรนเดอร์เป็นไฟล์ PDF (`28` §7 — `renderToBuffer()` ฝั่ง server แล้วคืนพร้อม header) */
export async function renderHandoverNote(doc: HandoverDocModel): Promise<Buffer> {
  ensureThaiFont()
  return renderToBuffer(<HandoverNote doc={doc} />)
}
