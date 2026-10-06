import { Document, renderToBuffer } from '@react-pdf/renderer'
import {
  AmountInWordsRow,
  Banner,
  DateNumberRow,
  DOC_COPY_LABEL,
  DocPage,
  DocRow,
  DocTable,
  DocTitleHeader,
  letterheadPartyLines,
  NoteText,
  partyLines,
  PartyPanel,
  PaymentChannelRow,
  Signatures,
  SummaryRow,
  type DocColumn,
} from '@/components/pdf/doc-layout'
import { ensureThaiFont } from '@/components/pdf/thai-font'
import type { DocLetterhead } from '@/lib/organization/profile'
import type { PaymentVoucherDoc } from '@/lib/payout/payout-doc'

/**
 * **ใบสำคัญจ่าย (Payment Voucher)** — เลย์เอาต์ตามแบบที่อนุมัติ (มติ PO U100/U101) · **ต้นฉบับเดียว**
 * จ่ายโดย (หัวเอกสารกลาง) / จ่ายให้ (ข้อมูลผู้รับ U94) → รายการรวมตามประเภท → หัก ณ ที่จ่ายตามที่ระบบคิดจริง
 * (ฐานตามค่าตั้ง U3) + หักคืนเงินทดรอง (แดง — หักหลังภาษี มติ U30) → ยอดโอนสุทธิ + ตัวอักษร → ผู้จัดทำ/ผู้อนุมัติ/ผู้รับเงิน
 *
 * **1 ผู้รับเงิน = 1 ชุดหน้า** — เลขที่ใบสำคัญจ่ายมาจากข้อมูล (`doc.voucherNo`) ที่นี่ไม่สร้างเลขเอง
 * ⚠️ ทุกค่าประกอบมาแล้วจาก `buildPaymentVoucherDocs()` (pure) — ห้าม format/คำนวณซ้ำที่นี่
 */

const COLUMNS: readonly DocColumn[] = [
  { label: 'ลำดับ', width: '8%', align: 'center' },
  { label: 'รายการ (Descriptions)', width: '66%' },
  { label: 'บาท (Baht)', width: '26%', align: 'right' },
]

export function PaymentVoucherPage({ doc, letterhead }: { doc: PaymentVoucherDoc; letterhead: DocLetterhead }): React.JSX.Element {
  const payee = doc.payee
  return (
    <DocPage footerLeft={`${doc.issuer.name} · ${doc.voucherNo}`}>
      <DocTitleHeader letterhead={letterhead} title={doc.title} titleEn={doc.titleEn} copyLabel={DOC_COPY_LABEL.original} />
      <DateNumberRow
        date={doc.payDateLabel}
        number={doc.voucherNo}
        extras={[
          ['อ้างอิงรอบจ่าย', doc.batchName],
          ['วันที่จ่าย', doc.payDateLabel],
          ['วิธีจ่ายเงิน', doc.methodLabel],
          ['ทีม', doc.teamName],
        ]}
      />
      {doc.pendingNote === null ? null : <Banner tone="info" text={doc.pendingNote} />}
      <PartyPanel
        left={{ label: 'จ่ายโดย', name: letterhead.nameTh, lines: letterheadPartyLines(letterhead) }}
        right={{
          label: 'จ่ายให้',
          name: payee.displayName,
          lines: partyLines({
            address: payee.address,
            taxId: payee.taxId,
            branchLabel: payee.branchLabel,
            ...(payee.isCorporate ? {} : { taxLabel: 'เลขประจำตัวประชาชน' }),
            extra: [`บัญชีรับโอน: ${doc.bankLine}`],
          }),
        }}
      />

      <DocTable columns={COLUMNS}>
        {doc.lines.map((line, index) => (
          <DocRow
            key={`${line.description}-${index}`}
            columns={COLUMNS}
            cells={[{ main: String(index + 1) }, { main: line.description, detail: line.detail }, { main: line.amountText }]}
          />
        ))}
        <SummaryRow columns={COLUMNS} tone="sub" label="รวมค่าตอบแทนก่อนหักภาษี" value={doc.grossText} />
        <SummaryRow columns={COLUMNS} tone="deduct" label={doc.whtLabel} value={doc.whtDeductText} />
        {/* มติ PO U105 — ภาษีที่บริษัทออกให้: แสดงแยก ไม่หักจากยอดโอน */}
        {doc.payerTaxLine === null ? null : (
          <SummaryRow columns={COLUMNS} tone="sub" label={doc.payerTaxLine.label} value={doc.payerTaxLine.amountText} />
        )}
        {doc.offsetLines.map((line) => (
          <SummaryRow
            key={line.label}
            columns={COLUMNS}
            tone="deduct"
            label={`${line.label} (หักกลบในรอบจ่ายนี้)`}
            value={line.amountText}
          />
        ))}
        <PaymentChannelRow text={doc.paymentChannelText} />
        <SummaryRow columns={COLUMNS} tone="total" label="ยอดโอนสุทธิ :" value={doc.netText} />
        <AmountInWordsRow words={doc.netInWords} />
      </DocTable>

      <NoteText>{doc.footnote}</NoteText>
      <Signatures roles={doc.signers} />
    </DocPage>
  )
}

export function PaymentVouchers({
  docs,
  letterhead,
}: {
  docs: readonly PaymentVoucherDoc[]
  letterhead: DocLetterhead
}): React.JSX.Element {
  const first = docs[0]
  // ผู้เรียกกรอง `NO_ITEMS_TO_PAY` มาแล้ว (`selectPayoutDocItems()`) — ยามท้ายทางกัน PDF หน้าเปล่า
  if (first === undefined) throw new RangeError('ใบสำคัญจ่ายต้องมีอย่างน้อย 1 รายการ')

  return (
    <Document title={`${first.title} ${first.batchName}`} author={first.issuer.name}>
      {docs.map((doc) => (
        <PaymentVoucherPage key={doc.voucherNo} doc={doc} letterhead={letterhead} />
      ))}
    </Document>
  )
}

export async function renderPaymentVouchers(
  docs: readonly PaymentVoucherDoc[],
  letterhead: DocLetterhead,
): Promise<Buffer> {
  ensureThaiFont()
  return renderToBuffer(<PaymentVouchers docs={docs} letterhead={letterhead} />)
}
