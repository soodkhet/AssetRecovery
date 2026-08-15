import { Document, Page, Text, View, renderToBuffer } from '@react-pdf/renderer'
import { MetaRow, OfficialFooter, OfficialHeader, PartyBox, officialStyles } from '@/components/pdf/official-doc'
import { ensureThaiFont } from '@/components/pdf/thai-font'
import type { WhtCertificateDoc } from '@/lib/wht/wht'

/**
 * **หนังสือรับรองการหักภาษี ณ ที่จ่าย (ใบ 50 ทวิ)** (`28` §6.3 · ไฟล์ 33 §6.3) — เลย์เอาต์เทียบ
 * `reference/samples/02_wht_certificate.pdf`
 *
 * ฟิลด์บังคับตามกฎหมายครบ 6 ข้อของ `28` §6.3 บนหน้ากระดาษนี้:
 *  1. ชื่อ/ที่อยู่/เลขประจำตัวผู้เสียภาษีของ**ผู้จ่ายเงิน** (กล่องคู่สัญญาซ้าย)
 *  2. ชื่อ/ที่อยู่/เลขประจำตัวผู้เสียภาษี (หรือเลขบัตรประชาชน) ของ**ผู้ถูกหักภาษี** (กล่องขวา)
 *  3. ลำดับที่ของหนังสือรับรอง (กล่องข้อมูลเอกสาร)
 *  4. ประเภทเงินได้พึงประเมินที่จ่าย ระบุมาตรา (ตาราง)
 *  5. จำนวนเงินที่จ่าย + จำนวนภาษีที่หักไว้ (ตาราง — **แยกบรรทัดกัน**)
 *  6. วัน เดือน ปี ที่จ่ายเงิน (ตาราง + กล่องข้อมูลเอกสาร)
 *
 * ⚠️ ต่อยอด `official-doc.tsx` (ชุดเดียวกับใบกำกับภาษี) — **ห้ามใช้ `internal-doc.tsx`** เพราะ
 *    เอกสารกลุ่มนี้มีข้อกำหนดทางกฎหมาย ปิด/ซ่อนฟิลด์ไม่ได้ (`28` §17)
 * ⚠️ ใบที่ยกเลิกแล้วยังพิมพ์ได้ (เก็บเป็นหลักฐาน) แต่ต้องขึ้นแถบ "ยกเลิก" เสมอ (`33` §10)
 * ⚠️ ทุกค่าที่รับเข้ามาเป็นข้อความที่ประกอบเสร็จแล้ว — ห้ามคำนวณ/ฟอร์แมตซ้ำที่นี่ (Rule 01)
 */

const COLUMNS = ['44%', '18%', '19%', '19%'] as const

