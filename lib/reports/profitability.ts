import { assertSatang, sumSatang } from '@/lib/finance/satang'
import { summarizeGrossProfit, type GrossProfitBreakdown, type GrossProfitRow } from '@/lib/finance/gross-profit'
import type { ExpenseType } from '@/lib/generated/prisma/enums'

/**
 * รายงานกำไรขั้นต้น (ไฟล์ 21) — ชั้น **pure ล้วน ไม่มี I/O**
 * (สูตรเงินอยู่ที่ `lib/finance/gross-profit.ts` (`22` §6.12) — ที่นี่คือการ "จัดกลุ่มตามมิติ" เท่านั้น)
 *
 * ### กติกาที่ห้ามหลุด
 * - **Actual ไม่ใช่ projection** (`21` §6.1 · §17) — นับเฉพาะรายได้/ต้นทุนที่เกิดจริงแล้ว
 *   ไม่เกี่ยวกับ `cases.projected_revenue_amount` ของไฟล์ 38
 * - **มิติที่มีแต่ต้นทุนต้องอยู่ในรายงาน** — เคส `closed_fail` ที่จ่ายค่าน้ำมัน/เบี้ยเลี้ยงไปแล้ว
 *   แต่ไม่มีรายได้ ต้องกด margin ลงจริง **ห้ามกรองทิ้ง** (`21` §6.1 · §16)
 * - **Direct Cost = fuel + allowance + commission/no_success_fee เท่านั้น** (`22` §6.12 · `21` §4)
 *   — ค่าที่พัก/ใบเสร็จ/รายการ manual เป็นต้นทุนที่ผูกกับเคสไม่ได้ ⇒ อยู่นอกรายงานนี้
 * - `revenue = 0` ⇒ `marginPct = null` (`fmtRatioPct(null)` = `N/A`) **ห้ามหารศูนย์** (Rule 01)
 */

export const PROFIT_DIMENSIONS = ['company', 'team'] as const
export type ProfitDimension = (typeof PROFIT_DIMENSIONS)[number]

export const PROFIT_DIMENSION_LABEL: Readonly<Record<ProfitDimension, string>> = {
  company: 'บริษัทไฟแนนซ์',
  team: 'ทีม',
}

/** ต้นทุนตรงตาม `22` §6.12 — ชนิดอื่นของ `expense_type` ไม่นับเป็นต้นทุนตรงของรายงานนี้ */
export const DIRECT_COST_EXPENSE_TYPES = ['fuel', 'allowance', 'commission', 'no_success_fee'] as const
export type DirectCostExpenseType = (typeof DIRECT_COST_EXPENSE_TYPES)[number]

export const DIRECT_COST_TYPE_LABEL: Readonly<Record<DirectCostExpenseType, string>> = {
  fuel: 'ค่าน้ำมัน',
  allowance: 'เบี้ยเลี้ยง',
  commission: 'ค่าคอมมิชชั่น (ปิดสำเร็จ)',
  no_success_fee: 'ค่าตอบแทนเคสไม่สำเร็จ (No-Success Fee)',
}

export function isDirectCostExpenseType(type: ExpenseType): type is DirectCostExpenseType {
  return (DIRECT_COST_EXPENSE_TYPES as readonly ExpenseType[]).includes(type)
}

/** รายได้ 1 ใบที่ถูกจัดเข้ามิติแล้ว (ยอด**หลังปรับปรุง**แล้วเสมอ — ผู้เรียกใช้ `netAfterAdjustments()`) */
export interface ProfitRevenueEntry {
  /** คีย์มิติ — `NULL` ไม่ได้ เพราะรายได้ผูกบริษัทเสมอ · มิติทีมใช้ทีมที่รับผิดชอบเคส */
  key: string | null
  label: string | null
  /** ยอดก่อน VAT (`22` §6.12 — VAT ไม่ใช่รายได้ของบริษัท) */
  revenueSatang: number
  caseId: string
}

/** ค่าตอบแทน 1 รายการที่ถูกจัดเข้ามิติแล้ว (ยอดหลังปรับปรุงแล้วเช่นกัน) */
export interface ProfitCostEntry {
  key: string | null
  label: string | null
  expenseType: DirectCostExpenseType
  grossSatang: number
  caseId: string | null
}

export interface ProfitabilityRow extends GrossProfitRow {
  key: string
  label: string
  /** จำนวนเคสที่มีรายได้จริงในมิตินี้ (นับแบบไม่ซ้ำ) */
  revenueCaseCount: number
  /** จำนวนเคสที่มีต้นทุนตรงในมิตินี้ (นับแบบไม่ซ้ำ — รวมเคสที่ไม่มีรายได้) */
  costCaseCount: number
}

export interface ProfitabilityBreakdown {
  rows: readonly (ProfitabilityRow & { grossProfitSatang: number; marginPct: number | null })[]
  total: GrossProfitBreakdown['total']
}

const UNASSIGNED_KEY = '__unassigned__'
const UNASSIGNED_LABEL = 'ไม่ระบุมิติ'

interface Bucket {
  key: string
  label: string
  revenueSatang: number
  directCostSatang: number
  revenueCases: Set<string>
  costCases: Set<string>
}

