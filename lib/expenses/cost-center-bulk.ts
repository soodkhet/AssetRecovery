/**
 * staging E-065 — เลือกหลายรายการเพื่อ map ศูนย์ต้นทุนพร้อมกัน (หน้าบัญชีค่าใช้จ่าย) · **pure**
 * เลือกได้เฉพาะรายการ `manual` (รายการ `auto` แก้ที่ทีมของผู้รับ — API ปฏิเสธ `COST_CENTER_AUTO_EDIT`)
 */
export interface BulkMapRow {
  id: string
  mappingRule: string
}

export function bulkMappableIds(rows: readonly BulkMapRow[]): string[] {
  return rows.filter((row) => row.mappingRule === 'manual').map((row) => row.id)
}

/** รายการที่เลือกอยู่ซึ่งยังอยู่ในหน้าปัจจุบันและ map ได้ (กรอง/โหลดใหม่แล้วรายการหายไป ⇒ ตัดทิ้ง) */
export function effectiveBulkSelection(selected: ReadonlySet<string>, rows: readonly BulkMapRow[]): string[] {
  return bulkMappableIds(rows).filter((id) => selected.has(id))
}

/** ติ๊ก "เลือกทั้งหมด" — เลือกครบแล้ว ⇒ ล้าง · ไม่งั้น ⇒ เลือกทุกรายการที่ map ได้ */
export function toggleAllBulkSelection(selected: ReadonlySet<string>, rows: readonly BulkMapRow[]): Set<string> {
  const mappable = bulkMappableIds(rows)
  const allSelected = mappable.length > 0 && mappable.every((id) => selected.has(id))
  return allSelected ? new Set() : new Set(mappable)
}
