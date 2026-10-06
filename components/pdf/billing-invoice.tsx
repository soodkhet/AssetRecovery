import { Document, Page, View, renderToBuffer } from '@react-pdf/renderer'
import { Text } from '@/components/pdf/text'
import { MetaRow, OfficialFooter, OfficialHeader, PartyBox, officialStyles } from '@/components/pdf/official-doc'
import { ensureThaiFont } from '@/components/pdf/thai-font'
import type { DocLetterhead } from '@/lib/organization/profile'
import type { BillingInvoiceDoc } from '@/lib/revenue/billing-invoice'

/**
 * **ใบแจ้งหนี้/ใบวางบิล** (มติ PO U95 · U96 #12) — ออกตอนส่งรอบวางบิล · **ไม่ใช่ใบกำกับภาษี**
 * (ข้อความกำกับพิมพ์เด่นใต้หัวเอกสาร) · VAT เป็นยอดประมาณการ ณ วันวางบิล
 * · เลย์เอาต์ชุดเดียวกับใบกำกับภาษี (`official-doc`) — ยอด/ข้อความประกอบเสร็จแล้วที่ `buildBillingInvoiceDoc()`
 */

const COLUMNS = ['8%', '44%', '22%', '26%'] as const

export function BillingInvoicePDF({ doc, letterhead }: { doc: BillingInvoiceDoc; letterhead: DocLetterhead }): React.JSX.Element {
  return (
    <Document title={`${doc.title} ${doc.documentNumber}`} author={doc.seller.name}>
      <Page size="A4" style={officialStyles.page}>
        <OfficialHeader letterhead={letterhead} title={doc.title} titleEn={doc.titleEn} copyLabel="ต้นฉบับ / ORIGINAL" />

        <View style={officialStyles.cancelBanner}>
          <Text style={officialStyles.cancelText}>{doc.notTaxInvoiceNote}</Text>
        </View>

        <View style={officialStyles.partyRow}>
          {/* ผู้ให้บริการพิมพ์ที่หัวเอกสาร (snapshot ตอนส่งรอบ — มติ PO U99) ⇒ กล่องคู่สัญญาเหลือลูกค้า */}
          <PartyBox role="ลูกค้า / CUSTOMER" party={doc.buyer} />
        </View>

        <View style={officialStyles.metaBox}>
          <MetaRow label="เลขที่ใบแจ้งหนี้" value={doc.documentNumber} />
          <MetaRow label="วันที่วางบิล" value={doc.issueDateLabel} />
          <MetaRow label="ครบกำหนดชำระ" value={doc.dueDateLabel} />
          <MetaRow label="รอบบริการ" value={doc.periodLabel} />
        </View>

        <View style={officialStyles.table}>
          <View style={officialStyles.tableHeader} fixed>
            <Text style={[officialStyles.th, officialStyles.center, { width: COLUMNS[0] }]}>ลำดับ</Text>
            <Text style={[officialStyles.th, { width: COLUMNS[1] }]}>{doc.description} — เลขอ้างอิงเคส</Text>
            <Text style={[officialStyles.th, officialStyles.center, { width: COLUMNS[2] }]}>วันที่รับรู้รายได้</Text>
            <Text style={[officialStyles.th, officialStyles.amount, { width: COLUMNS[3] }]}>ก่อน VAT (บาท)</Text>
          </View>

          {doc.lines.map((line) => (
            <View key={line.no} style={officialStyles.tableRow} wrap={false}>
              <Text style={[officialStyles.td, officialStyles.center, { width: COLUMNS[0] }]}>{line.no}</Text>
              <Text style={[officialStyles.td, { width: COLUMNS[1] }]}>{line.caseRef}</Text>
              <Text style={[officialStyles.td, officialStyles.center, { width: COLUMNS[2] }]}>{line.revenueDateLabel}</Text>
              <Text style={[officialStyles.td, officialStyles.amount, { width: COLUMNS[3] }]}>{line.beforeVatText}</Text>
            </View>
          ))}

          <View style={officialStyles.summaryRow}>
            <Text style={officialStyles.summaryLabel}>มูลค่าบริการก่อนภาษี</Text>
            <Text style={officialStyles.summaryValue}>{doc.amountBeforeVatText}</Text>
          </View>
          <View style={officialStyles.summaryRow}>
            <Text style={officialStyles.summaryLabel}>{doc.vatLabel}</Text>
            <Text style={officialStyles.summaryValue}>{doc.vatText}</Text>
          </View>
          <View style={officialStyles.summaryRow}>
            <Text style={officialStyles.summaryLabel}>จำนวนเงินที่ต้องชำระ</Text>
            <Text style={officialStyles.summaryValueBold}>{doc.totalText}</Text>
          </View>
        </View>

        <View style={officialStyles.wordsBox}>
          <Text style={officialStyles.wordsText}>({doc.totalInWordsText})</Text>
        </View>

        <Text style={officialStyles.noteText}>
          {doc.notTaxInvoiceNote} · ภาษีมูลค่าเพิ่มบนเอกสารนี้เป็นยอดประมาณการ ณ วันวางบิล
          ยอดภาษีจริงเป็นไปตามใบเสร็จรับเงิน/ใบกำกับภาษีที่ออก ณ วันรับชำระ
        </Text>

        <View style={officialStyles.signRow}>
          <View style={officialStyles.signBox}>
            <Text style={officialStyles.signLine}>............................................................</Text>
            <Text style={officialStyles.signLabel}>ผู้รับวางบิล / ลูกค้า</Text>
          </View>
          <View style={officialStyles.signBox}>
            <Text style={officialStyles.signLine}>............................................................</Text>
            <Text style={officialStyles.signLabel}>ผู้วางบิล / ผู้ให้บริการ</Text>
          </View>
        </View>

        <OfficialFooter left={`${doc.title} ${doc.documentNumber}`} right={doc.seller.name} />
      </Page>
    </Document>
  )
}

export async function renderBillingInvoice(doc: BillingInvoiceDoc, letterhead: DocLetterhead): Promise<Buffer> {
  ensureThaiFont()
  return renderToBuffer(<BillingInvoicePDF doc={doc} letterhead={letterhead} />)
}
