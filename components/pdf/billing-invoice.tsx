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
  TemplateSignatures,
  SummaryRow,
  TemplateFooterNote,
  type DocColumn,
  type DocCopyKind,
} from '@/components/pdf/doc-layout'
import { ensureThaiFont } from '@/components/pdf/thai-font'
import type { DocLetterhead } from '@/lib/organization/profile'
import type { BillingInvoiceDoc } from '@/lib/revenue/billing-invoice'
import { NO_DOC_TEMPLATE, type DocTemplateRender } from '@/lib/settings/tax-doc-template'

/**
 * **ใบแจ้งหนี้/ใบวางบิล** (มติ PO U95 · U96 #12 · เลย์เอาต์ตามแบบที่อนุมัติ U100/U101) — ออกตอนส่งรอบวางบิล
 * · **ไม่ใช่ใบกำกับภาษี** (แถบแดงเด่นใต้กล่องคู่ค้า) · VAT เป็นยอดประมาณการ ณ วันวางบิล
 * · **ต้นฉบับ + สำเนา** ใน PDF เดียว (ฉบับละชุดหน้า เลขหน้านับต่อฉบับ) · ผู้เซ็น: ผู้วางบิล + ผู้รับวางบิล
 * · ผู้เรียกเก็บ = หัวเอกสารกลางจาก snapshot ตอนส่งรอบ (มติ PO U99) · ยอด/ข้อความประกอบเสร็จแล้วที่ `buildBillingInvoiceDoc()`
 */

const COLUMNS: readonly DocColumn[] = [
  { label: 'ลำดับ', width: '8%', align: 'center' },
  { label: 'เลขเคส', width: '22%' },
  { label: 'รายการ (Descriptions)', width: '48%' },
  { label: 'บาท (Baht)', width: '22%', align: 'right' },
]

function BillingInvoiceCopy({
  doc,
  letterhead,
  template,
  copy,
}: {
  doc: BillingInvoiceDoc
  letterhead: DocLetterhead
  template: DocTemplateRender
  copy: DocCopyKind
}): React.JSX.Element {
  return (
    <DocPage footerLeft={`${doc.seller.name} · ${doc.documentNumber}`}>
      <DocTitleHeader letterhead={letterhead} title={doc.title} titleEn={doc.titleEn} copyLabel={DOC_COPY_LABEL[copy]} />
      <DateNumberRow
        date={doc.issueDateLabel}
        number={doc.documentNumber}
        extras={[
          ['วันครบกำหนดชำระ', doc.dueDateLabel],
          ['รอบบริการ', doc.periodLabel],
        ]}
      />
      <PartyPanel
        left={{ label: 'เรียกเก็บจาก', name: doc.buyer.name, lines: partyLines(doc.buyer) }}
        right={{ label: 'ผู้เรียกเก็บ', name: letterhead.nameTh, lines: letterheadPartyLines(letterhead) }}
      />
      <Banner text={doc.notTaxInvoiceNote} />

      <DocTable columns={COLUMNS}>
        {doc.lines.map((line) => (
          <DocRow
            key={line.no}
            columns={COLUMNS}
            cells={[
              { main: line.no },
              { main: line.caseRef, mono: true, detail: `รับรู้รายได้ ${line.revenueDateLabel}` },
              { main: 'ค่าบริการติดตามทรัพย์คืนสำเร็จ', detail: line.detail },
              { main: line.beforeVatText },
            ]}
          />
        ))}
        <SummaryRow columns={COLUMNS} tone="sub" label="มูลค่าบริการก่อนภาษีมูลค่าเพิ่ม" value={doc.amountBeforeVatText} />
        <SummaryRow columns={COLUMNS} label={doc.vatLabel} value={doc.vatText} />
        <SummaryRow columns={COLUMNS} tone="total" label="รวมเงินทั้งสิ้น :" value={doc.totalText} />
        {doc.customerWht === null ? null : (
          <>
            <SummaryRow columns={COLUMNS} tone="deduct" label={doc.customerWht.whtLabel} value={doc.customerWht.whtText} />
            <SummaryRow
              columns={COLUMNS}
              tone="sub"
              label={doc.customerWht.expectedLabel}
              value={doc.customerWht.expectedText}
            />
          </>
        )}
        <PaymentChannelRow text={doc.paymentChannelText} />
        <AmountInWordsRow words={doc.totalInWordsText} />
      </DocTable>

      <NoteText>{doc.footnote}</NoteText>
      <TemplateFooterNote text={template.footerNote} />
      <TemplateSignatures roles={doc.signers} template={template} />
    </DocPage>
  )
}

export function BillingInvoicePDF({
  doc,
  letterhead,
  template = NO_DOC_TEMPLATE,
}: {
  doc: BillingInvoiceDoc
  letterhead: DocLetterhead
  /** ข้อความท้าย + รูปลายเซ็น (มติ PO U122) — จาก snapshot ตอนส่งรอบ · ไม่ส่ง = ไม่พิมพ์ */
  template?: DocTemplateRender
}): React.JSX.Element {
  return (
    <Document title={`${doc.title} ${doc.documentNumber}`} author={doc.seller.name}>
      {ORIGINAL_AND_COPY.map((copy) => (
        <BillingInvoiceCopy key={copy} doc={doc} letterhead={letterhead} template={template} copy={copy} />
      ))}
    </Document>
  )
}

export async function renderBillingInvoice(
  doc: BillingInvoiceDoc,
  letterhead: DocLetterhead,
  template: DocTemplateRender = NO_DOC_TEMPLATE,
): Promise<Buffer> {
  ensureThaiFont()
  return renderToBuffer(<BillingInvoicePDF doc={doc} letterhead={letterhead} template={template} />)
}
