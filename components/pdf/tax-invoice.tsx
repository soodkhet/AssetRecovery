import { Document, Page, Text, View, renderToBuffer } from '@react-pdf/renderer'
import {
  MetaRow,
  OfficialFooter,
  OfficialHeader,
  PartyBox,
  officialStyles,
} from '@/components/pdf/official-doc'
import { ensureThaiFont } from '@/components/pdf/thai-font'
import type { TaxInvoiceDoc } from '@/lib/sales/sales'

/**
 * **ใบกำกับภาษีแบบเต็มรูป** (`28` §6.2 · ไฟล์ 31 §6.2) — เลย์เอาต์เทียบ
 * `reference/samples/01_tax_invoice.pdf`
 *
 * ฟิลด์บังคับตามกฎหมายครบ 7 ข้อบนหน้ากระดาษนี้:
 *  1. คำว่า "ใบกำกับภาษี" เด่นชัด (หัวเอกสาร)
 *  2. ชื่อ/ที่อยู่/เลขผู้เสียภาษีของผู้ขาย  3. ของผู้ซื้อ (กล่องคู่สัญญา)
 *  4. เลขที่ใบกำกับภาษี  5. วันเดือนปีที่ออก (กล่องข้อมูลเอกสาร)
 *  6. รายการ/ปริมาณ/มูลค่าบริการ (ตาราง)
 *  7. จำนวน VAT **แยกบรรทัดออกจากมูลค่าบริการ** (ท้ายตาราง)
 *
 * ⚠️ ความครบถ้วนของ 2–3 และยอดตาม 6–7 ถูกบังคับตั้งแต่ตอนออกเอกสารด้วย
 *    `assertTaxInvoiceFieldsComplete()` (`TAX_INVOICE_FIELD_MISSING`) — ที่นี่แค่พิมพ์
 * ⚠️ ใบที่ยกเลิกแล้วต้องพิมพ์ได้ (เก็บเป็นหลักฐาน) แต่ต้องขึ้นแถบ "ยกเลิก" เสมอ (`31` §9.1)
 */

const COLUMNS = ['46%', '10%', '20%', '24%'] as const

export function TaxInvoicePDF({ doc }: { doc: TaxInvoiceDoc }): React.JSX.Element {
  return (
    <Document title={`${doc.title} ${doc.invoiceNumber}`} author={doc.seller.name}>
      <Page size="A4" style={officialStyles.page}>
        <OfficialHeader title={doc.title} titleEn={doc.titleEn} copyLabel="ต้นฉบับ / ORIGINAL" />

        {doc.cancelNote === null ? null : (
          <View style={officialStyles.cancelBanner}>
            <Text style={officialStyles.cancelText}>เอกสารนี้ถูกยกเลิก — {doc.cancelNote}</Text>
          </View>
        )}

        <View style={officialStyles.partyRow}>
          <PartyBox role="ผู้ขาย / SELLER" party={doc.seller} />
          <PartyBox role="ผู้ซื้อ / BUYER" party={doc.buyer} />
        </View>

        <View style={officialStyles.metaBox}>
          <MetaRow label="เลขที่ใบกำกับภาษี" value={doc.invoiceNumber} />
          <MetaRow label="วันที่ออกเอกสาร" value={doc.invoiceDateLabel} />
          <MetaRow label="รอบบัญชี" value={doc.periodLabel} />
          <MetaRow label="รูปแบบการส่งเอกสาร" value={doc.deliveryFormatLabel} />
        </View>

        <View style={officialStyles.table}>
          <View style={officialStyles.tableHeader} fixed>
            <Text style={[officialStyles.th, { width: COLUMNS[0] }]}>รายการสินค้า/บริการ</Text>
            <Text style={[officialStyles.th, officialStyles.center, { width: COLUMNS[1] }]}>จำนวน</Text>
            <Text style={[officialStyles.th, officialStyles.amount, { width: COLUMNS[2] }]}>ราคาต่อหน่วย (บาท)</Text>
            <Text style={[officialStyles.th, officialStyles.amount, { width: COLUMNS[3] }]}>จำนวนเงิน (บาท)</Text>
          </View>

          <View style={officialStyles.tableRow} wrap={false}>
            <Text style={[officialStyles.td, { width: COLUMNS[0] }]}>{doc.description}</Text>
            <Text style={[officialStyles.td, officialStyles.center, { width: COLUMNS[1] }]}>{doc.quantityText}</Text>
            <Text style={[officialStyles.td, officialStyles.amount, { width: COLUMNS[2] }]}>{doc.unitPriceText}</Text>
            <Text style={[officialStyles.td, officialStyles.amount, { width: COLUMNS[3] }]}>
              {doc.amountBeforeVatText}
            </Text>
          </View>

          <View style={officialStyles.summaryRow}>
            <Text style={officialStyles.summaryLabel}>มูลค่าสินค้า/บริการ</Text>
            <Text style={officialStyles.summaryValue}>{doc.amountBeforeVatText}</Text>
          </View>
          <View style={officialStyles.summaryRow}>
            <Text style={officialStyles.summaryLabel}>{doc.vatLabel}</Text>
            <Text style={officialStyles.summaryValue}>{doc.vatText}</Text>
          </View>
          <View style={officialStyles.summaryRow}>
            <Text style={officialStyles.summaryLabel}>จำนวนเงินรวมทั้งสิ้น</Text>
            <Text style={officialStyles.summaryValueBold}>{doc.totalText}</Text>
          </View>
        </View>

        <View style={officialStyles.wordsBox}>
          <Text style={officialStyles.wordsText}>({doc.totalInWordsText})</Text>
        </View>

        <Text style={officialStyles.noteText}>
          เอกสารออกโดยระบบ AssetRecovery — เลขที่ใบกำกับภาษีเดินอัตโนมัติเรียงต่อเนื่องตามข้อกำหนดของกรมสรรพากร
          ใบที่ยกเลิกจะไม่ถูกนำเลขที่กลับมาใช้ซ้ำ
        </Text>

        <View style={officialStyles.signRow}>
          <View style={officialStyles.signBox}>
            <Text style={officialStyles.signLine}>............................................................</Text>
            <Text style={officialStyles.signLabel}>ผู้รับเอกสาร / ผู้ซื้อ</Text>
          </View>
          <View style={officialStyles.signBox}>
            <Text style={officialStyles.signLine}>............................................................</Text>
            <Text style={officialStyles.signLabel}>ผู้มีอำนาจลงนาม / ผู้ขาย</Text>
          </View>
        </View>

        <OfficialFooter left={`${doc.title} ${doc.invoiceNumber}`} right={doc.seller.name} />
      </Page>
    </Document>
  )
}

export async function renderTaxInvoice(doc: TaxInvoiceDoc): Promise<Buffer> {
  ensureThaiFont()
  return renderToBuffer(<TaxInvoicePDF doc={doc} />)
}
