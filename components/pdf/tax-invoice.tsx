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
  ORIGINAL_AND_COPY,
  partyLines,
  PartyPanel,
  PaymentChannelRow,
  Signatures,
  SummaryRow,
  type DocColumn,
  type DocCopyKind,
} from '@/components/pdf/doc-layout'
import { ensureThaiFont } from '@/components/pdf/thai-font'
import type { DocLetterhead } from '@/lib/organization/profile'
import type { TaxInvoiceDoc } from '@/lib/sales/sales'

/**
 * **ใบเสร็จรับเงิน/ใบกำกับภาษี** (ออกตอนรับเงิน — มติ PO U95) และ **ใบกำกับภาษีแบบเดิม** (ข้อมูลก่อน U95)
 * — เลย์เอาต์เดียวกันตามแบบที่อนุมัติ (มติ PO U100/U101) ต่างกันแค่ชื่อเอกสาร/ป้ายคู่ค้า/ผู้เซ็น
 * · **ต้นฉบับ + สำเนา** ใน PDF เดียว · ผู้เซ็น: ผู้รับเงิน + ผู้มีอำนาจลงนาม
 *
 * ฟิลด์บังคับตาม ม.86/4 ครบบนหน้ากระดาษนี้:
 *  1. คำว่า "ใบกำกับภาษี" เด่นชัด (ชื่อเอกสารมุมขวาบน)
 *  2. ชื่อ/ที่อยู่/เลขผู้เสียภาษี/สาขาของผู้ขาย (กล่อง "ชำระให้" — จากหัวเอกสารกลางที่ประกอบจาก snapshot บนใบ · มติ PO U99)
 *  3. ของผู้ซื้อ (กล่อง "ชำระโดย" — snapshot บนใบ)
 *  4. เลขที่  5. วันที่ออก (แถววันที่/เลขที่)
 *  6. รายการ/ปริมาณ/มูลค่าบริการ (ตาราง — คงคอลัมน์ "จำนวน" ไว้ตามข้อกำหนดเรื่องปริมาณ)
 *  7. จำนวน VAT **แยกบรรทัดออกจากมูลค่าบริการ** (ท้ายตาราง)
 *
 * ⚠️ ความครบถ้วนของ 2–3 และยอดตาม 6–7 ถูกบังคับตั้งแต่ตอนออกเอกสารด้วย `assertTaxInvoiceFieldsComplete()` — ที่นี่แค่พิมพ์
 * ⚠️ ใบที่ยกเลิกแล้วต้องพิมพ์ได้ (เก็บเป็นหลักฐาน) แต่ต้องขึ้นแถบ "ยกเลิก" เสมอ
 */

const COLUMNS: readonly DocColumn[] = [
  { label: 'ลำดับ', width: '8%', align: 'center' },
  { label: 'รายการ (Descriptions)', width: '56%' },
  { label: 'จำนวน', width: '12%', align: 'center' },
  { label: 'บาท (Baht)', width: '24%', align: 'right' },
]

function TaxInvoiceCopy({
  doc,
  letterhead,
  copy,
}: {
  doc: TaxInvoiceDoc
  letterhead: DocLetterhead
  copy: DocCopyKind
}): React.JSX.Element {
  const extras: Array<readonly [string, string]> = []
  if (doc.billingBatchNumber !== null) extras.push(['อ้างอิงใบแจ้งหนี้', doc.billingBatchNumber])
  if (doc.receivedDateLabel !== null) extras.push(['วันที่รับชำระ', doc.receivedDateLabel])
  extras.push(['รอบบัญชี', doc.periodLabel], ['รูปแบบการส่งเอกสาร', doc.deliveryFormatLabel])

  const buyer = { label: doc.buyerRole, name: doc.buyer.name, lines: partyLines(doc.buyer) }
  const seller = { label: doc.sellerRole, name: letterhead.nameTh, lines: letterheadPartyLines(letterhead) }

  return (
    <DocPage footerLeft={`${doc.seller.name} · ${doc.invoiceNumber}`}>
      <DocTitleHeader letterhead={letterhead} title={doc.title} titleEn={doc.titleEn} copyLabel={DOC_COPY_LABEL[copy]} />
      <DateNumberRow date={doc.invoiceDateLabel} number={doc.invoiceNumber} extras={extras} />

      {doc.cancelNote === null ? null : <Banner text={`เอกสารนี้ถูกยกเลิก — ${doc.cancelNote}`} />}
      {doc.replacementNote === null ? null : <Banner tone="info" text={doc.replacementNote} />}
      {doc.installmentNote === null ? null : <Banner tone="info" text={doc.installmentNote} />}

      <PartyPanel left={buyer} right={seller} />

      <DocTable columns={COLUMNS}>
        <DocRow
          columns={COLUMNS}
          cells={[{ main: '1' }, { main: doc.description }, { main: doc.quantityText }, { main: doc.amountBeforeVatText }]}
        />
        <SummaryRow columns={COLUMNS} tone="sub" label="รวมมูลค่าก่อนภาษีมูลค่าเพิ่ม" value={doc.amountBeforeVatText} />
        <SummaryRow columns={COLUMNS} label={doc.vatLabel} value={doc.vatText} />
        <SummaryRow columns={COLUMNS} tone="total" label="รวมเงินทั้งสิ้น :" value={doc.totalText} />
        {doc.customerWhtText === null ? null : (
          <SummaryRow columns={COLUMNS} tone="deduct" label={doc.customerWhtLabel} value={doc.customerWhtText} />
        )}
        {doc.receivedText === null ? null : (
          <SummaryRow columns={COLUMNS} tone="sub" label="ยอดรับชำระจริง" value={doc.receivedText} />
        )}
        {doc.outstandingText === null ? null : (
          <SummaryRow columns={COLUMNS} label="ยอดคงค้างตามใบแจ้งหนี้ (รวมภาษีมูลค่าเพิ่ม)" value={doc.outstandingText} />
        )}
        <PaymentChannelRow text={doc.paymentChannelText} />
        <AmountInWordsRow words={doc.totalInWordsText} />
      </DocTable>

      <NoteText>{doc.footnote}</NoteText>
      <Signatures roles={doc.signers} />
    </DocPage>
  )
}

export function TaxInvoicePDF({ doc, letterhead }: { doc: TaxInvoiceDoc; letterhead: DocLetterhead }): React.JSX.Element {
  return (
    <Document title={`${doc.title} ${doc.invoiceNumber}`} author={doc.seller.name}>
      {ORIGINAL_AND_COPY.map((copy) => (
        <TaxInvoiceCopy key={copy} doc={doc} letterhead={letterhead} copy={copy} />
      ))}
    </Document>
  )
}

export async function renderTaxInvoice(doc: TaxInvoiceDoc, letterhead: DocLetterhead): Promise<Buffer> {
  ensureThaiFont()
  return renderToBuffer(<TaxInvoicePDF doc={doc} letterhead={letterhead} />)
}
