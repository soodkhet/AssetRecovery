import { Document, Page, StyleSheet, View, renderToBuffer } from '@react-pdf/renderer'
import { Text } from '@/components/pdf/text'
import { OfficialFooter, officialStyles } from '@/components/pdf/official-doc'
import { ensureThaiFont } from '@/components/pdf/thai-font'
import type {
  WhtCertificateBox,
  WhtCertificateCopy,
  WhtCertificateDoc,
  WhtCertificateParty,
} from '@/lib/wht/wht'

/**
 * **หนังสือรับรองการหักภาษี ณ ที่จ่าย (ใบ 50 ทวิ)** ตามแบบทางการของกรมสรรพากร (มติ PO 06/10/2569 UAT U96 #13 ·
 * `28` §6.3 · ไฟล์ 33 §6.3)
 *
 * - **2 ฉบับในไฟล์เดียว** (1 หน้า/ฉบับ): ฉบับที่ 1 ผู้ถูกหักแนบพร้อมแบบแสดงรายการ · ฉบับที่ 2 เก็บเป็นหลักฐาน
 * - ผู้มีหน้าที่หัก / ผู้ถูกหัก: ชื่อ (รวมคำนำหน้า) · เลขประจำตัวผู้เสียภาษี · สาขา (นิติบุคคล) · ที่อยู่ — จาก snapshot ของใบ
 * - ลำดับที่ในแบบ + ช่องแบบ ภ.ง.ด. 7 ช่อง (ติ๊กตามแบบที่ยื่นจริง)
 * - ตารางประเภทเงินได้ 6 แถวตามแบบ — ยอดลงเฉพาะแถวของเงินได้นั้น · รวม · จำนวนภาษีเป็นตัวอักษร
 * - ช่องเงินสมทบ กบข./ประกันสังคม/กองทุนสำรองเลี้ยงชีพ (ระบบไม่มีข้อมูล — พิมพ์ช่องว่างให้กรอกมือ)
 * - ผู้จ่ายเงิน: เงื่อนไขการหัก (1)–(4) · วันเดือนปีที่ออก (พ.ศ.) · ลายมือชื่อผู้มีหน้าที่หัก
 *
 * ⚠️ ใบที่ยกเลิกแล้วยังพิมพ์ได้ (เก็บเป็นหลักฐาน) แต่ต้องขึ้นแถบ "ยกเลิก" ทุกฉบับ (`33` §10)
 * ⚠️ ทุกค่าที่รับเข้ามาเป็นข้อความที่ประกอบเสร็จแล้ว — ห้ามคำนวณ/ฟอร์แมตซ้ำที่นี่ (Rule 01)
 * ⚠️ ห้ามพิมพ์เลขอ้างอิงสเปคบนเอกสาร (มติ PO 03/10/2569)
 */

const BORDER = '#475569'

const styles = StyleSheet.create({
  page: { ...officialStyles.page, fontSize: 8.5, paddingTop: 26, paddingBottom: 44 },
  copyRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 2 },
  copyText: { fontSize: 8, color: '#334155', textAlign: 'right' },
  copyLabel: { fontSize: 9, fontWeight: 700 },
  head: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 6 },
  headTitle: { flex: 1, alignItems: 'center' },
  title: { fontSize: 16, fontWeight: 700 },
  legal: { fontSize: 9, color: '#334155' },
  numberBox: { width: 140, alignItems: 'flex-end' },
  numberText: { fontSize: 8.5 },
  numberValue: { fontSize: 9.5, fontWeight: 700 },
  box: { borderWidth: 1, borderColor: BORDER, padding: 6, marginBottom: 5 },
  boxRole: { fontSize: 8.5, fontWeight: 700, marginBottom: 2 },
  line: { flexDirection: 'row', marginBottom: 1.5 },
  lineLabel: { fontSize: 8, color: '#475569', width: 150 },
  lineValue: { fontSize: 8.5, flex: 1 },
  lineValueBold: { fontSize: 9, fontWeight: 700, flex: 1 },
  formRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 3 },
  seq: { fontSize: 8.5, marginRight: 10 },
  seqValue: { fontSize: 9, fontWeight: 700 },
  check: { flexDirection: 'row', alignItems: 'center', marginRight: 9, marginBottom: 2 },
  checkBox: {
    width: 8,
    height: 8,
    borderWidth: 0.8,
    borderColor: BORDER,
    marginRight: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** เครื่องหมายในช่องที่เลือก — วาดเป็นสี่เหลี่ยมทึบ (ตัวอักษรขนาดเล็กในกล่อง 8pt ถูกตัดทิ้งตอนเรนเดอร์) */
  checkMark: { width: 4.5, height: 4.5, backgroundColor: '#0f172a' },
  checkLabel: { fontSize: 8 },
  table: { borderWidth: 1, borderColor: BORDER },
  tr: { flexDirection: 'row', borderBottomWidth: 0.6, borderColor: '#cbd5e1' },
  th: {
    fontSize: 8,
    fontWeight: 700,
    paddingHorizontal: 4,
    paddingVertical: 4,
    textAlign: 'center',
    backgroundColor: '#f1f5f9',
  },
  td: { fontSize: 8, paddingHorizontal: 4, paddingVertical: 3 },
  tdDetail: { fontSize: 8, fontWeight: 700, paddingHorizontal: 4, paddingTop: 1 },
  amount: { textAlign: 'right' },
  center: { textAlign: 'center' },
  totalRow: { flexDirection: 'row', borderTopWidth: 1, borderColor: BORDER },
  totalLabel: { fontSize: 8.5, fontWeight: 700, paddingHorizontal: 4, paddingVertical: 4, textAlign: 'right' },
  wordsRow: { flexDirection: 'row', borderTopWidth: 1, borderColor: BORDER, padding: 4 },
  wordsLabel: { fontSize: 8.5, fontWeight: 700, marginRight: 6 },
  wordsValue: { fontSize: 9, fontWeight: 700, flex: 1, textAlign: 'center' },
  fundRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 5 },
  fundText: { fontSize: 8, marginRight: 10 },
  noteText: { fontSize: 8, color: '#334155', marginTop: 3 },
  bottom: { flexDirection: 'row', marginTop: 6, gap: 8 },
  warnBox: { flex: 1, borderWidth: 1, borderColor: BORDER, padding: 6 },
  warnText: { fontSize: 7.5, lineHeight: 1.4 },
  signBox: { flex: 1.3, borderWidth: 1, borderColor: BORDER, padding: 6, alignItems: 'center' },
  signText: { fontSize: 8, textAlign: 'center' },
  signLine: { fontSize: 9, color: '#64748b', marginTop: 16 },
  signLabel: { fontSize: 8.5, marginTop: 2 },
  signDate: { fontSize: 8.5, marginTop: 6 },
  stamp: { fontSize: 7, color: '#64748b', marginTop: 4 },
})

