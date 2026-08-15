import { Document, Page, Text, View, renderToBuffer } from '@react-pdf/renderer'
import { DocFooter, DocHeader, MetaCell, docStyles } from '@/components/pdf/internal-doc'
import { ensureThaiFont } from '@/components/pdf/thai-font'
import type { PayoutSummaryDoc } from '@/lib/payout/payout-doc'

/**
 * **สรุปรอบจ่ายเงิน (Payout Batch Summary)** — เอกสารภายในใบที่ 1 ของไฟล์ 17 (`28` §6.1)
 * เลย์เอาต์เทียบ `reference/samples/04_payout_batch_summary.pdf`
 *
 * ⚠️ ยอดทุกช่องเป็นข้อความที่ประกอบมาแล้วจาก `buildPayoutSummaryDoc()` (pure) — component นี้
 *    **ห้ามคำนวณ/format ตัวเลขหรือวันที่เอง** (Rule 01)
 */

/** สัดส่วนคอลัมน์ (รวม = 100) — ลำดับ/ชื่อผู้รับเงิน/ยอดก่อนหัก/WHT/สุทธิ */
const COLUMNS = ['7%', '38%', '18%', '17%', '20%'] as const

export function PayoutBatchSummary({ doc }: { doc: PayoutSummaryDoc }): React.JSX.Element {
  return (
    <Document title={`${doc.title} ${doc.batchName}`} author={doc.issuer.name}>
      <Page size="A4" style={docStyles.page}>
        <DocHeader headerNote={doc.headerNote} title={doc.title} titleEn={doc.titleEn} />

        <View style={docStyles.metaGrid}>
          <MetaCell label="ชื่อรอบจ่าย" value={doc.batchName} />
          <MetaCell label="วันที่เอกสาร" value={doc.issuedAtLabel} />
          <MetaCell label="ประเภท" value={`${doc.sideLabel} — ค่าตอบแทนจากการทำเคส`} />
          <MetaCell label="สถานะรอบจ่าย" value={doc.statusLabel} />
          <MetaCell label="บัญชีที่จ่าย" value={doc.bankAccountLabel} />
          <MetaCell label="ไฟล์โอน" value={doc.paymentFileLabel} />
          <MetaCell label="Idempotency Key" value={doc.idempotencyKey} />
          <MetaCell label="จำนวนรายการในรอบ" value={doc.itemCountText} />
        </View>

        <View style={docStyles.table}>
          <View style={docStyles.tableHeader} fixed>
            <Text style={[docStyles.th, { width: COLUMNS[0] }]}>ลำดับ</Text>
            <Text style={[docStyles.th, { width: COLUMNS[1] }]}>ชื่อผู้รับเงิน</Text>
            <Text style={[docStyles.th, docStyles.amount, { width: COLUMNS[2] }]}>ยอดก่อนหัก (บาท)</Text>
            <Text style={[docStyles.th, docStyles.amount, { width: COLUMNS[3] }]}>หัก WHT (บาท)</Text>
            <Text style={[docStyles.th, docStyles.amount, { width: COLUMNS[4] }]}>โอนสุทธิ (บาท)</Text>
          </View>

          {doc.rows.map((row) => (
            <View key={row.no} style={docStyles.tableRow} wrap={false}>
              <Text style={[docStyles.td, { width: COLUMNS[0] }]}>{row.no}</Text>
              <View style={[docStyles.td, { width: COLUMNS[1] }]}>
                <Text>{row.payeeName}</Text>
                <Text style={docStyles.tdMuted}>
                  {row.teamName} · {row.itemCountText}
                </Text>
              </View>
              <Text style={[docStyles.td, docStyles.amount, { width: COLUMNS[2] }]}>{row.grossText}</Text>
              <Text style={[docStyles.td, docStyles.amount, { width: COLUMNS[3] }]}>{row.whtText}</Text>
              <Text style={[docStyles.td, docStyles.amount, { width: COLUMNS[4] }]}>{row.netText}</Text>
            </View>
          ))}

          <View style={docStyles.totalRow}>
            <Text style={[docStyles.tdBold, { width: COLUMNS[0] }]} />
            <Text style={[docStyles.tdBold, { width: COLUMNS[1] }]}>รวม</Text>
            <Text style={[docStyles.tdBold, docStyles.amount, { width: COLUMNS[2] }]}>{doc.totalGrossText}</Text>
            <Text style={[docStyles.tdBold, docStyles.amount, { width: COLUMNS[3] }]}>{doc.totalWhtText}</Text>
            <Text style={[docStyles.tdBold, docStyles.amount, { width: COLUMNS[4] }]}>{doc.totalNetText}</Text>
          </View>
        </View>

        <Text style={docStyles.noteText}>หมายเหตุ: {doc.note}</Text>

        <View style={docStyles.signRow}>
          <View style={docStyles.signBox}>
            <Text style={docStyles.signLine}>............................................................</Text>
            <Text style={docStyles.signLabel}>ผู้จัดทำ (การเงิน)</Text>
          </View>
          <View style={docStyles.signBox}>
            <Text style={docStyles.signLine}>............................................................</Text>
            <Text style={docStyles.signLabel}>ผู้อนุมัติโอนเงิน</Text>
          </View>
        </View>

        <DocFooter left={`${doc.batchName} · ${doc.issuer.name}`} />
      </Page>
    </Document>
  )
}

export async function renderPayoutBatchSummary(doc: PayoutSummaryDoc): Promise<Buffer> {
  ensureThaiFont()
  return renderToBuffer(<PayoutBatchSummary doc={doc} />)
}
