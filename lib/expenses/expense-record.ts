import { ExpenseRecordError } from '@/lib/expenses/errors'
import { EXPENSE_TYPE_LABEL } from '@/lib/field/expense-ui'
import type { ExpenseType } from '@/lib/generated/prisma/enums'
import type { StatusBadgeGroup } from '@/lib/ui/status-badge'

/**
 * บัญชีค่าใช้จ่าย (ไฟล์ 32) — **pure ล้วน ไม่มี I/O** ใช้ร่วม FE/BE
 *
 * ### กติกาที่ห้ามหลุด
 * - **sync เฉพาะรอบจ่ายที่ `completed`** (`32` §6.1/§9) — บัญชีบันทึกตาม *เงินที่จ่ายจริง*
 *   ไม่ใช่ยอดที่อนุมัติแล้วแต่ยังไม่โอน ⇒ ตัวตัดสินอยู่ที่ `isSyncableBatchStatus()`
 * - **ห้ามแก้ยอดเงินตรงในโมดูลนี้เด็ดขาด** (`32` §10/§11) — `gross/wht/net` เป็น snapshot จาก
 *   `payout_batch_items` (ไฟล์ 17) ถ้าต้องแก้ต้องผ่าน Adjustment (ไฟล์ 20) ⇒ `EDIT_AMOUNT_DIRECTLY`
 * - **Cost Center แก้ได้เฉพาะรายการที่ map แบบ `manual`** (`32` §10/§11) — `auto` ต้องไปแก้ที่ทีม
 *   ของ payee ต้นทาง ⇒ `COST_CENTER_AUTO_EDIT`
 * - **เอกสารไม่ครบ (`incomplete`) ⇒ ขึ้น exception ของไฟล์ 34 อัตโนมัติ** (`32` §6.3/§9)
 *
 * ### สิ่งที่ยังไม่มีในสคีมา (`02` ชนะไฟล์ 32 ตามลำดับเอกสารขัดกัน — ดู `02_OPEN_DECISIONS` D14)
 * ตาราง `expense_records` ของ `02` §9 มีแค่ `period_id / payout_batch_item_id / cost_center_id /
 * gross_satang / wht_satang / net_satang` — **ไม่มีคอลัมน์** `payee_name`, `category`,
 * `payment_date`, `document_status`, `mapping_rule` ที่ `32` §7.1 เขียนไว้ ⇒ 5 ฟิลด์นี้
 * **derive ตอนอ่าน** จากต้นทาง (`payout_batch_items` → `expenses`/`advances` → `payee_profiles`)
 * ด้วยฟังก์ชันในไฟล์นี้ — ยอดเงินยัง snapshot จริงในตารางเหมือนเดิม (ฝั่งที่ห้ามเปลี่ยนย้อนหลัง)
 * · ผลข้างเคียงที่รับไว้: `payee_name` ไม่ใช่ snapshot จริง (แก้ชื่อ payee แล้วรายการเก่าจะแสดงชื่อใหม่)
 */

// ── สิทธิ์ (`25` §7.5 · `32` §12) ────────────────────────────────────────────

/** map Cost Center (manual) = บัญชีเท่านั้น (`25` §7.5) */
export const MAP_COST_CENTER = 'map_cost_center'
/** รายการค่าใช้จ่าย — บัญชี manage · การเงิน view (`25` §7.5 · `32` §12) */
export const MANAGE_SALES_EXPENSES = 'manage_sales_expenses'

/** ผู้ที่เปิดดูรายการค่าใช้จ่ายได้ (`32` §12 — การเงินอ่านอย่างเดียว) */
export const EXPENSE_RECORD_READ_CAPABILITIES = [MANAGE_SALES_EXPENSES, MAP_COST_CENTER] as const

// ── sync gate (`32` §6.1) ───────────────────────────────────────────────────

/** สถานะรอบจ่ายที่ sync เข้าบัญชีค่าใช้จ่ายได้ — `completed` เท่านั้น (`32` §6.1 · §16) */
export function isSyncableBatchStatus(status: string): boolean {
  return status === 'completed'
}

// ── ประเภทค่าใช้จ่าย (`32` §7.1 `category`) ─────────────────────────────────

/** รายการที่มาจากเงินทดรองจ่าย (`17` §7.2 แหล่งที่มา ② — A4) ไม่มี `expense_type` ของตัวเอง */
export const ADVANCE_CATEGORY_LABEL = 'เงินทดรองจ่าย'

