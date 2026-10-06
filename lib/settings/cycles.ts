import type { CutoffRuleType, CycleScopeKind, CycleType, DueRuleType } from '@/lib/generated/prisma/enums'

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
  /** ขอบเขตจริง (มติ PO U133) — AR: all_companies | selected_companies · AP: all_teams | inhouse | outsource */
  scopeKind: CycleScopeKind
  /** บริษัทที่รอบบิลใช้ — มีค่าเฉพาะ selected_companies (นอกนั้น [] เสมอ) */
  companyIds: string[]
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
    scopeKind: input.scopeKind,
    companyIds: input.scopeKind === 'selected_companies' ? [...new Set(input.companyIds)].sort() : [],
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

/** วันสุดท้ายของเดือนนั้นตามปฏิทิน UTC (คอลัมน์ `DATE` = เที่ยงคืน UTC) */
function lastDayOfMonthUtc(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
}

/**
 * **วันครบกำหนดชำระจริง** (A5 · `19` §7.2) — คำนวณจาก `due_rule_type` + `due_rule_value` เท่านั้น
 * ห้าม parse `due_rule` (label ที่ผู้ใช้พิมพ์เอง) มาคิด
 *
 * | ชนิด | ผลลัพธ์ |
 * |---|---|
 * | `net_days` | วันตัดรอบ + N วัน |
 * | `day_of_next_month` | วันที่ N ของ**เดือนถัดจากวันตัดรอบ** (เกินจำนวนวันในเดือน → clamp วันสุดท้าย) |
 * | `month_end` | วันสุดท้ายของ**เดือนที่ตัดรอบ** |
 *
 * ⚠️ `cutoffDate` ต้องมาจากคอลัมน์/ค่า **date-only (เที่ยงคืน UTC)** เหมือน `billing_batches.due_date`
 *    — ส่ง instant เข้ามาตรง ๆ จะได้วันเพี้ยนตอนหัวค่ำเวลาไทย (บทเรียนเดียวกับ VAT resolver)
 */
export function resolveDueDate(
  cutoffDate: Date,
  values: Pick<CycleValues, 'dueRuleType' | 'dueRuleValue'>,
): Date {
  const year = cutoffDate.getUTCFullYear()
  const month = cutoffDate.getUTCMonth()
  const day = cutoffDate.getUTCDate()

  switch (values.dueRuleType) {
    case 'net_days':
      return new Date(Date.UTC(year, month, day + (values.dueRuleValue ?? 0)))
    case 'day_of_next_month': {
      const target = values.dueRuleValue ?? 1
      return new Date(Date.UTC(year, month + 1, Math.min(target, lastDayOfMonthUtc(year, month + 1))))
    }
    case 'month_end':
      return new Date(Date.UTC(year, month, lastDayOfMonthUtc(year, month)))
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
    scope_kind: values.scopeKind,
    company_ids: values.companyIds,
  }
}

// ── ขอบเขตรอบ (มติ PO U133) ──────────────────────────────────────────────────

export const CYCLE_SCOPE_KINDS_BY_TYPE: Readonly<Record<CycleType, readonly CycleScopeKind[]>> = {
  AR: ['all_companies', 'selected_companies'],
  AP: ['all_teams', 'inhouse', 'outsource'],
}

export const CYCLE_SCOPE_LABEL: Readonly<Record<CycleScopeKind, string>> = {
  all_companies: 'บริษัทไฟแนนซ์ทุกราย',
  selected_companies: 'เลือกรายบริษัท',
  all_teams: 'ทุกทีม (In-house + Outsource)',
  inhouse: 'ทีม In-house',
  outsource: 'ทีม Outsource',
}

/** ขอบเขตเข้าคู่กับชนิดรอบ (ตรงกับ CHECK `cycles_scope_matches_type`) */
export function isScopeKindValidForType(type: CycleType, scopeKind: CycleScopeKind): boolean {
  return CYCLE_SCOPE_KINDS_BY_TYPE[type].includes(scopeKind)
}

export type CycleScopeValues = Pick<CycleValues, 'type' | 'scopeKind' | 'companyIds'>

/**
 * ขอบเขตของ 2 รอบซ้อนกันไหม — ชนิดต่างกันไม่ซ้อน · "ทุกบริษัท"/"ทุกทีม" ซ้อนกับรอบชนิดเดียวกันทุกรอบ
 * · รายบริษัทซ้อนเมื่อมีบริษัทร่วม · ฝั่งทีมซ้อนเมื่อเป็นฝั่งเดียวกัน
 */
export function cycleScopesOverlap(a: CycleScopeValues, b: CycleScopeValues): boolean {
  if (a.type !== b.type) return false
  if (a.type === 'AR') {
    if (a.scopeKind === 'all_companies' || b.scopeKind === 'all_companies') return true
    const other = new Set(b.companyIds)
    return a.companyIds.some((id) => other.has(id))
  }
  if (a.scopeKind === 'all_teams' || b.scopeKind === 'all_teams') return true
  return a.scopeKind === b.scopeKind
}

/** รอบอื่นที่ขอบเขตซ้อนกับรอบนี้ (ตัวแรก) — `null` = ไม่ซ้อน */
export function findOverlappingCycle<T extends CycleScopeValues & { id: string }>(
  candidate: CycleScopeValues & { id?: string },
  others: readonly T[],
): T | null {
  return others.find((other) => other.id !== candidate.id && cycleScopesOverlap(candidate, other)) ?? null
}

/** รอบบิลนี้ใช้กับบริษัทนี้ไหม */
export function cycleCoversCompany(cycle: CycleScopeValues, companyId: string): boolean {
  if (cycle.type !== 'AR') return false
  return cycle.scopeKind === 'all_companies' || cycle.companyIds.includes(companyId)
}

/** รอบจ่ายนี้ใช้กับฝั่งทีมนี้ไหม */
export function cycleCoversSide(cycle: CycleScopeValues, side: 'inhouse' | 'outsource'): boolean {
  if (cycle.type !== 'AP') return false
  return cycle.scopeKind === 'all_teams' || cycle.scopeKind === side
}

/**
 * รอบที่ตรงให้อัตโนมัติ (ตอนสร้างรอบวางบิล/รอบจ่าย — ผู้ใช้แก้ได้) — รอบที่ระบุเจาะจงชนะรอบ "ทั้งหมด"
 * (ปกติมีได้รอบเดียวเพราะห้ามขอบเขตซ้อน แต่รอบเก่าก่อนมติอาจยังซ้อนอยู่)
 */
export function pickMatchingCycle<T extends CycleScopeValues>(
  cycles: readonly T[],
  target: { companyId: string } | { side: 'inhouse' | 'outsource' },
): T | null {
  const matches = cycles.filter((cycle) =>
    'companyId' in target ? cycleCoversCompany(cycle, target.companyId) : cycleCoversSide(cycle, target.side),
  )
  const specific = matches.find((cycle) => cycle.scopeKind !== 'all_companies' && cycle.scopeKind !== 'all_teams')
  return specific ?? matches[0] ?? null
}

/** ข้อความ "ใช้กับ" ที่แสดงในตาราง — รายบริษัทแสดงชื่อบริษัท */
export function describeCycleScope(scopeKind: CycleScopeKind, companyNames: readonly string[]): string {
  if (scopeKind === 'selected_companies' && companyNames.length > 0) return companyNames.join(', ')
  return CYCLE_SCOPE_LABEL[scopeKind]
}
