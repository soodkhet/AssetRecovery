import { Document, renderToBuffer, StyleSheet, View } from '@react-pdf/renderer'
import {
  DocPage,
  DocRow,
  DocTable,
  InternalHeader,
  layout,
  NoteText,
  Signatures,
  type DocColumn,
} from '@/components/pdf/doc-layout'
import { Text } from '@/components/pdf/text'
import { ensureThaiFont } from '@/components/pdf/thai-font'
import type { DocLetterhead } from '@/lib/organization/profile'
import type { PayoutSummaryDoc } from '@/lib/payout/payout-doc'

/**
 * **สรุปรอบจ่ายเงิน (Payout Batch Summary)** — เอกสารภายใน (`28` §6.1) · แถบหัวเอกสารภายในตามแบบที่อนุมัติ
 * (มติ PO U100 ข้อ 9) → สถานะ/บัญชีที่จ่าย/จำนวนผู้รับ → ตารางต่อผู้รับ (ค่าตอบแทน · ภาษีที่บริษัทออกให้ ·
 * หัก ณ ที่จ่าย · หักคืนเงินทดรอง · โอนสุทธิ — มติ PO U109 แยกภาษีที่บริษัทออกให้ออกจากค่าตอบแทน)
 * → ผู้จัดทำ/ผู้อนุมัติโอนเงิน
 *
 * ⚠️ ยอดทุกช่องเป็นข้อความที่ประกอบมาแล้วจาก `buildPayoutSummaryDoc()` (pure) — ห้ามคำนวณ/format เอง (Rule 01)
 */

const COLUMNS: readonly DocColumn[] = [
  { label: 'ลำดับ', width: '6%', align: 'center' },
  { label: 'ชื่อผู้รับเงิน', width: '21%' },
  { label: 'ค่าตอบแทน', width: '14%', align: 'right' },
  { label: 'ภาษีที่บริษัทออกให้', width: '17%', align: 'right' },
  { label: 'หักภาษี ณ ที่จ่าย', width: '14%', align: 'right' },
  { label: 'หักคืนเงินทดรอง', width: '14%', align: 'right' },
  { label: 'โอนสุทธิ', width: '14%', align: 'right' },
]

const styles = StyleSheet.create({
  meta: { flexDirection: 'row', flexWrap: 'wrap', fontSize: 9 },
  metaCell: { width: '33.33%', paddingRight: 8, marginBottom: 2 },
})

function Meta({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <Text style={styles.metaCell}>
      <Text style={layout.bold}>{label}:</Text> {value}
    </Text>
  )
}

export function PayoutBatchSummary({ doc, letterhead }: { doc: PayoutSummaryDoc; letterhead: DocLetterhead }): React.JSX.Element {
  return (
    <Document title={`${doc.title} ${doc.batchName}`} author={doc.issuer.name}>
      <DocPage footerLeft={`${doc.issuer.name} · ${doc.title} ${doc.batchName}`}>
        <InternalHeader
          letterhead={letterhead}
          title={doc.title}
          lines={[`รอบ: ${doc.batchName}`, `วันที่เอกสาร: ${doc.issuedAtLabel}`, `พิมพ์เมื่อ: ${doc.printedAtLabel}`]}
        />

        <View style={styles.meta}>
          <Meta label="สถานะรอบจ่าย" value={doc.statusLabel} />
          <Meta label="บัญชีที่จ่าย" value={doc.bankAccountLabel} />
          <Meta label="จำนวนผู้รับ" value={doc.payeeCountText} />
          <Meta label="ประเภท" value={doc.sideLabel} />
          <Meta label="จำนวนรายการ" value={doc.itemCountText} />
          <Meta label="ไฟล์โอน" value={doc.paymentFileLabel} />
          <Meta label="Idempotency Key" value={doc.idempotencyKey} />
        </View>

        <DocTable columns={COLUMNS}>
          {doc.rows.map((row) => (
            <DocRow
              key={row.no}
              columns={COLUMNS}
              cells={[
                { main: String(row.no) },
                { main: row.payeeName, detail: `${row.teamName} · ${row.itemCountText}` },
                { main: row.compensationText },
                { main: row.whtPaidByPayerText },
                { main: row.whtWithheldText },
                { main: row.offsetCellText },
                { main: row.transferText },
              ]}
            />
          ))}
          <DocRow
            columns={COLUMNS}
            tone="total"
            cells={[
              { main: '' },
              { main: 'รวม :' },
              { main: doc.totalCompensationText },
              { main: doc.totalWhtPaidByPayerText },
              { main: doc.totalWhtWithheldText },
              { main: doc.totalOffsetCellText },
              { main: doc.totalTransferText },
            ]}
          />
        </DocTable>

        {doc.totalOffsetText === null ? null : (
          <NoteText>หักคืนเงินทดรองหักหลังภาษี ไม่กระทบฐานภาษีหัก ณ ที่จ่าย</NoteText>
        )}
        {doc.hasPayerBorneTax ? (
          <NoteText>
            ภาษีที่บริษัทออกให้ไม่หักจากผู้รับ — บริษัทนำส่งเอง ยอดเงินได้บนหนังสือรับรองการหักภาษี ณ ที่จ่าย = ค่าตอบแทน +
            ภาษีที่บริษัทออกให้
          </NoteText>
        ) : null}
        <NoteText>ใช้ตรวจสอบก่อนตัดโอนเงินจริง · {doc.note}</NoteText>
        <Signatures roles={['ผู้จัดทำ (การเงิน)', 'ผู้อนุมัติโอนเงิน']} />
      </DocPage>
    </Document>
  )
}

export async function renderPayoutBatchSummary(doc: PayoutSummaryDoc, letterhead: DocLetterhead): Promise<Buffer> {
  ensureThaiFont()
  return renderToBuffer(<PayoutBatchSummary doc={doc} letterhead={letterhead} />)
}
