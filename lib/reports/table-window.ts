/**
 * หน้าต่างแถวของ virtual scroll (`96` §11 — "ตารางทุกตัวมี pagination หรือ virtual scroll ถ้า row > 100")
 * — **pure ล้วน** เพื่อทดสอบได้โดยไม่ต้องมี DOM (ตัวเรนเดอร์อยู่ `components/reports/report-table.tsx`)
 */

/** เกินจำนวนนี้จึงเปิด virtual scroll */
export const VIRTUAL_SCROLL_THRESHOLD = 100
/** ความสูงต่อแถว (px) — ต้องตรงกับ padding ของ `<Td>` ใน UI Kit */
export const VIRTUAL_ROW_HEIGHT = 45
/** ความสูงของกรอบเลื่อนเมื่อเปิด virtual scroll */
export const VIRTUAL_VIEWPORT_HEIGHT = 560
/** แถวกันชนบน/ล่าง — กันขอบขาวตอนเลื่อนเร็ว */
export const VIRTUAL_OVERSCAN = 8

export interface RowWindow {
  /** index แถวแรกที่เรนเดอร์ (รวมกันชน) */
  readonly start: number
  /** index หลังแถวสุดท้ายที่เรนเดอร์ (exclusive) */
  readonly end: number
}

export function shouldVirtualize(rowCount: number): boolean {
  return rowCount > VIRTUAL_SCROLL_THRESHOLD
}

/**
 * ช่วงแถวที่ต้องเรนเดอร์จากตำแหน่ง scroll ปัจจุบัน
 *
 * ⚠️ ต้องครอบ "แถวที่มองเห็น" เสมอแม้เลื่อนสุดล่าง — แถวที่ไม่ได้เรนเดอร์ถูกแทนด้วยช่องว่างสูงเท่ากัน
 * ⇒ ความสูงรวมของตารางไม่เปลี่ยน (scrollbar ไม่กระตุก) และ **ไม่มีแถวไหนหายไปจากข้อมูล**
 */
export function visibleRowWindow(options: {
  rowCount: number
  scrollTop: number
  viewportHeight?: number
  rowHeight?: number
  overscan?: number
}): RowWindow {
  const rowHeight = options.rowHeight ?? VIRTUAL_ROW_HEIGHT
  const viewportHeight = options.viewportHeight ?? VIRTUAL_VIEWPORT_HEIGHT
  const overscan = options.overscan ?? VIRTUAL_OVERSCAN

  const scrollTop = Math.max(0, options.scrollTop)
  const first = Math.floor(scrollTop / rowHeight)
  const visible = Math.ceil(viewportHeight / rowHeight)

  const start = Math.max(0, Math.min(first - overscan, Math.max(0, options.rowCount - 1)))
  const end = Math.min(options.rowCount, first + visible + overscan)
  return { start, end: Math.max(start, end) }
}
