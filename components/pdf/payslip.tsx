import { Document, renderToBuffer, StyleSheet, View } from '@react-pdf/renderer'
import {
  AmountInWordsRow,
  DateNumberRow,
  DocPage,
  DocRow,
  DocTable,
  DocTitleHeader,
  layout,
  PaymentChannelRow,
  SummaryRow,
  type DocColumn,
} from '@/components/pdf/doc-layout'
import { Text } from '@/components/pdf/text'
import { ensureThaiFont } from '@/components/pdf/thai-font'
import type { DocLetterhead } from '@/lib/organization/profile'
import type { PayslipDoc } from '@/lib/payout/payout-doc'

/**
 * **สลิปค่าตอบแทน (Payslip)** — เลย์เอาต์ตามแบบที่อนุมัติ (มติ PO U100/U101): **ไม่มีป้ายฉบับ ไม่มีช่องเซ็น**
 * · ช่องสรุป เคสสำเร็จ / วันทำงานภาคสนาม / คืนที่พัก / ยอดโอนสุทธิ · ตารางรายการต่อบรรทัดเบิก
 * · ข้อความ "เอกสารนี้ออกโดยระบบ" ท้ายเอกสาร
 *
 * **1 ผู้รับเงิน = 1 ชุดหน้า** — ⚠️ ทุกค่าประกอบมาแล้วจาก `buildPayslipDocs()` (pure) — ห้ามคิด/format ซ้ำ (Rule 01)
 */

const COLUMNS: readonly DocColumn[] = [
  { label: 'ลำดับ', width: '8%', align: 'center' },
  { label: 'รายการ (Descriptions)', width: '66%' },
  { label: 'บาท (Baht)', width: '26%', align: 'right' },
]

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', borderWidth: 1, borderColor: '#111827', marginTop: 10 },
  tile: { flex: 1, paddingVertical: 6, paddingHorizontal: 4, alignItems: 'center' },
  tileBorder: { borderRightWidth: 1, borderColor: '#111827' },
  tileLabel: { fontSize: 8, color: '#475569' },
  tileValue: { fontSize: 11, fontWeight: 700 },
})

export function PayslipPage({ doc, letterhead }: { doc: PayslipDoc; letterhead: DocLetterhead }): React.JSX.Element {
  return (
    <DocPage footerLeft={`${doc.issuer.name} · ${doc.voucherNo}`}>
      <DocTitleHeader letterhead={letterhead} title={doc.title} titleEn={doc.titleEn} />
      <DateNumberRow
        date={doc.issuedAtLabel}
        number={doc.voucherNo}
        extras={[
          ['ชื่อ', doc.payeeName],
          ['ทีม', doc.teamName],
          ['รอบ', doc.batchName],
          ['วันที่โอน', doc.issuedAtLabel],
        ]}
      />

      <View style={styles.tiles} wrap={false}>
        {doc.stats.map((tile, index) => (
          <View key={tile.label} style={index < doc.stats.length - 1 ? [styles.tile, styles.tileBorder] : styles.tile}>
            <Text style={styles.tileLabel}>{tile.label}</Text>
            <Text style={styles.tileValue}>{tile.value}</Text>
          </View>
        ))}
      </View>

      <DocTable columns={COLUMNS}>
        {doc.rows.map((row, index) => (
          <DocRow
            key={`${row.description}-${index}`}
            columns={COLUMNS}
            cells={[{ main: String(index + 1) }, { main: row.description }, { main: row.amountText }]}
          />
        ))}
        <SummaryRow columns={COLUMNS} tone="sub" label="รวมค่าตอบแทนก่อนหักภาษี" value={doc.grossText} />
        <SummaryRow columns={COLUMNS} tone="deduct" label={doc.whtLabel} value={doc.whtText} />
        {/* มติ PO U105 — ภาษีที่บริษัทออกให้: แสดงแยก ไม่หักจากยอดโอน */}
        {doc.payerTaxLine === null ? null : (
          <SummaryRow columns={COLUMNS} tone="sub" label={doc.payerTaxLine.label} value={doc.payerTaxLine.amountText} />
        )}
        {doc.offsetLines.map((line) => (
          <SummaryRow key={line.label} columns={COLUMNS} tone="deduct" label={line.label} value={line.amountText} />
        ))}
        <PaymentChannelRow text={doc.paymentChannelText} />
        <SummaryRow columns={COLUMNS} tone="total" label="ยอดโอนสุทธิ :" value={doc.netText} />
        <AmountInWordsRow words={doc.netInWords} />
      </DocTable>

      <Text style={layout.noteBox}>{doc.note}</Text>
    </DocPage>
  )
}

export function Payslips({
  docs,
  letterhead,
}: {
  docs: readonly PayslipDoc[]
  letterhead: DocLetterhead
}): React.JSX.Element {
  const first = docs[0]
  // ผู้เรียกกรอง `NO_ITEMS_TO_PAY` มาแล้ว (`selectPayoutDocItems()`) — ยามท้ายทางกัน PDF หน้าเปล่า
  if (first === undefined) throw new RangeError('สลิปค่าตอบแทนต้องมีอย่างน้อย 1 รายการ')

  return (
    <Document title={`${first.title} ${first.batchName}`} author={first.issuer.name}>
      {docs.map((doc) => (
        <PayslipPage key={`${doc.batchRef}-${doc.voucherNo}`} doc={doc} letterhead={letterhead} />
      ))}
    </Document>
  )
}

export async function renderPayslips(docs: readonly PayslipDoc[], letterhead: DocLetterhead): Promise<Buffer> {
  ensureThaiFont()
  return renderToBuffer(<Payslips docs={docs} letterhead={letterhead} />)
}