/**
 * ประเภทค่าใช้จ่ายของรายการ — ป้ายไทยจากทะเบียนกลาง `EXPENSE_TYPE_LABEL` (`41` §6.6)
 * ห้ามตั้งชื่อประเภทใหม่ที่นี่ (ไม่มี enum ของตัวเองใน `02`)
 */
export function expenseCategoryOf(source: { expenseType: ExpenseType | null }): string {
  return source.expenseType === null ? ADVANCE_CATEGORY_LABEL : EXPENSE_TYPE_LABEL[source.expenseType]
}

// ── ความครบถ้วนของเอกสาร (`32` §6.3) ────────────────────────────────────────

export type DocumentStatus = 'complete' | 'incomplete'

/**
 * ประเภทที่ **บังคับแนบใบเสร็จ** ตาม `41` §6.6 (รายการ "เบิกแยก")
 * — `hotel` (ที่พัก) และ `receipt` (เบิกตามใบเสร็จ) · ประเภทที่ระบบคำนวณจากแผนค่าตอบแทน
 * (`fuel`/`allowance`/`commission`/`no_success_fee`) ใช้หลักฐานการปิดงานของไฟล์ 41 แทน
 */
export const RECEIPT_REQUIRED_EXPENSE_TYPES: readonly ExpenseType[] = ['hotel', 'receipt']

export function requiresReceipt(expenseType: ExpenseType | null): boolean {
  return expenseType !== null && RECEIPT_REQUIRED_EXPENSE_TYPES.includes(expenseType)
}

export interface DocumentSource {
  /** `null` = รายการนี้มาจากเงินทดรองจ่าย (ไม่มีใบเสร็จผูกกับการจ่าย) */
  expenseType: ExpenseType | null
  receiptFileUrl: string | null
}

/**
 * เอกสารประกอบครบหรือไม่ (`32` §6.3) — ครบ = พร้อมรวมเข้า Accounting Pack
 * ไม่ครบ ⇒ ต้องขึ้น exception ของไฟล์ 34 (`32` §9)
 */
export function resolveDocumentStatus(source: DocumentSource): DocumentStatus {
  if (!requiresReceipt(source.expenseType)) return 'complete'
  return source.receiptFileUrl !== null && source.receiptFileUrl.trim() !== '' ? 'complete' : 'incomplete'
}

export const DOCUMENT_STATUS_LABEL: Readonly<Record<DocumentStatus, string>> = {
  complete: 'ครบ',
  incomplete: 'ไม่ครบ',
}

/** สีป้ายตาม mapper กลาง (`04` §8.1) — ครบ = เขียว · ไม่ครบ = แดง (ต้องตามเก็บก่อนปิดงวด) */
export const DOCUMENT_STATUS_GROUP: Readonly<Record<DocumentStatus, StatusBadgeGroup>> = {
  complete: 'success',
  incomplete: 'critical',
}

// ── Cost Center mapping (`32` §6.2/§10) ─────────────────────────────────────

export type CostCenterMappingRule = 'auto' | 'manual'

export const MAPPING_RULE_LABEL: Readonly<Record<CostCenterMappingRule, string>> = {
  auto: 'Auto',
  manual: 'Manual',
}

/**
 * `mapping_rule` ของรายการ (`13` §6.6 · `32` §6.2) — **derive ไม่ได้เก็บ**
 *
 * `auto` = ระบบหา Cost Center จากทีมของ payee ได้เอง ⇒ บัญชีแก้เองไม่ได้ (`COST_CENTER_AUTO_EDIT`)
 * `manual` = ไม่มีต้นทางอัตโนมัติ ⇒ บัญชีต้องเลือกเอง
 *
 * ⚠️ ปัจจุบัน `02` **ไม่มีเส้นเชื่อมทีม → ศูนย์ต้นทุน** (ทั้ง `teams` และ `cost_centers` ไม่มีคอลัมน์
 *    อ้างถึงกัน — และโครงสร้าง Cost Center จริงยังเป็นคำถามค้างถึงนักบัญชี E1) ⇒ ชั้น DB ส่ง
 *    `autoCostCenterId = null` เสมอ ทุกรายการจึงเป็น `manual` ในทางปฏิบัติ · ยาม `auto` ยังอยู่ครบ
 *    และมีเทสต์ พอเพิ่มเส้นเชื่อมเมื่อไรก็ทำงานทันทีโดยไม่ต้องแก้ตรรกะ (บันทึกไว้ที่ D14)
 */
export function resolveMappingRule(input: { autoCostCenterId: string | null }): CostCenterMappingRule {
  return input.autoCostCenterId === null ? 'manual' : 'auto'
}

