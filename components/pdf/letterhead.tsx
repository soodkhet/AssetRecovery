import { Image, StyleSheet, View } from '@react-pdf/renderer'
import { Text } from '@/components/pdf/text'
import { letterheadContactLine, letterheadTaxLine, type DocLetterhead } from '@/lib/organization/profile'

/**
 * **หัวเอกสารกลาง** (มติ PO U99 · `28` §6.0) — component เดียวที่ PDF ทุกตัวใช้ (ยกเว้นแบบฟอร์ม 50 ทวิ
 * ที่ต้องคงแบบทางการของกรมสรรพากร)
 *
 * โลโก้ (ถ้ามี) ซ้าย → ชื่อไทยตัวหนา / ชื่ออังกฤษ / ที่อยู่ / โทร-อีเมล-เว็บไซต์ / เลขผู้เสียภาษี + สาขา
 * → ข้อความกำกับมุมขวา (เช่น "เอกสารภายใน …" หรือ "ต้นฉบับ / ORIGINAL") · เส้นคั่นใต้หัว
 * · ไม่มีโลโก้ = ข้อความชิดซ้ายเต็มแถว (ไม่เว้นกล่องว่าง) · ช่องที่ไม่มีค่า = ไม่พิมพ์บรรทัดนั้น
 * ⚠️ ข้อมูลประกอบเสร็จแล้วจาก `lib/organization/letterhead.ts` (snapshot/ค่าปัจจุบัน) — ที่นี่แค่พิมพ์
 */

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingBottom: 8,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderColor: '#cbd5e1',
  },
  logo: { width: 64, height: 64, objectFit: 'contain' },
  info: { flex: 1 },
  nameTh: { fontSize: 12, fontWeight: 700 },
  nameEn: { fontSize: 8.5, color: '#475569', marginTop: 1 },
  line: { fontSize: 8, color: '#334155', lineHeight: 1.45 },
  note: { width: 150, fontSize: 8, color: '#64748b', textAlign: 'right' },
})

export function Letterhead({
  letterhead,
  note,
}: {
  letterhead: DocLetterhead
  /** ข้อความกำกับมุมขวา — ไม่ส่ง = ไม่มีคอลัมน์ขวา */
  note?: string | null
}): React.JSX.Element {
  const contact = letterheadContactLine(letterhead)
  return (
    <View style={styles.row}>
      {letterhead.logo === null ? null : (
        // eslint-disable-next-line jsx-a11y/alt-text -- Image ของ react-pdf ไม่มี alt (ไม่ใช่ <img> ของ DOM)
        <Image style={styles.logo} src={{ data: letterhead.logo.data, format: letterhead.logo.format }} />
      )}
      <View style={styles.info}>
        <Text style={styles.nameTh}>{letterhead.nameTh}</Text>
        {letterhead.nameEn === null ? null : <Text style={styles.nameEn}>{letterhead.nameEn}</Text>}
        {letterhead.address === '' ? null : <Text style={styles.line}>{letterhead.address}</Text>}
        {contact === null ? null : <Text style={styles.line}>{contact}</Text>}
        <Text style={styles.line}>{letterheadTaxLine(letterhead)}</Text>
      </View>
      {note === undefined || note === null ? null : <Text style={styles.note}>{note}</Text>}
    </View>
  )
}
