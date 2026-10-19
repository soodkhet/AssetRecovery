/**
 * "สายเวอร์ชัน" ของ master ที่แก้แล้วสร้างเวอร์ชันใหม่ (แผนค่าตอบแทน `compensation_plans` · เทมเพลตค่าบริการ
 * `service_fee_templates`) — แถวในสายผูกกันด้วย `lineage_id` (= id ของเวอร์ชันแรก · NULL = แถวนี้คือเวอร์ชันแรกเอง)
 * (mytester7 FX2 · S7-AG2-05 · รวมเป็นตัวกลางตาม FX review L5)
 *
 * เงื่อนไข where เป็นรูปโครงสร้างล้วน ใช้ได้กับ `*WhereInput` ของทั้งสองตาราง (ต่างมี `id` + `lineageId`)
 */

export interface LineageRow {
  id: string
  lineageId: string | null
}

/** key ของสายที่แถวนี้อยู่ */
export function lineageKeyOfRow(row: LineageRow): string {
  return row.lineageId ?? row.id
}

export interface InLineageWhere {
  OR: [{ id: string }, { lineageId: string }]
}

/** เงื่อนไข "ทุกเวอร์ชันในสายเดียวกัน" — ตัวแรก (id = key) + ตัวถัดไป (lineage_id = key) */
export function inLineage(lineageKey: string): InLineageWhere {
  return { OR: [{ id: lineageKey }, { lineageId: lineageKey }] }
}

export interface NotInLineageWhere {
  NOT: { id: string }
  OR: [{ lineageId: null }, { lineageId: { not: string } }]
}

/**
 * เงื่อนไข "ไม่อยู่ในสายนี้" — null-safe · **ห้ามใช้ `NOT: inLineage(key)`**: เวอร์ชันแรกของสายอื่นมี `lineage_id` = NULL
 * ⇒ `NOT (id = k OR lineage_id = k)` ได้ NULL (ไม่ใช่ true) แถวนั้นหลุดจากผลลัพธ์ ⇒ ตรวจชื่อซ้ำไม่เจอ
 */
export function notInLineage(lineageKey: string): NotInLineageWhere {
  return { NOT: { id: lineageKey }, OR: [{ lineageId: null }, { lineageId: { not: lineageKey } }] }
}

/** ตารางที่ชื่อต้องไม่ซ้ำข้ามสายเวอร์ชัน (unique ระดับ DB คุมได้แค่ `(org, name, version)`) */
export type VersionedNameTable = 'compensation_plans' | 'service_fee_templates'

interface NameLockClient {
  $executeRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<number>
}

export function versionedNameLockKey(table: VersionedNameTable, organizationId: string): string {
  return `${table}:name:${organizationId}`
}

/**
 * mytester7 FX review L1 — ล็อกการตั้งชื่อของตารางระดับองค์กร (advisory lock ระดับทรานแซกชัน) ก่อนตรวจชื่อซ้ำ
 * **ในทรานแซกชันที่ insert** · เดิมตรวจนอกทรานแซกชันอย่างเดียว ⇒ สร้างชื่อ X (v1) พร้อมกับเปลี่ยนชื่อสายอื่นเป็น X
 * (v n+1) ผ่านทั้งคู่ เพราะ unique `(org, name, version)` ไม่ชนเมื่อเลขเวอร์ชันต่างกัน
 */
export async function lockVersionedNames(
  tx: NameLockClient,
  table: VersionedNameTable,
  organizationId: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${versionedNameLockKey(table, organizationId)}))`
}