/** สัดส่วนคอลัมน์ของตารางเงินได้: ประเภท | วันที่จ่าย | จำนวนเงินที่จ่าย | ภาษีที่หักและนำส่งไว้ */
const COLUMNS = ['52%', '16%', '16%', '16%'] as const

function CheckItem({ box }: { box: WhtCertificateBox }): React.JSX.Element {
  return (
    <View style={styles.check}>
      <View style={styles.checkBox}>{box.checked ? <View style={styles.checkMark} /> : null}</View>
      <Text style={styles.checkLabel}>{box.label}</Text>
    </View>
  )
}

function PartySection({
  role,
  party,
  showBranch,
}: {
  role: string
  party: WhtCertificateParty
  showBranch: boolean
}): React.JSX.Element {
  return (
    <View style={styles.box}>
      <Text style={styles.boxRole}>{role}</Text>
      <View style={styles.line}>
        <Text style={styles.lineLabel}>ชื่อ</Text>
        <Text style={styles.lineValueBold}>{party.name}</Text>
      </View>
      <View style={styles.line}>
        <Text style={styles.lineLabel}>เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)</Text>
        <Text style={styles.lineValueBold}>{party.taxId}</Text>
      </View>
      {showBranch && party.branchLabel !== null ? (
        <View style={styles.line}>
          <Text style={styles.lineLabel}>สาขา</Text>
          <Text style={styles.lineValue}>{party.branchLabel}</Text>
        </View>
      ) : null}
      <View style={styles.line}>
        <Text style={styles.lineLabel}>ที่อยู่</Text>
        <Text style={styles.lineValue}>{party.address}</Text>
      </View>
    </View>
  )
}

