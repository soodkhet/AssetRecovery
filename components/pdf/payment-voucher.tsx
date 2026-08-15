import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer'
import { DocFooter, DocHeader, SignatureRow, docStyles } from '@/components/pdf/internal-doc'
import { ensureThaiFont } from '@/components/pdf/thai-font'
import type { PaymentVoucherDoc } from '@/lib/payout/payout-doc'

/**
 * **ใบสำคัญจ่าย (Payment Voucher)** — เอกสารภายในใบที่ 2 ของไฟล์ 17 (`28` §6.1 · `13` §6.7)
 * เลย์เอาต์เทียบ `reference/samples/05_payment_voucher.pdf`: ตารางป้าย-ค่า 7 แถว → บล็อกยอด 3 บรรทัด
 * (ก่อนหักภาษี / หัก ณ ที่จ่าย / สุทธิ + ตัวอักษร) → ช่องเซ็น 3 ช่อง
 *
 * **1 ผู้รับเงิน = 1 หน้า** — เรียก 1 ครั้งต่อรอบได้ทั้งชุด (`renderPaymentVouchers()`)
 * ⚠️ ทุกค่าประกอบมาแล้วจาก `buildPaymentVoucherDocs()` (pure) — ห้าม format ซ้ำที่นี่
 */

const styles = StyleSheet.create({
  infoTable: { borderWidth: 1, borderColor: '#cbd5e1', marginBottom: 16 },
  infoRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#e2e8f0' },
  infoLabel: {
    width: '30%',
    fontSize: 9,
    paddingHorizontal: 8,
    paddingVertical: 7,
    backgroundColor: '#f8fafc',
    borderRightWidth: 1,
    borderColor: '#e2e8f0',
  },
  infoValue: { width: '70%', fontSize: 9, paddingHorizontal: 8, paddingVertical: 7 },
  amountRow: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: '#e2e8f0', paddingVertical: 6 },
  amountTotalRow: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: '#94a3b8', paddingVertical: 6 },
  amountLabel: { fontSize: 9 },
  amountLabelBold: { fontSize: 10, fontWeight: 700 },
  amountValue: { fontSize: 9 },
  amountValueBold: { fontSize: 10, fontWeight: 700 },
  inWords: { fontSize: 9, color: '#475569', marginTop: 6 },
})

function InfoRow({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  )
}

export function PaymentVoucherPage({ doc }: { doc: PaymentVoucherDoc }): React.JSX.Element {
  return (
    <Page size="A4" style={docStyles.page}>
      <DocHeader headerNote={doc.headerNote} title={doc.title} titleEn={doc.titleEn} />

      {doc.pendingNote === null ? null : (
        <View style={docStyles.warnBox}>
          <Text style={docStyles.warnText}>{doc.pendingNote}</Text>
        </View>
      )}

      <View style={styles.infoTable}>
        <InfoRow label="เลขที่ใบสำคัญจ่าย" value={doc.voucherNo} />
        <InfoRow label="จ่ายให้" value={doc.payeeName} />
        <InfoRow label="บัญชีธนาคารผู้รับ" value={doc.bankLine} />
        <InfoRow label="รายการ / วัตถุประสงค์" value={doc.description} />
        <InfoRow label="อ้างอิงรอบจ่าย" value={doc.batchName} />
        <InfoRow label="วิธีจ่ายเงิน" value={doc.methodLabel} />
        <InfoRow label="วันที่จ่าย" value={doc.payDateLabel} />
      </View>

      <View style={styles.amountRow}>
        <Text style={styles.amountLabel}>ยอดก่อนหักภาษี</Text>
        <Text style={styles.amountValue}>{doc.grossText}</Text>
      </View>
      <View style={styles.amountRow}>
        <Text style={styles.amountLabel}>หักภาษี ณ ที่จ่าย</Text>
        <Text style={styles.amountValue}>{doc.whtText}</Text>
      </View>
      <View style={styles.amountTotalRow}>
        <Text style={styles.amountLabelBold}>จำนวนเงินสุทธิที่จ่ายจริง</Text>
        <Text style={styles.amountValueBold}>{doc.netText}</Text>
      </View>
      <Text style={styles.inWords}>({doc.netInWords})</Text>

      <SignatureRow labels={['ผู้จ่ายเงิน', 'ผู้รับเงิน', 'ผู้อนุมัติ']} />

      <DocFooter left={`${doc.voucherNo} · ${doc.issuer.name}`} />
    </Page>
  )
}

export function PaymentVouchers({ docs }: { docs: readonly PaymentVoucherDoc[] }): React.JSX.Element {
  const first = docs[0]
  // ผู้เรียกกรอง `NO_ITEMS_TO_PAY` มาแล้ว (`selectPayoutDocItems()`) — ยามท้ายทางกัน PDF หน้าเปล่า
  if (first === undefined) throw new RangeError('ใบสำคัญจ่ายต้องมีอย่างน้อย 1 รายการ')

  return (
    <Document title={`${first.title} ${first.batchName}`} author={first.issuer.name}>
      {docs.map((doc) => (
        <PaymentVoucherPage key={doc.voucherNo} doc={doc} />
      ))}
    </Document>
  )
}

export async function renderPaymentVouchers(docs: readonly PaymentVoucherDoc[]): Promise<Buffer> {
  ensureThaiFont()
  return renderToBuffer(<PaymentVouchers docs={docs} />)
}