/** แก้ Cost Center ได้เฉพาะรายการที่ `manual` (`32` §10/§11) */
export function assertCostCenterEditable(rule: CostCenterMappingRule, expenseRecordId: string): void {
  if (rule === 'auto') {
    throw new ExpenseRecordError('COST_CENTER_AUTO_EDIT', {
      detail: `expense_record=${expenseRecordId}`,
    })
  }
}

/**
 * ฟิลด์ยอดเงินที่**ห้ามแก้ผ่านโมดูลนี้** (`32` §10/§11) — รับมาเป็น key ของ body ดิบ
 * เพื่อให้ผู้เรียกได้ code `EDIT_AMOUNT_DIRECTLY` ตรงตามสเปค ไม่ใช่ field error ทั่วไปของ Zod
 */
export const READONLY_AMOUNT_FIELDS: readonly string[] = [
  'grossSatang',
  'whtSatang',
  'netSatang',
  'gross_satang',
  'wht_satang',
  'net_satang',
]

export function assertNoAmountEdit(body: unknown): void {
  if (typeof body !== 'object' || body === null) return
  const touched = READONLY_AMOUNT_FIELDS.filter((field) => Object.hasOwn(body, field))
  if (touched.length > 0) {
    throw new ExpenseRecordError('EDIT_AMOUNT_DIRECTLY', { context: { fields: touched } })
  }
}

// ── exception อัตโนมัติของเอกสารไม่ครบ (`32` §9 · ไฟล์ 34) ─────────────────

/** `source_module` ของ exception ที่โมดูลนี้สร้าง — ป้ายเดียวกับ mockup (`accounting.html` EX-004) */
export const EXPENSE_EXCEPTION_MODULE = 'expense'

export interface DocumentExceptionInput {
  /** เลขอ้างอิงที่มนุษย์ตามต่อได้ — ชื่อผู้รับเงิน + รอบจ่าย */
  payeeName: string
  batchName: string
  category: string
  expenseRecordId: string
}

/**
 * เนื้อหา exception ของรายการที่เอกสารไม่ครบ — **`warning` ไม่ใช่ `critical`**
 * (`34` §6.1: critical = บล็อก Export · ใบเสร็จที่ตามเก็บทีหลังได้ไม่ควรบล็อกทั้งรอบ
 * ตรงกับ mockup EX-004 ที่ตั้งไว้เป็น warning)
 */
export function buildDocumentException(input: DocumentExceptionInput): {
  level: 'warning'
  title: string
  description: string
  sourceModule: string
  sourceRef: string
} {
  return {
    level: 'warning',
    title: `เอกสารประกอบการจ่ายไม่ครบ — ${input.payeeName}`,
    description:
      `รายการ "${input.category}" ของ ${input.payeeName} ในรอบจ่าย ${input.batchName} ` +
      'ยังไม่มีใบเสร็จ/หลักฐานการจ่ายแนบ — ตามเก็บจากผู้เบิกก่อนส่งชุดเอกสารให้สำนักงานบัญชี (`32` §6.3)',
    sourceModule: EXPENSE_EXCEPTION_MODULE,
    sourceRef: input.expenseRecordId,
  }
}

// ── สรุปยอดหัวตาราง (`32` §8) ───────────────────────────────────────────────

export interface ExpenseAmountRow {
  grossSatang: number
  whtSatang: number
  netSatang: number
  documentStatus: DocumentStatus
  costCenterId: string | null
}

export interface ExpenseSummary {
  count: number
  grossSatang: number
  whtSatang: number
  netSatang: number
  incompleteCount: number
  unmappedCount: number
}

/** รวมยอดฝั่ง server ครั้งเดียว — ห้ามคำนวณเงินซ้ำที่ display layer (Rule 01) */
export function summarizeExpenseRecords(rows: readonly ExpenseAmountRow[]): ExpenseSummary {
  return rows.reduce<ExpenseSummary>(
    (summary, row) => ({
      count: summary.count + 1,
      grossSatang: summary.grossSatang + row.grossSatang,
      whtSatang: summary.whtSatang + row.whtSatang,
      netSatang: summary.netSatang + row.netSatang,
      incompleteCount: summary.incompleteCount + (row.documentStatus === 'incomplete' ? 1 : 0),
      unmappedCount: summary.unmappedCount + (row.costCenterId === null ? 1 : 0),
    }),
    { count: 0, grossSatang: 0, whtSatang: 0, netSatang: 0, incompleteCount: 0, unmappedCount: 0 },
  )
}
