import { StyleSheet, Text, View } from '@react-pdf/renderer'
import { THAI_FONT } from '@/components/pdf/thai-font'

/**
 * ชิ้นส่วนร่วมของ **เอกสารทางการ** (`28` §6.2/§6.3) — ใบกำกับภาษี (ไฟล์ 31) และใบ 50 ทวิ (ไฟล์ 33)
 *
 * ⚠️ แยกจาก `internal-doc.tsx` โดยเจตนา — เอกสารกลุ่มนี้มี**ข้อกำหนดทางกฎหมาย**: ต้องมีคำระบุชนิด
 *    เอกสารเด่นชัด + ข้อมูลผู้ออก/ผู้รับครบ + เลขที่/วันที่ + ยอดที่แยกภาษีชัดเจน ⇒ โครงหน้าเปลี่ยน
 *    ตามใจไม่ได้ ต้องเทียบกับตัวอย่างใน `reference/samples/` (01, 02) เสมอ
 * ⚠️ ทุกค่าที่ส่งเข้ามาต้องเป็น**ข้อความที่ประกอบเสร็จแล้ว** (พ.ศ. / คั่นหลักพัน) — component
 *    ห้ามคำนวณหรือ format เอง (Rule 01)
 */

export const officialStyles = StyleSheet.create({
  page: {
    fontFamily: THAI_FONT,
    fontSize: 9,
    paddingHorizontal: 40,
    paddingTop: 34,
    paddingBottom: 54,
    color: '#0f172a',
  },
  titleBlock: { alignItems: 'center', marginBottom: 4 },
  title: { fontSize: 20, fontWeight: 700 },
  titleEn: { fontSize: 9, color: '#475569', marginTop: 1, letterSpacing: 1 },
  copyLabel: { fontSize: 8, color: '#64748b', marginTop: 2 },
  cancelBanner: {
    borderWidth: 1,
    borderColor: '#b91c1c',
    backgroundColor: '#fef2f2',
    padding: 8,
    marginTop: 10,
    marginBottom: 4,
  },
  cancelText: { fontSize: 10, fontWeight: 700, color: '#b91c1c', textAlign: 'center' },
  partyRow: { flexDirection: 'row', gap: 14, marginTop: 12, marginBottom: 12 },
  partyBox: { flex: 1, borderWidth: 1, borderColor: '#94a3b8', padding: 8 },
  partyRole: { fontSize: 8, color: '#64748b', marginBottom: 3 },
  partyName: { fontSize: 10, fontWeight: 700, marginBottom: 2 },
  partyLine: { fontSize: 8.5, lineHeight: 1.5 },
  metaBox: { borderWidth: 1, borderColor: '#94a3b8', padding: 8, marginBottom: 12 },
  metaRow: { flexDirection: 'row', marginBottom: 2 },
  metaLabel: { fontSize: 8.5, color: '#475569', width: 118 },
  metaValue: { fontSize: 9, fontWeight: 700 },
  table: { borderWidth: 1, borderColor: '#94a3b8' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderBottomWidth: 1, borderColor: '#94a3b8' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#e2e8f0' },
  th: { fontSize: 8.5, fontWeight: 700, color: '#334155', paddingHorizontal: 8, paddingVertical: 6 },
  td: { fontSize: 9, paddingHorizontal: 8, paddingVertical: 8 },
  amount: { textAlign: 'right' },
  center: { textAlign: 'center' },
  summaryRow: { flexDirection: 'row', borderTopWidth: 1, borderColor: '#94a3b8' },
  summaryLabel: { flex: 1, fontSize: 9, paddingHorizontal: 8, paddingVertical: 5, textAlign: 'right' },
  summaryValue: { width: '24%', fontSize: 9, paddingHorizontal: 8, paddingVertical: 5, textAlign: 'right' },
  summaryValueBold: {
    width: '24%',
    fontSize: 10,
    fontWeight: 700,
    paddingHorizontal: 8,
    paddingVertical: 5,
    textAlign: 'right',
  },
  wordsBox: { borderWidth: 1, borderColor: '#94a3b8', borderTopWidth: 0, padding: 8 },
  wordsText: { fontSize: 9, textAlign: 'center' },
  noteText: { fontSize: 7.5, color: '#64748b', marginTop: 10, lineHeight: 1.5 },
  signRow: { flexDirection: 'row', gap: 24, marginTop: 40 },
  signBox: { flex: 1, alignItems: 'center' },
  signLine: { fontSize: 9, color: '#94a3b8' },
  signLabel: { fontSize: 8.5, marginTop: 2 },
  footer: {
    position: 'absolute',
    bottom: 22,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7,
    color: '#94a3b8',
  },
})

/** หัวเอกสาร — คำระบุชนิดเอกสารต้อง "เห็นเด่นชัด" ตามประมวลรัษฎากร (`28` §6.2) */
export function OfficialHeader({
  title,
  titleEn,
  copyLabel,
}: {
  title: string
  titleEn: string
  copyLabel: string
}): React.JSX.Element {
  return (
    <View style={officialStyles.titleBlock}>
      <Text style={officialStyles.title}>{title}</Text>
      <Text style={officialStyles.titleEn}>{titleEn}</Text>
      <Text style={officialStyles.copyLabel}>{copyLabel}</Text>
    </View>
  )
}

export interface OfficialParty {
  name: string
  taxId: string
  address: string
  phone: string | null
}

/** กล่องคู่สัญญา (ผู้ขาย/ผู้ซื้อ · ผู้จ่าย/ผู้ถูกหัก) — เลขผู้เสียภาษีใช้ font ปกติแต่ระบุชัดเจน */
export function PartyBox({ role, party }: { role: string; party: OfficialParty }): React.JSX.Element {
  return (
    <View style={officialStyles.partyBox}>
      <Text style={officialStyles.partyRole}>{role}</Text>
      <Text style={officialStyles.partyName}>{party.name}</Text>
      <Text style={officialStyles.partyLine}>{party.address}</Text>
      <Text style={officialStyles.partyLine}>เลขประจำตัวผู้เสียภาษี {party.taxId}</Text>
      {party.phone === null ? null : <Text style={officialStyles.partyLine}>โทร. {party.phone}</Text>}
    </View>
  )
}

export function MetaRow({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <View style={officialStyles.metaRow}>
      <Text style={officialStyles.metaLabel}>{label}</Text>
      <Text style={officialStyles.metaValue}>{value}</Text>
    </View>
  )
}

export function OfficialFooter({ left, right }: { left: string; right: string }): React.JSX.Element {
  return (
    <View style={officialStyles.footer} fixed>
      <Text>{left}</Text>
      <Text render={({ pageNumber, totalPages }) => `${right} · หน้า ${pageNumber}/${totalPages}`} />
    </View>
  )
}
