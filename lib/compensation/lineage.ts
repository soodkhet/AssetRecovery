import type { Prisma } from '@/lib/generated/prisma/client'

/**
 * "สายเวอร์ชัน" ของแผนค่าตอบแทน (mytester7 FX2 — แบบเดียวกับเทมเพลตค่าบริการ S7-AG2-05)
 *
 * แผนหนึ่งชุด = หลายเวอร์ชันที่ผูกกันด้วย `lineage_id` (= id ของเวอร์ชันแรก · NULL = แถวนี้คือเวอร์ชันแรกเอง)
 * เดิมจับกลุ่มด้วย `name` ⇒ เปลี่ยนชื่อในเวอร์ชันใหม่ต้องเขียนทับชื่อเวอร์ชันเดิมทุกแถว ทำให้รายการเบิกที่
 * snapshot เวอร์ชันเดิม (`comp_plan_id` + `comp_plan_version` — `92` §7.1) แสดงชื่อที่ไม่ตรงยอดของเวอร์ชันนั้น
 */

/** key ของสายที่แถวนี้อยู่ */
export function planLineageKey(row: { id: string; lineageId: string | null }): string {
  return row.lineageId ?? row.id
}

/** เงื่อนไข "ทุกเวอร์ชันในสายเดียวกัน" — ตัวแรก (id = key) + ตัวถัดไป (lineage_id = key) */
export function inPlanLineage(lineageKey: string): Prisma.CompensationPlanWhereInput {
  return { OR: [{ id: lineageKey }, { lineageId: lineageKey }] }
}

/**
 * เงื่อนไข "ไม่อยู่ในสายนี้" — **ห้ามใช้ `NOT: inPlanLineage(key)`**: เวอร์ชันแรกของสายอื่นมี `lineage_id` = NULL
 * ⇒ `NOT (id = k OR lineage_id = k)` ได้ NULL (ไม่ใช่ true) แถวนั้นหลุดจากผลลัพธ์ ⇒ ตรวจชื่อซ้ำไม่เจอ
 */
export function notInPlanLineage(lineageKey: string): Prisma.CompensationPlanWhereInput {
  return { NOT: { id: lineageKey }, OR: [{ lineageId: null }, { lineageId: { not: lineageKey } }] }
}