function CertificatePage({ doc, copy }: { doc: WhtCertificateDoc; copy: WhtCertificateCopy }): React.JSX.Element {
  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.copyRow}>
        <Text style={styles.copyText}>
          <Text style={styles.copyLabel}>{copy.label}</Text> {copy.purpose}
        </Text>
      </View>

      <View style={styles.head}>
        <View style={styles.numberBox} />
        <View style={styles.headTitle}>
          <Text style={styles.title}>{doc.title}</Text>
          <Text style={styles.legal}>{doc.legalNote}</Text>
        </View>
        <View style={styles.numberBox}>
          <Text style={styles.numberText}>เลขที่</Text>
          <Text style={styles.numberValue}>{doc.certificateNumber}</Text>
        </View>
      </View>

      {doc.cancelNote === null ? null : (
        <View style={officialStyles.cancelBanner}>
          <Text style={officialStyles.cancelText}>เอกสารนี้ถูกยกเลิก — {doc.cancelNote}</Text>
        </View>
      )}

      <PartySection role="ผู้มีหน้าที่หักภาษี ณ ที่จ่าย :" party={doc.payer} showBranch />
      <PartySection role="ผู้ถูกหักภาษี ณ ที่จ่าย :" party={doc.payee} showBranch />

      <View style={styles.formRow}>
        <Text style={styles.seq}>
          ลำดับที่ <Text style={styles.seqValue}>{doc.filingSequenceText}</Text> ในแบบ
        </Text>
        {doc.filingBoxes.map((box) => (
          <CheckItem key={box.label} box={box} />
        ))}
      </View>

      <View style={[styles.table, { marginTop: 5 }]}>
        <View style={[styles.tr, { borderBottomWidth: 1, borderColor: BORDER }]} fixed>
          <Text style={[styles.th, { width: COLUMNS[0] }]}>ประเภทเงินได้พึงประเมินที่จ่าย</Text>
          <Text style={[styles.th, { width: COLUMNS[1] }]}>วัน เดือน หรือปีภาษี ที่จ่าย</Text>
          <Text style={[styles.th, { width: COLUMNS[2] }]}>จำนวนเงินที่จ่าย</Text>
          <Text style={[styles.th, { width: COLUMNS[3] }]}>ภาษีที่หักและนำส่งไว้</Text>
        </View>

        {doc.incomeLines.map((line) => (
          <View key={line.no} style={styles.tr} wrap={false}>
            <View style={{ width: COLUMNS[0] }}>
              <Text style={styles.td}>
                {line.no}. {line.label}
              </Text>
              {line.detail === null ? null : <Text style={styles.tdDetail}>— {line.detail}</Text>}
            </View>
            <Text style={[styles.td, styles.center, { width: COLUMNS[1] }]}>{line.dateText}</Text>
            <Text style={[styles.td, styles.amount, { width: COLUMNS[2] }]}>{line.grossText}</Text>
            <Text style={[styles.td, styles.amount, { width: COLUMNS[3] }]}>{line.whtText}</Text>
          </View>
        ))}

        <View style={styles.totalRow}>
          <Text style={[styles.totalLabel, { width: '68%' }]}>รวมเงินที่จ่ายและภาษีที่หักนำส่ง</Text>
          <Text style={[styles.totalLabel, { width: COLUMNS[2] }]}>{doc.grossText}</Text>
          <Text style={[styles.totalLabel, { width: COLUMNS[3] }]}>{doc.whtText}</Text>
        </View>
        <View style={styles.wordsRow}>
          <Text style={styles.wordsLabel}>รวมเงินภาษีที่หักนำส่ง (ตัวอักษร)</Text>
          <Text style={styles.wordsValue}>{doc.whtInWordsText}</Text>
        </View>
      </View>

      <View style={styles.fundRow}>
        <Text style={styles.fundText}>เงินที่จ่ายเข้า กบข./กสจ./กองทุนสงเคราะห์ครูโรงเรียนเอกชน ........................ บาท</Text>
        <Text style={styles.fundText}>กองทุนประกันสังคม ........................ บาท</Text>
        <Text style={styles.fundText}>กองทุนสำรองเลี้ยงชีพ ........................ บาท</Text>
      </View>

      <View style={styles.formRow}>
        <Text style={[styles.seq, { fontWeight: 700 }]}>ผู้จ่ายเงิน</Text>
        {doc.conditionBoxes.map((box) => (
          <CheckItem key={box.label} box={box} />
        ))}
      </View>

      {doc.replacesNote === null ? null : <Text style={styles.noteText}>หมายเหตุ: {doc.replacesNote}</Text>}
      {doc.coverageNote === null ? null : <Text style={styles.noteText}>หมายเหตุ: {doc.coverageNote}</Text>}

      <View style={styles.bottom}>
        <View style={styles.warnBox}>
          <Text style={[styles.warnText, { fontWeight: 700 }]}>คำเตือน</Text>
          <Text style={styles.warnText}>
            ผู้มีหน้าที่ออกหนังสือรับรองการหักภาษี ณ ที่จ่าย ฝ่าฝืนไม่ปฏิบัติตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร
            ต้องรับโทษทางอาญาตามมาตรา 35 แห่งประมวลรัษฎากร
          </Text>
        </View>
        <View style={styles.signBox}>
          <Text style={styles.signText}>ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ</Text>
          <Text style={styles.signLine}>ลงชื่อ ............................................................ ผู้จ่ายเงิน</Text>
          <Text style={styles.signLabel}>(ผู้มีหน้าที่หักภาษี ณ ที่จ่าย)</Text>
          <Text style={styles.signDate}>วัน เดือน ปี ที่ออกหนังสือรับรองฯ {doc.issueDateLabel}</Text>
          <Text style={styles.stamp}>ประทับตรานิติบุคคล (ถ้ามี)</Text>
        </View>
      </View>

      <OfficialFooter left={`${doc.title} ${doc.certificateNumber} · ${copy.label}`} right={doc.payer.name} />
    </Page>
  )
}

export function WhtCertificatePDF({ doc }: { doc: WhtCertificateDoc }): React.JSX.Element {
  return (
    <Document title={`${doc.title} ${doc.certificateNumber}`} author={doc.payer.name}>
      {doc.copies.map((copy) => (
        <CertificatePage key={copy.label} doc={doc} copy={copy} />
      ))}
    </Document>
  )
}

export async function renderWhtCertificate(doc: WhtCertificateDoc): Promise<Buffer> {
  ensureThaiFont()
  return renderToBuffer(<WhtCertificatePDF doc={doc} />)
}
