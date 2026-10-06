import { createContext, useContext, type ReactNode } from 'react'
import { StyleSheet, View } from '@react-pdf/renderer'
import { Text } from '@/components/pdf/text'

/**
 * ป้าย/ลายน้ำ "ตัวอย่าง" ของหน้าตัวอย่างเอกสาร (มติ PO U104 — เมนูบัญชี → ตัวอย่างเอกสารทั้งหมด)
 *
 * เปิดด้วย `<SampleMode>` ห่อ `<Document>` ทั้งไฟล์ ⇒ ทุกหน้าที่วาง {@link SampleStamp} ไว้ (ผ่าน `DocPage`
 * ของเลย์เอาต์กลาง + หน้าปก + แบบ 50 ทวิ) พิมพ์ลายน้ำทแยงกลางหน้า + แถบข้อความบนสุด **ทุกหน้า** (`fixed`)
 * · เอกสารจริงไม่ห่อ ⇒ context = false ⇒ ไม่พิมพ์อะไรเลย (component เดิมไม่ต้องรับ prop เพิ่ม)
 */

export const SAMPLE_DOC_LABEL = 'ตัวอย่าง — ไม่ใช่เอกสารจริง'
export const SAMPLE_WATERMARK_TEXT = 'ตัวอย่าง'

const SampleModeContext = createContext(false)

export function SampleMode({ children }: { children: ReactNode }): React.JSX.Element {
  return <SampleModeContext.Provider value>{children}</SampleModeContext.Provider>
}

const styles = StyleSheet.create({
  watermarkWrap: {
    position: 'absolute',
    top: '38%',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  watermark: {
    fontSize: 96,
    fontWeight: 700,
    color: '#dc2626',
    opacity: 0.12,
    transform: 'rotate(-32deg)',
  },
  ribbon: {
    position: 'absolute',
    top: 10,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  ribbonText: {
    fontSize: 9,
    fontWeight: 700,
    color: '#b91c1c',
    borderWidth: 1,
    borderColor: '#b91c1c',
    borderRadius: 3,
    paddingHorizontal: 8,
    paddingVertical: 1,
    backgroundColor: '#fef2f2',
  },
})

/** วางในทุก `<Page>` — พิมพ์เฉพาะเมื่ออยู่ใต้ {@link SampleMode} */
export function SampleStamp(): React.JSX.Element | null {
  const sample = useContext(SampleModeContext)
  if (!sample) return null
  return (
    <>
      <View style={styles.watermarkWrap} fixed>
        <Text style={styles.watermark}>{SAMPLE_WATERMARK_TEXT}</Text>
      </View>
      <View style={styles.ribbon} fixed>
        <Text style={styles.ribbonText}>{SAMPLE_DOC_LABEL}</Text>
      </View>
    </>
  )
}
