import { Document, Page, Text, View, renderToBuffer } from '@react-pdf/renderer'
import { DocFooter, DocHeader, MetaCell, SignatureRow, docStyles } from '@/components/pdf/internal-doc'
import { ensureThaiFont } from '@/components/pdf/thai-font'
import type { PackCoverDoc } from '@/lib/exports/pack'

/**
 * **หน้าปกชุดเอกสารบัญชี (Accounting Pack Cover Sheet)** — ไฟล์แรกใน `.zip` ของไฟล์ 37
 * เลย์เอาต์เทียบ `reference/samples/07_accounting_pack_cover.pdf`: หัวกระดาษ → ข้อมูลรอบ/เวอร์ชัน/
 * ผู้จัดทำ/SHA-256 → ตาราง Readiness Check → ตารางรายชื่อไฟล์ในชุด → ช่องลายมือชื่อ 2 ช่อง
 *
 * ⚠️ เป็น **เอกสารภายใน** (`28` §6.1) — ไม่ใช่เอกสารทางภาษี
 * ⚠️ ข้อความทุกช่องประกอบมาแล้วจาก `buildPackCoverDoc()` (pure) — component นี้ห้าม format เอง (Rule 01)
 */

const CHECK_COLUMNS = ['76%', '24%'] as const
const FILE_COLUMNS = ['34%', '66%'] as const

export function PackCover({ doc }: { doc: PackCoverDoc }): React.JSX.Element {
  return (
    <Document title={`${doc.title} ${doc.periodLabel} ${doc.versionLabel}`} author={doc.organizationName}>
      <Page size="A4" style={docStyles.page}>
        <DocHeader headerNote={doc.headerNote} title={doc.title} titleEn={doc.titleEn} />

        <View style={docStyles.metaGrid}>
          <MetaCell label="รอบบัญชี" value={doc.periodLabel} />
          <MetaCell label="เวอร์ชัน Export" value={doc.versionLabel} />
          <MetaCell label="จัดทำโดย" value={doc.generatedByName} />
          <MetaCell label="วันที่จัดทำ" value={doc.generatedAtLabel} />
        </View>
        <Text style={[docStyles.metaText, { marginBottom: 14 }]}>
          <Text style={docStyles.metaLabel}>SHA-256 (ไฟล์ข้อมูล 01–08): </Text>
          {doc.contentDigest}
        </Text>

        <Text style={[docStyles.metaText, { fontWeight: 700, marginBottom: 4 }]}>Readiness Check</Text>
        <View style={docStyles.table}>
          <View style={docStyles.tableHeader}>
            <Text style={[docStyles.th, { width: CHECK_COLUMNS[0] }]}>เงื่อนไข</Text>
            <Text style={[docStyles.th, { width: CHECK_COLUMNS[1] }]}>สถานะ</Text>
          </View>
          {doc.checks.map((check) => (
            <View key={check.label} style={docStyles.tableRow} wrap={false}>
              <Text style={[docStyles.td, { width: CHECK_COLUMNS[0] }]}>{check.label}</Text>
              <Text style={[docStyles.td, { width: CHECK_COLUMNS[1] }]}>{check.passed ? 'ผ่าน' : 'ไม่ผ่าน'}</Text>
            </View>
          ))}
        </View>

        <Text style={[docStyles.metaText, { fontWeight: 700, marginBottom: 4 }]}>
          รายการไฟล์แนบ ({doc.files.length} ไฟล์)
        </Text>
        <View style={docStyles.table}>
          <View style={docStyles.tableHeader}>
            <Text style={[docStyles.th, { width: FILE_COLUMNS[0] }]}>ไฟล์</Text>
            <Text style={[docStyles.th, { width: FILE_COLUMNS[1] }]}>เนื้อหา</Text>
          </View>
          {doc.files.map((file) => (
            <View key={file.fileName} style={docStyles.tableRow} wrap={false}>
              <Text style={[docStyles.td, { width: FILE_COLUMNS[0] }]}>{file.fileName}</Text>
              <Text style={[docStyles.td, { width: FILE_COLUMNS[1] }]}>{file.description}</Text>
            </View>
          ))}
        </View>

        <Text style={docStyles.noteText}>
          หมายเหตุ: ตรวจความถูกต้องของชุดเอกสารได้จากค่า SHA-256 ด้านบน (คำนวณจากเนื้อไฟล์ 01–08 ในชุดนี้) ·
          ค่า SHA-256 ของไฟล์ .zip ทั้งชุดดูได้ที่หน้าประวัติการส่งมอบในระบบ
        </Text>

        <SignatureRow labels={['ผู้จัดทำ (บัญชี)', 'ผู้อนุมัติส่งมอบ']} />

        <DocFooter left={`${doc.periodLabel} · ${doc.versionLabel} · ${doc.organizationName}`} />
      </Page>
    </Document>
  )
}

export async function renderPackCover(doc: PackCoverDoc): Promise<Buffer> {
  ensureThaiFont()
  return renderToBuffer(<PackCover doc={doc} />)
}
