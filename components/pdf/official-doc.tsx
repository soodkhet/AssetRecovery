import { StyleSheet, View } from '@react-pdf/renderer'
import { Text } from '@/components/pdf/text'
import { THAI_FONT } from '@/components/pdf/thai-font'

/**
 * ชิ้นส่วนร่วมของ **แบบฟอร์มทางการ 50 ทวิ** (`28` §6.3) — หน้ากระดาษ/แถบยกเลิก/ท้ายกระดาษ
 *
 * ⚠️ ใบแจ้งหนี้ ใบเสร็จรับเงิน/ใบกำกับภาษี และเอกสารอื่นทั้งหมดย้ายไปใช้เลย์เอาต์ตามแบบที่อนุมัติ
 *    (`doc-layout.tsx` — มติ PO U100/U101) แล้ว · แบบ 50 ทวิ คงแบบทางการของกรมสรรพากร (ไม่ใช้หัวเอกสารกลาง)
 * ⚠️ ทุกค่าที่ส่งเข้ามาต้องเป็น**ข้อความที่ประกอบเสร็จแล้ว** (พ.ศ. / คั่นหลักพัน) — ห้ามคำนวณหรือ format เอง (Rule 01)
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
  cancelBanner: {
    borderWidth: 1,
    borderColor: '#b91c1c',
    backgroundColor: '#fef2f2',
    padding: 8,
    marginTop: 10,
    marginBottom: 4,
  },
  cancelText: { fontSize: 10, fontWeight: 700, color: '#b91c1c', textAlign: 'center' },
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

export function OfficialFooter({ left, right }: { left: string; right: string }): React.JSX.Element {
  return (
    <View style={officialStyles.footer} fixed>
      <Text>{left}</Text>
      <Text render={({ pageNumber, totalPages }) => `${right} · หน้า ${pageNumber}/${totalPages}`} />
    </View>
  )
}
