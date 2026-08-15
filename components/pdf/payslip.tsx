import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer'
import { DocFooter, DocHeader, MetaCell, SignatureRow, docStyles } from '@/components/pdf/internal-doc'
import { ensureThaiFont } from '@/components/pdf/thai-font'
import type { PayslipDoc } from '@/lib/payout/payout-doc'

/**
 * **สลิปค่าตอบแทน (Compensation Statement / Payslip)** — เอกสารภายในใบที่ 3 ของไฟล์ 17
 * (`28` §6.1 "สรุปค่าตอบแทนต่อพนักงาน/รอบ") · เลย์เอาต์เทียบ `reference/samples/06_payslip.pdf`
 *
 * **1 ผู้รับเงิน = 1 หน้า** — ยอดหัก ณ ที่จ่ายแสดงในวงเล็บตามตัวอย่าง
 * ⚠️ ทุกค่าประกอบมาแล้วจาก `buildPayslipDocs()` (pure) — ห้ามคิด/format ซ้ำที่นี่ (Rule 01)
 */

const styles = StyleSheet.create({
  itemHeader: { flexDirection: 'row', backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1' },
  itemRow: { flexDirection: 'row', borderWidth: 1, borderTopWidth: 0, borderColor: '#e2e8f0' },
  itemDesc: { width: '72%', fontSize: 9, paddingHorizontal: 8, paddingVertical: 7 },
  itemAmount: {
    width: '28%',
    fontSize: 9,
    paddingHorizontal: 8,
    paddingVertical: 7,
    textAlign: 'right',
    borderLeftWidth: 1,
    borderColor: '#e2e8f0',
  },
  itemHeaderText: { fontWeight: 700, color: '#334155' },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: '#e2e8f0', paddingVertical: 6 },
  sumTotalRow: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: '#94a3b8', paddingVertical: 6 },
  sumLabel: { fontSize: 9 },
  sumLabelBold: { fontSize: 10, fontWeight: 700 },
  sumValue: { fontSize: 9 },
  sumValueBold: { fontSize: 10, fontWeight: 700 },
})

export function PayslipPage({ doc }: { doc: PayslipDoc }): React.JSX.Element {
  return (
    <Page size="A4" style={docStyles.page}>
      <DocHeader headerNote={doc.headerNote} title={doc.title} titleEn={doc.titleEn} />

      <View style={docStyles.metaGrid}>
        <MetaCell label="ชื่อ" value={doc.payeeName} />
        <MetaCell label="ทีม" value={doc.teamName} />
        <MetaCell label="รอบ" value={doc.batchName} />
        <MetaCell label="อ้างอิงรอบจ่าย" value={doc.batchRef} />
        <MetaCell label="วันที่เอกสาร" value={doc.issuedAtLabel} />
      </View>

      <View style={styles.itemHeader}>
        <Text style={[styles.itemDesc, styles.itemHeaderText]}>รายการ</Text>
        <Text style={[styles.itemAmount, styles.itemHeaderText]}>จำนวนเงิน (บาท)</Text>
      </View>
      {doc.rows.map((row, index) => (
        <View key={`${row.description}-${index}`} style={styles.itemRow} wrap={false}>
          <Text style={styles.itemDesc}>{row.description}</Text>
          <Text style={styles.itemAmount}>{row.amountText}</Text>
        </View>
      ))}

      <View style={{ marginTop: 10 }}>
        <View style={styles.sumRow}>
          <Text style={styles.sumLabelBold}>รวมค่าตอบแทนก่อนหักภาษี</Text>
          <Text style={styles.sumValueBold}>{doc.grossText}</Text>
        </View>
        <View style={styles.sumRow}>
          <Text style={styles.sumLabel}>{doc.whtLabel}</Text>
          <Text style={styles.sumValue}>{doc.whtText}</Text>
        </View>
        <View style={styles.sumTotalRow}>
          <Text style={styles.sumLabelBold}>ยอดโอนสุทธิ</Text>
          <Text style={styles.sumValueBold}>{doc.netText}</Text>
        </View>
      </View>

      <Text style={docStyles.noteText}>หมายเหตุ: {doc.note}</Text>

      <SignatureRow labels={['ผู้จัดทำ', 'ผู้รับเงิน (รับทราบ)']} />

      <DocFooter left={`${doc.batchRef} · ${doc.payeeName}`} />
    </Page>
  )
}

export function Payslips({ docs }: { docs: readonly PayslipDoc[] }): React.JSX.Element {
  const first = docs[0]
  // ผู้เรียกกรอง `NO_ITEMS_TO_PAY` มาแล้ว (`selectPayoutDocItems()`) — ยามท้ายทางกัน PDF หน้าเปล่า
  if (first === undefined) throw new RangeError('สลิปค่าตอบแทนต้องมีอย่างน้อย 1 รายการ')

  return (
    <Document title={`${first.title} ${first.batchName}`} author={first.issuer.name}>
      {docs.map((doc) => (
        <PayslipPage key={`${doc.batchRef}-${doc.payeeName}`} doc={doc} />
      ))}
    </Document>
  )
}

export async function renderPayslips(docs: readonly PayslipDoc[]): Promise<Buffer> {
  ensureThaiFont()
  return renderToBuffer(<Payslips docs={docs} />)
}
