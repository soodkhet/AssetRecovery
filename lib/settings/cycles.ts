import type { CutoffRuleType, CycleType, DueRuleType } from '@/lib/generated/prisma/enums'

/**
 * รอบบิล/รอบจ่าย (`13` §6.1) — pure ล้วน ใช้ร่วม FE/BE
 *
 * โครงร่างที่ถูกต้องของ `cutoff_*` และ `due_rule_*` ถูกบังคับ 2 ชั้น:
 *  1. Zod (`lib/settings/schemas.ts`) — ตอบ 400 พร้อม field error
 *  2. CHECK `cycles_cutoff_shape` / `cycles_due_rule_shape` ระดับ DB (`02` §5 · migration init)
 * ฟังก์ชันในไฟล์นี้คือชั้นกลางที่ทั้งสองชั้นอ้างอิงร่วมกัน — แก้กติกาต้องแก้ CHECK คู่กันเสมอ
 *
 * ⚠️ A5 (มติ PO 2026-08-12): `due_rule` เป็น **label ที่ผู้ใช้เห็น** เท่านั้น ห้าม parse มาคำนวณ
 * — วันครบกำหนดคำนวณจาก `due_rule_type` + `due_rule_value` (ไฟล์ 19 ใช้ `resolveDueDate()`)
 */

export interface CycleValues {
  name: string
  type: CycleType
  cutoffRuleType: CutoffRuleType
  cutoffDates: number[]
  cutoffText: string | null
  dueRuleType: DueRuleType
  dueRuleValue: number | null
  scope: string
}

/** วันที่ในเดือนที่รับได้ (31 = สิ้นเดือนของเดือนที่สั้นกว่าจะถูก clamp ตอนคำนวณจริง) */
export const MIN_CUTOFF_DAY = 1
export const MAX_CUTOFF_DAY = 31

/** ค่าที่ไม่เกี่ยวกับชนิดที่เลือกต้องถูกล้างทิ้งจริง — ไม่ปล่อยค่าค้างให้ CHECK ระดับ DB จับทีหลัง */
export function normalizeCycleValues(input: CycleValues): CycleValues {
  const cutoffDates =
    input.cutoffRuleType === 'fixed_dates'
      ? [...new Set(input.cutoffDates)].sort((a, b) => a - b)
      : []
  const cutoffText = input.cutoffRuleType === 'custom_text' ? (input.cutoffText?.trim() ?? null) : null
  const dueRuleValue = input.dueRuleType === 'month_end' ? null : input.dueRuleValue

  return {
    name: input.name.trim(),
    type: input.type,
    cutoffRuleType: input.cutoffRuleType,
    cutoffDates,
    cutoffText: cutoffText === '' ? null : cutoffText,
    dueRuleType: input.dueRuleType,
    dueRuleValue,
    scope: input.scope.trim(),
  }
}

/** ตรงกับ CHECK `cycles_cutoff_shape` เป๊ะ (`02` §5) */
export function isCutoffShapeValid(values: Pick<CycleValues, 'cutoffRuleType' | 'cutoffDates' | 'cutoffText'>): boolean {
  switch (values.cutoffRuleType) {
    case 'fixed_dates':
      return values.cutoffDates.length > 0
    case 'custom_text':
      return values.cutoffText !== null && values.cutoffText.trim().length > 0
    case 'month_end':
      return true
  }
}

/** ตรงกับ CHECK `cycles_due_rule_shape` เป๊ะ (A5) */
export function isDueRuleShapeValid(values: Pick<CycleValues, 'dueRuleType' | 'dueRuleValue'>): boolean {
  if (values.dueRuleType === 'month_end') return true
  return values.dueRuleValue !== null && values.dueRuleValue > 0
}

/** label ภาษาไทยของเงื่อนไขกำหนดชำระ — ใช้เป็นค่าเริ่มต้นของช่อง `due_rule` บนฟอร์ม */
export function describeDueRule(values: Pick<CycleValues, 'dueRuleType' | 'dueRuleValue'>): string {
  switch (values.dueRuleType) {
    case 'net_days':
      return `Net ${values.dueRuleValue ?? 0} วัน`
    case 'day_of_next_month':
      return `วันที่ ${values.dueRuleValue ?? 0} ของเดือนถัดไป`
    case 'month_end':
      return 'สิ้นเดือน'
  }
}

/** label ภาษาไทยของกติกาวันตัดรอบ (ตารางแท็บรอบบิลแสดงคอลัมน์นี้ — `13` §7) */
export function describeCutoffRule(
  values: Pick<CycleValues, 'cutoffRuleType' | 'cutoffDates' | 'cutoffText'>,
): string {
  switch (values.cutoffRuleType) {
    case 'fixed_dates':
      return `ทุกวันที่ ${values.cutoffDates.join(', ')}`
    case 'month_end':
      return 'ทุกสิ้นเดือน'
    case 'custom_text':
      return values.cutoffText ?? '—'
  }
}

/** payload ที่ลง audit — โครงเดียวกันทั้ง create/update เพื่อให้ diff อ่านรู้เรื่อง (`90` §13) */
export function toCycleAuditPayload(values: CycleValues): Record<string, unknown> {
  return {
    name: values.name,
    type: values.type,
    cutoff_rule_type: values.cutoffRuleType,
    cutoff_dates: values.cutoffDates,
    cutoff_text: values.cutoffText,
    due_rule_type: values.dueRuleType,
    due_rule_value: values.dueRuleValue,
    due_rule: describeDueRule(values),
    scope: values.scope,
  }
}