export function WhtCertificatePDF({ doc }: { doc: WhtCertificateDoc }): React.JSX.Element {
  return (
    <Document title={`${doc.title} ${doc.certificateNumber}`} author={doc.payer.name}>
      <Page size="A4" style={officialStyles.page}>
        <OfficialHeader title={doc.title} titleEn={doc.titleEn} copyLabel={`${doc.legalNote} — ต้นฉบับ / ORIGINAL`} />

        {doc.cancelNote === null ? null : (
          <View style={officialStyles.cancelBanner}>
            <Text style={officialStyles.cancelText}>เอกสารนี้ถูกยกเลิก — {doc.cancelNote}</Text>
          </View>
        )}

        <View style={officialStyles.partyRow}>
          <PartyBox role="ผู้จ่ายเงิน / PAYER" party={doc.payer} />
          <PartyBox role="ผู้ถูกหักภาษี ณ ที่จ่าย / PAYEE" party={doc.payee} />
        </View>

        <View style={officialStyles.metaBox}>
          <MetaRow label="ลำดับที่หนังสือรับรอง" value={doc.certificateNumber} />
          <MetaRow label="วันเดือนปีที่จ่ายเงิน" value={doc.paymentDateLabel} />
          <MetaRow label="แบบที่ยื่นรายการ" value={doc.filingFormLabel} />
          <MetaRow label="รูปแบบการส่งเอกสาร" value={doc.deliveryFormatLabel} />
          {doc.replacesNote === null ? null : <MetaRow label="หมายเหตุ" value={doc.replacesNote} />}
        </View>

        <View style={officialStyles.table}>
          <View style={officialStyles.tableHeader} fixed>
            <Text style={[officialStyles.th, { width: COLUMNS[0] }]}>ประเภทเงินได้พึงประเมินที่จ่าย</Text>
            <Text style={[officialStyles.th, officialStyles.center, { width: COLUMNS[1] }]}>วันเดือนปีที่จ่าย</Text>
            <Text style={[officialStyles.th, officialStyles.amount, { width: COLUMNS[2] }]}>จำนวนเงินที่จ่าย (บาท)</Text>
            <Text style={[officialStyles.th, officialStyles.amount, { width: COLUMNS[3] }]}>ภาษีที่หักไว้ (บาท)</Text>
          </View>

          <View style={officialStyles.tableRow} wrap={false}>
            <Text style={[officialStyles.td, { width: COLUMNS[0] }]}>{doc.incomeType}</Text>
            <Text style={[officialStyles.td, officialStyles.center, { width: COLUMNS[1] }]}>
              {doc.paymentDateLabel}
            </Text>
            <Text style={[officialStyles.td, officialStyles.amount, { width: COLUMNS[2] }]}>{doc.grossText}</Text>
            <Text style={[officialStyles.td, officialStyles.amount, { width: COLUMNS[3] }]}>{doc.whtText}</Text>
          </View>

          <View style={officialStyles.summaryRow}>
            <Text style={officialStyles.summaryLabel}>รวมเงินที่จ่าย</Text>
            <Text style={officialStyles.summaryValue}>{doc.grossText}</Text>
          </View>
          <View style={officialStyles.summaryRow}>
            <Text style={officialStyles.summaryLabel}>รวมภาษีที่หักและนำส่ง</Text>
            <Text style={officialStyles.summaryValueBold}>{doc.whtText}</Text>
          </View>
          <View style={officialStyles.summaryRow}>
            <Text style={officialStyles.summaryLabel}>คงเหลือจ่ายสุทธิ</Text>
            <Text style={officialStyles.summaryValue}>{doc.netText}</Text>
          </View>
        </View>

        <View style={officialStyles.wordsBox}>
          <Text style={officialStyles.wordsText}>ภาษีที่หักและนำส่ง ({doc.whtInWordsText})</Text>
        </View>

        <Text style={officialStyles.noteText}>
          ผู้จ่ายเงินขอรับรองว่าข้อความและตัวเลขข้างต้นถูกต้องตรงกับความจริง และได้นำส่งภาษีที่หักไว้ต่อกรมสรรพากร
          ตามแบบ {doc.filingForm === 'PND3' ? 'ภ.ง.ด.3' : 'ภ.ง.ด.53'} ของเดือนที่จ่ายเงิน — เอกสารออกโดยระบบ
          AssetRecovery เลขที่หนังสือรับรองเดินอัตโนมัติเรียงต่อเนื่อง ใบที่ยกเลิกจะไม่ถูกนำเลขที่กลับมาใช้ซ้ำ
        </Text>

        <View style={officialStyles.signRow}>
          <View style={officialStyles.signBox}>
            <Text style={officialStyles.signLine}>............................................................</Text>
            <Text style={officialStyles.signLabel}>ผู้ถูกหักภาษี ณ ที่จ่าย (ผู้รับเอกสาร)</Text>
          </View>
          <View style={officialStyles.signBox}>
            <Text style={officialStyles.signLine}>............................................................</Text>
            <Text style={officialStyles.signLabel}>ผู้มีอำนาจลงนาม (ผู้จ่ายเงิน)</Text>
          </View>
        </View>

        <OfficialFooter left={`${doc.title} ${doc.certificateNumber}`} right={doc.payer.name} />
      </Page>
    </Document>
  )
}

export async function renderWhtCertificate(doc: WhtCertificateDoc): Promise<Buffer> {
  ensureThaiFont()
  return renderToBuffer(<WhtCertificatePDF doc={doc} />)
}
