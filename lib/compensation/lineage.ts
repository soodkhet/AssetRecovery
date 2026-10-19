import type { Prisma } from '@/lib/generated/prisma/client'
import { inLineage, lineageKeyOfRow, notInLineage, type LineageRow } from '@/lib/versioning/lineage'

/**
 * "สายเวอร์ชัน" ของแผนค่าตอบแทน (mytester7 FX2 — แบบเดียวกับเทมเพลตค่าบริการ S7-AG2-05)
 *
 * แผนหนึ่งชุด = หลายเวอร์ชันที่ผูกกันด้วย `lineage_id` (= id ของเวอร์ชันแรก · NULL = แถวนี้คือเวอร์ชันแรกเอง)
 * เดิมจับกลุ่มด้วย `name` ⇒ เปลี่ยนชื่อในเวอร์ชันใหม่ต้องเขียนทับชื่อเวอร์ชันเดิมทุกแถว ทำให้รายการเบิกที่
 * snapshot เวอร์ชันเดิม (`comp_plan_id` + `comp_plan_version` — `92` §7.1) แสดงชื่อที่ไม่ตรงยอดของเวอร์ชันนั้น
 *
 * ตัวกลางอยู่ที่ `lib/versioning/lineage.ts` (ใช้ร่วมกับเทมเพลตค่าบริการ) — ที่นี่เป็นตัวห่อชนิดของตารางแผน
 */

/** key ของสายที่แถวนี้อยู่ */
export function planLineageKey(row: LineageRow): string {
  return lineageKeyOfRow(row)
}

/** เงื่อนไข "ทุกเวอร์ชันในสายเดียวกัน" */
export function inPlanLineage(lineageKey: string): Prisma.CompensationPlanWhereInput {
  return inLineage(lineageKey)
}

/** เงื่อนไข "ไม่อยู่ในสายนี้" — null-safe (**ห้ามใช้ `NOT: inPlanLineage(key)`** — ดู `notInLineage()`) */
export function notInPlanLineage(lineageKey: string): Prisma.CompensationPlanWhereInput {
  return notInLineage(lineageKey)
}
