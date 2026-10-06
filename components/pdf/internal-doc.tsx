import { StyleSheet, View } from '@react-pdf/renderer'
import { Letterhead } from '@/components/pdf/letterhead'
import { Text } from '@/components/pdf/text'
import { THAI_FONT } from '@/components/pdf/thai-font'
import type { DocLetterhead } from '@/lib/organization/profile'

/**
 * ชิ้นส่วนร่วมของ **เอกสารภายใน** (`28` §6.1 · `13` §6.7) — หัวกระดาษ/ตาราง/ช่องเซ็น
 * เลย์เอาต์ยึดตัวอย่างจริงใน `reference/samples/` (03–07): หัวเอกสารกลาง (โลโก้ + ข้อมูลองค์กร — มติ PO U99)
 * + คำกำกับประเภทเอกสารทางขวา → ชื่อเอกสารไทยตัวใหญ่ + ชื่ออังกฤษตัวเล็กใต้กัน → เนื้อหา → ช่องลายมือชื่อ
 *
 * ⚠️ เอกสารกลุ่มนี้ **ไม่มีข้อกำหนดทางกฎหมาย** (ต่างจากใบกำกับภาษี/50 ทวิ ใน §6.2/§6.3 ที่ต้อง
 *    ล็อกฟิลด์ตามแบบสรรพากร) — ห้ามนำ component ชุดนี้ไปใช้กับเอกสารทางการ
 */

export const docStyles = StyleSheet.create({
  page: {
    fontFamily: THAI_FONT,
    fontSize: 9,
    paddingHorizontal: 42,
    paddingTop: 36,
    paddingBottom: 56,
    color: '#0f172a',
  },
  titleBlock: { alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 18, fontWeight: 700 },
  titleEn: { fontSize: 9, color: '#64748b', marginTop: 1 },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 14 },
  metaCell: { width: '50%', paddingRight: 10, marginBottom: 4 },
  metaText: { fontSize: 9 },
  metaLabel: { color: '#64748b' },
  table: { borderTopWidth: 1, borderColor: '#94a3b8', marginBottom: 12 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#f8fafc', borderBottomWidth: 1, borderColor: '#94a3b8' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#e2e8f0' },
  totalRow: { flexDirection: 'row', borderBottomWidth: 1, borderTopWidth: 1, borderColor: '#94a3b8' },
  th: { fontSize: 9, fontWeight: 700, color: '#334155', paddingHorizontal: 8, paddingVertical: 6 },
  td: { fontSize: 9, paddingHorizontal: 8, paddingVertical: 6 },
  tdBold: { fontSize: 9, fontWeight: 700, paddingHorizontal: 8, paddingVertical: 6 },
  tdMuted: { fontSize: 7, color: '#94a3b8' },
  amount: { textAlign: 'right' },
  noteText: { fontSize: 7.5, color: '#64748b', marginTop: 10 },
  warnBox: {
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    borderRadius: 4,
    padding: 8,
    marginBottom: 12,
  },
  warnText: { fontSize: 8, color: '#b91c1c' },
  signRow: { flexDirection: 'row', gap: 24, marginTop: 42 },
  signBox: { flex: 1, alignItems: 'center' },
  signLine: { fontSize: 9, color: '#94a3b8' },
  signLabel: { fontSize: 9, marginTop: 2 },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 42,
    right: 42,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7,
    color: '#94a3b8',
  },
})

/** หัวเอกสารภายใน — หัวเอกสารกลาง (ค่าปัจจุบันขององค์กร) + ชื่อเอกสาร · `headerNote` พิมพ์มุมขวา */
export function DocHeader({
  letterhead,
  headerNote,
  title,
  titleEn,
}: {
  letterhead: DocLetterhead
  headerNote: string
  title: string
  titleEn: string
}): React.JSX.Element {
  return (
    <>
      <Letterhead letterhead={letterhead} note={headerNote} />
      <View style={docStyles.titleBlock}>
        <Text style={docStyles.title}>{title}</Text>
        <Text style={docStyles.titleEn}>{titleEn}</Text>
      </View>
    </>
  )
}

/** ช่องข้อมูลหัวเอกสาร "ป้าย: ค่า" — 2 คอลัมน์ตามตัวอย่าง 04/06 */
export function MetaCell({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <View style={docStyles.metaCell}>
      <Text style={docStyles.metaText}>
        <Text style={docStyles.metaLabel}>{label}: </Text>
        {value}
      </Text>
    </View>
  )
}

export function SignatureRow({ labels }: { labels: readonly string[] }): React.JSX.Element {
  return (
    <View style={docStyles.signRow}>
      {labels.map((label) => (
        <View key={label} style={docStyles.signBox}>
          <Text style={docStyles.signLine}>............................................................</Text>
          <Text style={docStyles.signLabel}>{label}</Text>
        </View>
      ))}
    </View>
  )
}

export function DocFooter({ left }: { left: string }): React.JSX.Element {
  return (
    <View style={docStyles.footer} fixed>
      <Text>{left}</Text>
      <Text render={({ pageNumber, totalPages }) => `หน้า ${pageNumber}/${totalPages}`} />
    </View>
  )
}