function bucketOf(buckets: Map<string, Bucket>, key: string | null, label: string | null): Bucket {
  const id = key ?? UNASSIGNED_KEY
  const existing = buckets.get(id)
  if (existing !== undefined) {
    // ป้ายจากรายการหลัง ๆ ไม่ทับของเดิม (ป้ายเดียวกันเสมอสำหรับ key เดียวกัน)
    return existing
  }
  const created: Bucket = {
    key: id,
    label: key === null ? UNASSIGNED_LABEL : (label ?? id),
    revenueSatang: 0,
    directCostSatang: 0,
    revenueCases: new Set(),
    costCases: new Set(),
  }
  buckets.set(id, created)
  return created
}

/**
 * รวมรายได้ + ต้นทุนตรงเป็นตารางรายงานตามมิติ แล้วต่อสูตร `22` §6.12
 *
 * มิติที่มี**ต้นทุนอย่างเดียว** (เคส `closed_fail`) ยังอยู่ในผลลัพธ์ — `revenueSatang = 0`
 * ⇒ `marginPct = null` และยังถูกนับเข้ายอดรวมทำให้ margin รวมลดลงจริงตาม `21` §6.1
 *
 * เรียงจากกำไรมากไปน้อย (มิติที่ขาดทุนอยู่ท้ายตาราง — ผู้บริหารเห็นตัวปัญหาได้ทันที)
 */
export function summarizeProfitability(
  revenues: readonly ProfitRevenueEntry[],
  costs: readonly ProfitCostEntry[],
): ProfitabilityBreakdown {
  const buckets = new Map<string, Bucket>()

  for (const entry of revenues) {
    assertSatang(entry.revenueSatang, 'รายได้')
    const bucket = bucketOf(buckets, entry.key, entry.label)
    bucket.revenueSatang += entry.revenueSatang
    bucket.revenueCases.add(entry.caseId)
  }

  for (const entry of costs) {
    assertSatang(entry.grossSatang, 'ต้นทุนตรง')
    const bucket = bucketOf(buckets, entry.key, entry.label)
    bucket.directCostSatang += entry.grossSatang
    if (entry.caseId !== null) bucket.costCases.add(entry.caseId)
  }

  const rows: ProfitabilityRow[] = [...buckets.values()].map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    revenueSatang: bucket.revenueSatang,
    directCostSatang: bucket.directCostSatang,
    revenueCaseCount: bucket.revenueCases.size,
    costCaseCount: bucket.costCases.size,
  }))

  const summary = summarizeGrossProfit(rows)
  const merged = summary.rows
    .map((row, index) => ({ ...(rows[index] as ProfitabilityRow), ...row }))
    .sort((a, b) => b.grossProfitSatang - a.grossProfitSatang || a.label.localeCompare(b.label, 'th'))

  return { rows: merged, total: summary.total }
}

// ── Drill-down (`21` §3 · §8 "ปุ่มเจาะลึก") ─────────────────────────────────

export interface CostBreakdownRow {
  expenseType: DirectCostExpenseType
  label: string
  /** จำนวนรายการเบิกของชนิดนี้ */
  count: number
  amountSatang: number
}

/**
 * แยกต้นทุนตรงตามชนิด (`21` §8 modal "เจาะลึก") — เรียงตามลำดับที่ประกาศไว้เสมอ
 * เพื่อให้หน้าจอไม่สลับแถวไปมาเมื่อยอดเปลี่ยน · ชนิดที่ไม่มีรายการเลยจะไม่ถูกใส่มา
 */
export function summarizeCostBreakdown(costs: readonly ProfitCostEntry[]): readonly CostBreakdownRow[] {
  return DIRECT_COST_EXPENSE_TYPES.map((expenseType) => {
    const items = costs.filter((entry) => entry.expenseType === expenseType)
    return {
      expenseType,
      label: DIRECT_COST_TYPE_LABEL[expenseType],
      count: items.length,
      amountSatang: sumSatang(items.map((item) => item.grossSatang), `ต้นทุน ${expenseType}`),
    }
  }).filter((row) => row.count > 0)
}

/**
 * เคสที่ "มีต้นทุนแต่ไม่มีรายได้" — ตัวเลขที่ `21` §16 ให้พิสูจน์ว่าเคสไม่สำเร็จลด margin จริง
 * (ใช้แสดงหมายเหตุใต้ modal เจาะลึก ไม่ได้มีผลต่อการคำนวณ — การคำนวณรวมมันอยู่แล้ว)
 */
export function countCasesWithCostOnly(
  revenues: readonly ProfitRevenueEntry[],
  costs: readonly ProfitCostEntry[],
): { caseCount: number; costSatang: number } {
  const earning = new Set(revenues.map((entry) => entry.caseId))
  const lossMaking = costs.filter((entry) => entry.caseId !== null && !earning.has(entry.caseId))
  return {
    caseCount: new Set(lossMaking.map((entry) => entry.caseId)).size,
    costSatang: sumSatang(lossMaking.map((entry) => entry.grossSatang), 'ต้นทุนเคสที่ไม่มีรายได้'),
  }
}
