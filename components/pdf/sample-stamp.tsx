import { AsyncLocalStorage } from 'node:async_hooks'
import { StyleSheet, View } from '@react-pdf/renderer'
import { Text } from '@/components/pdf/text'

/**
 * ป้าย/ลายน้ำ "ตัวอย่าง" ของหน้าตัวอย่างเอกสาร (มติ PO U104 — เมนูบัญชี → ตัวอย่างเอกสารทั้งหมด)
 *
 * เปิดด้วย {@link runInSampleMode} ครอบการเรนเดอร์ทั้งไฟล์ ⇒ ทุกหน้าที่วาง {@link SampleStamp} ไว้ (ผ่าน `DocPage`
 * ของเลย์เอาต์กลาง + หน้าปก + แบบ 50 ทวิ) พิมพ์ลายน้ำทแยงกลางหน้า + แถบข้อความบนสุด **ทุกหน้า** (`fixed`)
 * · เอกสารจริงไม่ครอบ ⇒ flag = false ⇒ ไม่พิมพ์อะไรเลย (component เดิมไม่ต้องรับ prop เพิ่ม)
 *
 * ⚠️ BUG-172: ห้ามใช้ React context/hook (`createContext`/`useContext`) ใน `components/pdf/*` — route handler
 * ของ Next ถูก bundle ด้วยเงื่อนไข `react-server` ซึ่ง React ฝั่งนี้ไม่มี `createContext` ⇒ dev server compile
 * พังทั้งเซิร์ฟเวอร์ (vitest ไม่เจอเพราะไม่ผ่าน bundler) และ hook จาก React ที่ bundle ไว้ก็ไม่ใช่ตัวเดียวกับที่
 * reconciler ของ `@react-pdf/renderer` (server external package) ใช้ ⇒ ส่งสถานะ "โหมดตัวอย่าง" ผ่าน
 * AsyncLocalStorage แทน (เรนเดอร์ PDF ทำฝั่ง server เท่านั้น) · มีเทสต์สแกนกันไว้ใน `no-react-hooks.test.ts`
 */

export const SAMPLE_DOC_LABEL = 'ตัวอย่าง — ไม่ใช่เอกสารจริง'
export const SAMPLE_WATERMARK_TEXT = 'ตัวอย่าง'

const sampleModeStorage = new AsyncLocalStorage<boolean>()

/** เรนเดอร์ภายใน `fn` = โหมดตัวอย่าง (ทุก {@link SampleStamp} ที่ถูกเรียกระหว่างนั้นพิมพ์ลายน้ำ) */
export function runInSampleMode<T>(fn: () => T): T {
  return sampleModeStorage.run(true, fn)
}

export function isSampleMode(): boolean {
  return sampleModeStorage.getStore() === true
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

/** วางในทุก `<Page>` — พิมพ์เฉพาะเมื่อเรนเดอร์ภายใน {@link runInSampleMode} */
export function SampleStamp(): React.JSX.Element | null {
  if (!isSampleMode()) return null
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
