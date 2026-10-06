import { z } from 'zod'
import {
  DEFAULT_SUBSTITUTE_RECEIPT_MAX_PER_DOC_SATANG,
  DEFAULT_SUBSTITUTE_RECEIPT_MAX_PER_MONTH_SATANG,
} from '@/lib/substitute-receipts/substitute-receipt'
import { dateOnlySchema, pctSchema, reasonSchema, satangSchema } from '@/lib/api/validation'
import { MAX_APPROVAL_STEPS, duplicateApprovalSteps } from '@/lib/settings/approval-matrix'
import { thaiBankByCode } from '@/lib/banks/thai-banks'
import { ACCOUNT_TYPE_VALUES, MAX_AUTO_MATCH_TOLERANCE_DAYS } from '@/lib/settings/bank-account'
import {
  BANK_FILE_PURPOSES,
  BANK_FILE_PURPOSE_LABEL,
  isColumnOfPurpose,
  parseColumnMapping,
} from '@/lib/settings/bank-file'
import { MAX_CUTOFF_DAY, MIN_CUTOFF_DAY, describeDueRule, isScopeKindValidForType } from '@/lib/settings/cycles'
import {
  MAX_AGING_BUCKETS,
  MAX_AGING_BUCKET_DAYS,
  MIN_AGING_BUCKETS,
} from '@/lib/settings/finance-policy'
import {
  DOCUMENT_NUMBER_TYPES,
  MAX_DIGITS,
  MAX_PREFIX_LENGTH,
  MIN_DIGITS,
  PREFIX_PATTERN,
} from '@/lib/document-numbering/format'
import {
  MAX_ACCEPT_DEADLINE_HOURS,
  MAX_REASSIGN_TIMEOUT_HOURS,
  MIN_ACCEPT_DEADLINE_HOURS,
  MIN_REASSIGN_TIMEOUT_HOURS,
} from '@/lib/settings/assignment-policy'
import { MAX_SLA_ALERT_HOURS, MIN_SLA_ALERT_HOURS } from '@/lib/settings/sla-policy'
import {
  MAX_DEBTOR_DOCUMENT_RETENTION_YEARS,
  MIN_DEBTOR_DOCUMENT_RETENTION_YEARS,
  retentionYearsRangeMessage,
} from '@/lib/settings/data-retention'
import { MAX_FOOTER_NOTE_LENGTH } from '@/lib/settings/tax-doc-template'
import { MAX_HOLIDAY_IMPORT_ROWS, MAX_HOLIDAY_NAME_LENGTH } from '@/lib/settings/holidays'
import { TAX_PROFILE_INCOME_TYPE_CODES, WHT_BASIS_VALUES } from '@/lib/settings/tax-profile'
import {
  WHT_CERTIFICATE_MODES,
  WHT_FILING_METHODS,
  WHT_INCOME_TYPE_MODES,
  WHT_POLICY_EXPENSE_TYPES,
  WHT_TEAM_SIDE_INCOME_CATEGORIES,
} from '@/lib/settings/wht-policy'

/**
 * Zod schema ชุดเดียวใช้ร่วม FE/BE ของการตั้งค่าการเงิน/บัญชี (ไฟล์ 13 · Rule 04 · Rule 13)
 *
 * **`reason` บังคับทุก mutation ของทั้ง 13 หมวด** — `lib/audit/reason-policy.ts` จัดทุกตารางในไฟล์นี้
 * เป็น master/ตั้งค่า (money/permission/bank/tax) ⇒ ไม่มี endpoint ไหนที่แก้ได้โดยไม่มีเหตุผล
 *
 * รูปร่างเงื่อนไข (conditional shape) ที่ต้องตรงกับ CHECK ระดับ DB อยู่ใน pure module ของหมวดนั้น
 * แล้วถูกเรียกซ้ำที่นี่ผ่าน `superRefine` — ห้าม inline เงื่อนไขซ้ำในไฟล์นี้
 */

/** ตัว refine ที่ใช้ร่วมได้ระหว่าง schema ฝั่งฟอร์ม (ไม่มี `reason`) และ schema ของ API */
type RefineFn<T> = (values: T, ctx: z.RefinementCtx) => void

const uuidSchema = z.string().guid('รูปแบบรหัสไม่ถูกต้อง')
const nameSchema = z.string().trim().min(2, 'ชื่อสั้นเกินไป').max(120, 'ชื่อยาวเกินไป')
/** ช่องข้อความสั้นที่ยอมให้ว่างได้ — ฟอร์มส่ง `''` มาเสมอ ต้องแปลงเป็น null **ก่อน** ตรวจรูปแบบ */
const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().trim().max(max, `ข้อความยาวเกิน ${max} ตัวอักษร`).nullable().default(null),
  )
/** อ้าง record ด้วย id ที่ยอมให้ว่าง — `''`/ไม่ส่ง = null */
const optionalUuid = (message: string) =>
  z.preprocess(
    (value) => (value === undefined || (typeof value === 'string' && value.trim() === '') ? null : value),
    z.string().trim().guid(message).nullable(),
  )

// ── §6.1 รอบบิล/รอบจ่าย ────────────────────────────────────────────────
export const cycleTypeSchema = z.enum(['AR', 'AP'])
/** มติ PO U146 — ตัด `custom_text` (กติกาต้องคำนวณวันตัดรอบได้) */
export const cutoffRuleTypeSchema = z.enum(['fixed_dates', 'month_end'])
export const dueRuleTypeSchema = z.enum(['net_days', 'day_of_next_month', 'month_end'])
export const cycleScopeKindSchema = z.enum(['all_companies', 'selected_companies', 'all_teams', 'inhouse', 'outsource'])

const cycleFieldsBase = z.object({
  name: nameSchema,
  type: cycleTypeSchema,
  cutoffRuleType: cutoffRuleTypeSchema,
  cutoffDates: z
    .array(
      z
        .number()
        .int('วันที่ตัดรอบต้องเป็นจำนวนเต็ม')
        .min(MIN_CUTOFF_DAY, `วันที่ตัดรอบต้องอยู่ระหว่าง ${MIN_CUTOFF_DAY}-${MAX_CUTOFF_DAY}`)
        .max(MAX_CUTOFF_DAY, `วันที่ตัดรอบต้องอยู่ระหว่าง ${MIN_CUTOFF_DAY}-${MAX_CUTOFF_DAY}`),
    )
    .max(MAX_CUTOFF_DAY, 'ระบุวันที่ตัดรอบเกินจำนวนวันในเดือน')
    .default([]),
  dueRuleType: dueRuleTypeSchema,
  // net_days รับ 0 ได้ (ครบกำหนดวันตัดรอบ — มติ PO U146) · day_of_next_month ≥ 1 ตรวจใน refine
  dueRuleValue: z
    .number()
    .int('ค่าของเงื่อนไขต้องเป็นจำนวนเต็ม')
    .min(0, 'ค่าของเงื่อนไขต้องไม่ติดลบ')
    .max(365, 'ค่าของเงื่อนไขมากเกินไป')
    .nullable()
    .default(null),
  /** ขอบเขตจริง (มติ PO U133) — ต้องเข้าคู่กับชนิดรอบ (CHECK `cycles_scope_matches_type`) */
  scopeKind: cycleScopeKindSchema,
  /** บริษัทที่รอบบิลใช้ — บังคับอย่างน้อย 1 เมื่อ `selected_companies` · ชนิดอื่นถูกล้างเป็น [] */
  companyIds: z.array(z.guid()).max(500, 'เลือกบริษัทมากเกินไป').default([]),
})

/** ตัวตรวจรูปร่างเงื่อนไข — ใช้ร่วมทั้ง schema ฝั่งฟอร์มและ schema ที่มี `reason` (ห้าม copy) */
const refineCycle: RefineFn<z.infer<typeof cycleFieldsBase>> = (values, ctx) => {
  // ตรงกับ CHECK `cycles_cutoff_shape` — ค่าที่ไม่เข้าคู่กับชนิดต้องถูกปฏิเสธที่ API ก่อนถึง DB
  if (values.cutoffRuleType === 'fixed_dates' && values.cutoffDates.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['cutoffDates'], message: 'เลือกวันที่ตัดรอบอย่างน้อย 1 วัน' })
  }
  // ตรงกับ CHECK `cycles_due_rule_shape` (A5)
  if (values.dueRuleType !== 'month_end' && values.dueRuleValue === null) {
    ctx.addIssue({ code: 'custom', path: ['dueRuleValue'], message: 'ระบุค่าของเงื่อนไขกำหนดชำระ' })
  }
  if (
    values.dueRuleType === 'day_of_next_month' &&
    values.dueRuleValue !== null &&
    (values.dueRuleValue < 1 || values.dueRuleValue > MAX_CUTOFF_DAY)
  ) {
    ctx.addIssue({ code: 'custom', path: ['dueRuleValue'], message: `วันที่ต้องอยู่ระหว่าง 1-${MAX_CUTOFF_DAY}` })
  }
  // มติ PO U133 — ขอบเขตต้องเข้าคู่กับชนิดรอบ (ตรงกับ CHECK `cycles_scope_matches_type`)
  if (!isScopeKindValidForType(values.type, values.scopeKind)) {
    ctx.addIssue({
      code: 'custom',
      path: ['scopeKind'],
      message: values.type === 'AR' ? 'รอบบิลใช้กับบริษัทไฟแนนซ์เท่านั้น' : 'รอบจ่ายใช้กับฝั่งทีมเท่านั้น',
    })
  }
  if (values.scopeKind === 'selected_companies' && values.companyIds.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['companyIds'], message: 'เลือกบริษัทที่ใช้รอบนี้อย่างน้อย 1 บริษัท' })
  }
}

export const cycleFieldsSchema = cycleFieldsBase.superRefine(refineCycle)
export const cycleCreateSchema = cycleFieldsBase.extend({ reason: reasonSchema }).superRefine(refineCycle)
export const cycleUpdateSchema = cycleCreateSchema
export const cycleDeleteSchema = z.object({ reason: reasonSchema })
export const cycleListQuerySchema = z.object({
  type: cycleTypeSchema.optional(),
  status: z.enum(['active', 'inactive', 'all']).default('active'),
})

/** label `due_rule` ที่เก็บลง DB — ไม่ให้ผู้ใช้พิมพ์เอง เพื่อไม่ให้ label ขัดกับ type/value (A5) */
export function cycleDueRuleLabel(values: z.infer<typeof cycleFieldsSchema>): string {
  return describeDueRule(values)
}

// ── §6.2 สายการอนุมัติ ─────────────────────────────────────────────────
const approvalMatrixFieldsBase = z.object({
  condition: z.string().trim().min(2, 'ระบุชื่อสายอนุมัติ').max(200, 'ชื่อสายอนุมัติยาวเกินไป'),
  /** เพดานเงินเป็น **satang** เสมอ (Rule 01) — FE แปลงจากบาทด้วย `parseBahtInput()` ก่อนส่ง */
  conditionThresholdSatang: satangSchema('เพดานเงิน').nullable().default(null),
  /** role id ต่อขั้น (มติ PO U149) — ตรวจว่าเป็น role ผู้อนุมัติที่มีจริงในองค์กรที่ชั้น DB อีกชั้น */
  approvalFlowRoleIds: z
    .array(z.string().trim().uuid('เลือกบทบาทผู้อนุมัติจากรายการ'))
    .min(1, 'ต้องมีขั้นอนุมัติอย่างน้อย 1 ขั้น')
    .max(MAX_APPROVAL_STEPS, `ขั้นอนุมัติได้ไม่เกิน ${MAX_APPROVAL_STEPS} ขั้น`),
  enforceSegregationOfDuties: z.boolean().default(false),
})

const refineApprovalMatrix: RefineFn<z.infer<typeof approvalMatrixFieldsBase>> = (values, ctx) => {
  const duplicates = duplicateApprovalSteps(values.approvalFlowRoleIds.map((id) => id.trim()))
  if (values.enforceSegregationOfDuties && duplicates.length > 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['approvalFlowRoleIds'],
      message: 'บังคับแยกหน้าที่แล้วใส่บทบาทเดียวกันซ้ำหลายขั้นไม่ได้',
    })
  }
}

export const approvalMatrixFieldsSchema = approvalMatrixFieldsBase.superRefine(refineApprovalMatrix)
export const approvalMatrixCreateSchema = approvalMatrixFieldsBase
  .extend({ reason: reasonSchema })
  .superRefine(refineApprovalMatrix)
export const approvalMatrixUpdateSchema = approvalMatrixCreateSchema
export const approvalMatrixDeleteSchema = z.object({ reason: reasonSchema })

// ── §6.2.1 นโยบายการเงินระดับองค์กร (1 record/องค์กร) ───────────────────
const financePolicyFields = z.object({
  advanceMaxAmountPerRequestSatang: satangSchema('เพดานเงินทดรองจ่ายต่อครั้ง').nullable().default(null),
  requirePayeeIdDocument: z.boolean(),
  arAgingBuckets: z
    .array(
      z
        .number()
        .int('ช่วงอายุหนี้ต้องเป็นจำนวนเต็มวัน')
        .min(1, 'ช่วงอายุหนี้ต้องมากกว่า 0 วัน')
        .max(MAX_AGING_BUCKET_DAYS, 'ช่วงอายุหนี้มากเกินไป'),
    )
    .min(MIN_AGING_BUCKETS, 'ต้องมีช่วงอายุหนี้อย่างน้อย 1 ช่วง')
    .max(MAX_AGING_BUCKETS, `ช่วงอายุหนี้ได้ไม่เกิน ${MAX_AGING_BUCKETS} ช่วง`),
  writeOffToleranceSatang: satangSchema('เพดานตัดส่วนต่างค่าธรรมเนียม'),
  // มติ PO U103 — เพดานใบรับรองแทนใบเสร็จ (ต้องมากกว่า 0 · ไม่ส่ง = ค่าเริ่มต้น)
  substituteReceiptMaxPerDocSatang: satangSchema('เพดานใบรับรองแทนใบเสร็จต่อใบ')
    .refine((value) => value > 0, 'เพดานใบรับรองแทนใบเสร็จต่อใบต้องมากกว่า 0')
    .default(DEFAULT_SUBSTITUTE_RECEIPT_MAX_PER_DOC_SATANG),
  substituteReceiptMaxPerMonthSatang: satangSchema('เพดานใบรับรองแทนใบเสร็จต่อเดือน')
    .refine((value) => value > 0, 'เพดานใบรับรองแทนใบเสร็จต่อเดือนต้องมากกว่า 0')
    .default(DEFAULT_SUBSTITUTE_RECEIPT_MAX_PER_MONTH_SATANG),
})

export const financePolicyFieldsSchema = financePolicyFields
export const financePolicyUpdateSchema = financePolicyFields.extend({ reason: reasonSchema })

// ── §6.14 เกณฑ์ SLA งานติดตาม (1 record/องค์กร · D18) ────────────────────
const slaPolicyFields = z.object({
  slaAlertHours: z
    .number()
    .int('เกณฑ์ SLA ต้องเป็นจำนวนเต็มชั่วโมง')
    .min(MIN_SLA_ALERT_HOURS, `เกณฑ์ SLA ต้องอย่างน้อย ${MIN_SLA_ALERT_HOURS} ชั่วโมง`)
    .max(MAX_SLA_ALERT_HOURS, `เกณฑ์ SLA ต้องไม่เกิน ${MAX_SLA_ALERT_HOURS} ชั่วโมง`),
})

export const slaPolicyFieldsSchema = slaPolicyFields
export const slaPolicyUpdateSchema = slaPolicyFields.extend({ reason: reasonSchema })

// ── §6.16 ระยะเก็บเอกสารลูกหนี้ (PDPA · 1 record/องค์กร · มติ PO U97) ──────
const dataRetentionFields = z.object({
  debtorDocumentRetentionYears: z
    .number(retentionYearsRangeMessage())
    .int(retentionYearsRangeMessage())
    .min(MIN_DEBTOR_DOCUMENT_RETENTION_YEARS, retentionYearsRangeMessage())
    .max(MAX_DEBTOR_DOCUMENT_RETENTION_YEARS, retentionYearsRangeMessage()),
})

export const dataRetentionUpdateSchema = dataRetentionFields.extend({ reason: reasonSchema })

// ── นโยบายการมอบหมายงาน (`40` §6.4/§11 · 1 record/องค์กร · UAT BUG-002) ──────
const assignmentPolicyFields = z.object({
  reassignTimeoutHours: z
    .number()
    .int('เวลารอความยินยอมต้องเป็นจำนวนเต็มชั่วโมง')
    .min(MIN_REASSIGN_TIMEOUT_HOURS, `เวลารอความยินยอมต้องอย่างน้อย ${MIN_REASSIGN_TIMEOUT_HOURS} ชั่วโมง`)
    .max(MAX_REASSIGN_TIMEOUT_HOURS, `เวลารอความยินยอมต้องไม่เกิน ${MAX_REASSIGN_TIMEOUT_HOURS} ชั่วโมง`),
  supervisorCanAssignSystem: z.boolean(),
  supervisorCanAssignInhouse: z.boolean(),
  supervisorCanAssignOutsource: z.boolean(),
  /** `null` = ไม่จำกัดเวลากดรับงาน (ค่าเริ่มต้นของสเปค) */
  acceptDeadlineHours: z
    .number()
    .int('เส้นตายกดรับงานต้องเป็นจำนวนเต็มชั่วโมง')
    .min(MIN_ACCEPT_DEADLINE_HOURS, `เส้นตายกดรับงานต้องอย่างน้อย ${MIN_ACCEPT_DEADLINE_HOURS} ชั่วโมง`)
    .max(MAX_ACCEPT_DEADLINE_HOURS, `เส้นตายกดรับงานต้องไม่เกิน ${MAX_ACCEPT_DEADLINE_HOURS} ชั่วโมง`)
    .nullable(),
})

export const assignmentPolicyFieldsSchema = assignmentPolicyFields
/** กระทบสิทธิ์ของหัวหน้าทีม ⇒ `reason` บังคับ (`90` §13 · `assignment_policy_settings` = หมวด permission) */
export const assignmentPolicyUpdateSchema = assignmentPolicyFields.extend({ reason: reasonSchema })

// ── §6.3 บัญชีธนาคารบริษัท ─────────────────────────────────────────────
export const bankAccountUsageSchema = z.enum(['receive', 'pay', 'both'])

const bankAccountFields = z.object({
  bankName: nameSchema,
  accountName: nameSchema,
  accountNumber: z
    .string()
    .trim()
    .min(8, 'เลขบัญชีสั้นเกินไป')
    .max(30, 'เลขบัญชียาวเกินไป')
    .regex(/^[\d\s-]+$/, 'เลขบัญชีต้องเป็นตัวเลข (มี - หรือช่องว่างคั่นได้)'),
  accountType: z.enum(ACCOUNT_TYPE_VALUES),
  usage: bankAccountUsageSchema,
  /** อ้างรูปแบบด้วย id (มติ PO U147) — ชนิด statement/payment ตรวจที่ชั้น DB */
  statementFormatId: optionalUuid('เลือกรูปแบบไฟล์ statement จากรายการ'),
  paymentFileFormatId: optionalUuid('เลือกรูปแบบไฟล์โอนจากรายการ'),
  autoMatchToleranceDays: z
    .number()
    .int('จำนวนวันต้องเป็นจำนวนเต็ม')
    .min(0, 'จำนวนวันต้องไม่ติดลบ')
    .max(MAX_AUTO_MATCH_TOLERANCE_DAYS, `จำนวนวันได้ไม่เกิน ${MAX_AUTO_MATCH_TOLERANCE_DAYS} วัน`),
  isPrimary: z.boolean().default(false),
})

export const bankAccountFieldsSchema = bankAccountFields
export const bankAccountCreateSchema = bankAccountFields.extend({ reason: reasonSchema })
export const bankAccountUpdateSchema = bankAccountCreateSchema
export const bankAccountDeleteSchema = z.object({ reason: reasonSchema })
export const bankAccountListQuerySchema = z.object({
  usage: bankAccountUsageSchema.optional(),
  status: z.enum(['active', 'inactive', 'all']).default('active'),
})

// ── §6.4 กติกาภาษี (Tax Profile) ───────────────────────────────────────
export const whtBasisSchema = z.enum(WHT_BASIS_VALUES)
export const whtFilingFormSchema = z.enum(['PND3', 'PND53'])

const taxProfileFields = z.object({
  name: nameSchema,
  /** `INVALID_WHT_RATE` (`13` §10) — 0-100 เท่านั้น · NUMERIC(5,2) */
  whtPct: pctSchema('อัตราหัก ณ ที่จ่าย'),
  whtBasis: whtBasisSchema,
  whtMinThresholdSatang: satangSchema('ยอดขั้นต่ำที่ต้องหัก'),
  /** มติ PO U148 — เลือกจากรายการมาตรฐานตามแบบ 50 ทวิ */
  incomeTypeCode: z.enum(TAX_PROFILE_INCOME_TYPE_CODES, { error: 'เลือกประเภทเงินได้จากรายการ' }),
  /** ข้อความที่ระบุเอง — บังคับเฉพาะ "อื่น ๆ (ระบุ)" · รายการมาตรฐานระบบเขียนป้ายให้ (ค่าที่ส่งมาถูกทิ้ง) */
  incomeType: z.string().trim().max(200, 'ประเภทเงินได้ยาวเกินไป').default(''),
  filingForm: whtFilingFormSchema,
})

const refineTaxProfile: RefineFn<z.infer<typeof taxProfileFields>> = (values, ctx) => {
  if (values.incomeTypeCode === 'other' && values.incomeType.trim().length < 2) {
    ctx.addIssue({ code: 'custom', path: ['incomeType'], message: 'ระบุประเภทเงินได้' })
  }
}

export const taxProfileFieldsSchema = taxProfileFields.superRefine(refineTaxProfile)
export const taxProfileCreateSchema = taxProfileFields.extend({ reason: reasonSchema }).superRefine(refineTaxProfile)
export const taxProfileUpdateSchema = taxProfileCreateSchema
export const taxProfileDeleteSchema = z.object({ reason: reasonSchema })

// ── §6.4.3 Tax Profile ค่าเริ่มต้นตามประเภทผู้รับ (มติ PO U121) ─────────────
/** ว่าง/`null` = ไม่มีค่าเริ่มต้นสำหรับประเภทนั้น */
const defaultSlotSchema = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  z.union([z.string().uuid('เลือก Tax Profile ไม่ถูกต้อง'), z.null()]),
)
export const taxProfileDefaultsCreateSchema = z.object({
  inhouseIndividual: defaultSlotSchema,
  inhouseCorporate: defaultSlotSchema,
  outsourceIndividual: defaultSlotSchema,
  outsourceCorporate: defaultSlotSchema,
  reason: reasonSchema,
})

// ── §6.5 อัตรา VAT (effective-dated) ───────────────────────────────────
const vatRateFieldsBase = z.object({
  ratePct: pctSchema('อัตรา VAT'),
  effectiveFrom: dateOnlySchema('วันที่เริ่มมีผล'),
  effectiveTo: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.union([dateOnlySchema('วันสิ้นสุด'), z.null()]).default(null),
  ),
  note: optionalText(200),
})

const refineVatRate: RefineFn<z.infer<typeof vatRateFieldsBase>> = (values, ctx) => {
  if (values.effectiveTo !== null && values.effectiveTo.getTime() < values.effectiveFrom.getTime()) {
    ctx.addIssue({ code: 'custom', path: ['effectiveTo'], message: 'วันสิ้นสุดต้องไม่มาก่อนวันที่เริ่มมีผล' })
  }
}

export const vatRateFieldsSchema = vatRateFieldsBase.superRefine(refineVatRate)
export const vatRateCreateSchema = vatRateFieldsBase.extend({ reason: reasonSchema }).superRefine(refineVatRate)

/**
 * PATCH ของอัตรา VAT — `vat_rate_history` เป็นตาราง **insert-only ด้านคอลัมน์** (`02` §2.4 ไม่มี
 * `updated_at`/`updated_by`/`deleted_at`) แต่ไม่อยู่ในรายการ immutable ของ `02` §13 ⇒ แก้ได้เท่าที่
 * `13` §13 กำหนดให้มี PATCH โดยมี audit + reason เสมอ (ผู้แก้ตามรอยได้จาก audit log)
 *
 * ที่แก้ได้: ปิดช่วง (`effectiveTo`) · แก้อัตรา/หมายเหตุ — ทุกครั้งตรวจ `VAT_RATE_OVERLAP` ใหม่
 */
export const vatRateUpdateSchema = vatRateCreateSchema

export const vatRateResolveQuerySchema = z.object({ date: dateOnlySchema('วันที่') })

// ── §6.4.2 ค่าตั้งภาษีหัก ณ ที่จ่าย (effective-dated — มติ PO 05/10/2569 UAT U3/U4/U5/U8) ──
export const whtPolicyCreateSchema = z.object({
  /** วันที่มีผล — ย้อนหลังไม่ได้ (ตรวจซ้ำที่ service ด้วยเวลาเซิร์ฟเวอร์ — `WHT_POLICY_EFFECTIVE_DATE_PAST`) */
  effectiveFrom: dateOnlySchema('วันที่มีผล'),
  /** ชนิดรายการที่รวมในฐาน WHT — ว่างได้ (= ไม่มีรายการใดถูกหัก) */
  baseExpenseTypes: z.array(z.enum(WHT_POLICY_EXPENSE_TYPES)).max(WHT_POLICY_EXPENSE_TYPES.length),
  certificateMode: z.enum(WHT_CERTIFICATE_MODES),
  incomeTypeMode: z.enum(WHT_INCOME_TYPE_MODES),
  /** 40(2) อัตรา 0% ⇒ ออก 50 ทวิ ยอดภาษี 0 + รวมใน ภ.ง.ด.1 (มติ PO 05/10/2569 UAT U16) — ไม่ส่ง = ออก (ค่าเริ่มต้น) */
  issueZeroRate402Certificate: z.boolean().default(true),
  /**
   * โหมดแยกตามประเภททีม: ประเภทเงินได้ของ inhouse / outsource (มติ PO 05/10/2569 UAT U33)
   * เลือกได้ 40(1)/40(2)/40(8) แยกกัน · ไม่ส่ง = การจับคู่เดิม (inhouse 40(2) · outsource 40(8))
   */
  inhouseIncomeCategory: z.enum(WHT_TEAM_SIDE_INCOME_CATEGORIES).default('sec_40_2'),
  outsourceIncomeCategory: z.enum(WHT_TEAM_SIDE_INCOME_CATEGORIES).default('sec_40_8'),
  /** อนุญาตเงื่อนไขการหัก (2) ออกให้ตลอดไป / (3) ออกให้ครั้งเดียว (มติ PO 06/10/2569 U105) — ไม่ส่ง = ปิด (ค่าเริ่มต้น) */
  allowGrossUpConditions: z.boolean().default(false),
  /** วิธียื่น ภ.ง.ด. — ออนไลน์ (วันที่ 15) / กระดาษ (วันที่ 7) · ไม่ส่ง = ออนไลน์ (มติ PO 05/10/2569 UAT U45) */
  filingMethod: z.enum(WHT_FILING_METHODS).default('online'),
  reason: reasonSchema,
})

// ── §6.6 ศูนย์ต้นทุน (code = running number อัตโนมัติ) ──────────────────
const costCenterFields = z.object({
  name: nameSchema,
  description: optionalText(300),
  isActive: z.boolean().default(true),
})

export const costCenterFieldsSchema = costCenterFields
export const costCenterCreateSchema = costCenterFields.extend({ reason: reasonSchema })
export const costCenterUpdateSchema = costCenterCreateSchema
export const costCenterDeleteSchema = z.object({ reason: reasonSchema })

// ── §6.15 ปฏิทินวันหยุด (มติ PO 06/10/2569 UAT U93) ─────────────────────
const holidayNameSchema = z
  .string()
  .trim()
  .min(1, 'กรุณาระบุชื่อวันหยุด')
  .max(MAX_HOLIDAY_NAME_LENGTH, `ชื่อวันหยุดยาวเกิน ${MAX_HOLIDAY_NAME_LENGTH} ตัวอักษร`)

const holidayItemSchema = z.object({
  /** `YYYY-MM-DD` ค.ศ. (ค่าของ `<input type="date">`) → เที่ยงคืน UTC (คอลัมน์ `DATE`) */
  holidayDate: dateOnlySchema('วันหยุด'),
  name: holidayNameSchema,
})

export const holidayCreateSchema = holidayItemSchema.extend({ reason: reasonSchema })
/** นำเข้าหลายวัน — client แยกข้อความด้วย `parseHolidayImport()` แล้วส่งรายการ (วันที่ซ้ำกับที่มีอยู่ถูกข้าม) */
export const holidayImportSchema = z.object({
  items: z
    .array(holidayItemSchema)
    .min(1, 'ไม่มีรายการวันหยุดให้นำเข้า')
    .max(MAX_HOLIDAY_IMPORT_ROWS, `นำเข้าได้ครั้งละไม่เกิน ${MAX_HOLIDAY_IMPORT_ROWS} วัน`),
  reason: reasonSchema,
})
export const holidayDeleteSchema = z.object({ reason: reasonSchema })
export const holidayListQuerySchema = z.object({
  /** ปี พ.ศ. — ไม่ส่ง = ทุกปี */
  yearBe: z.coerce.number().int().min(2500).max(2700).optional(),
})

// ── §6.8 รูปแบบไฟล์ธนาคาร ──────────────────────────────────────────────
export const bankFileTypeSchema = z.enum(['CSV', 'TXT'])
/** ค่า enum ใน DB คือ `UTF-8`/`TIS-620` (`@map`) — API ใช้ชื่อ Prisma เพื่อไม่ให้ขีดกลางหลุดเข้า TS */
export const bankFileEncodingSchema = z.enum(['UTF_8', 'TIS_620'])

/** มติ PO U147 — statement (นำเข้ากระทบยอด) / payment (ไฟล์โอน) */
export const bankFilePurposeSchema = z.enum(BANK_FILE_PURPOSES, { error: 'เลือกว่าใช้สำหรับไฟล์ statement หรือไฟล์โอนเงิน' })

const bankFileFormatFields = z.object({
  purpose: bankFilePurposeSchema,
  /** รหัสธนาคารจากรายการธนาคารไทยมาตรฐาน — ชื่อธนาคารระบบเขียนให้ */
  bankCode: z
    .string()
    .trim()
    .refine((code) => thaiBankByCode(code) !== null, 'เลือกธนาคารจากรายการ'),
  fileType: bankFileTypeSchema,
  encoding: bankFileEncodingSchema,
  /** คอลัมน์ตามลำดับที่ธนาคารกำหนด คั่นด้วย `,` — ต้องเป็นคำศัพท์ของชนิดนั้นเท่านั้น (ตรวจใน refine) */
  columnMapping: z.string().trim().min(1, 'เลือกคอลัมน์อย่างน้อย 1 คอลัมน์').max(2000, 'รายชื่อคอลัมน์ยาวเกินไป'),
})

const refineBankFileFormat: RefineFn<z.infer<typeof bankFileFormatFields>> = (values, ctx) => {
  const columns = parseColumnMapping(values.columnMapping)
  const unknown = columns.filter((column) => !isColumnOfPurpose(values.purpose, column))
  if (unknown.length > 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['columnMapping'],
      message: `คอลัมน์ไม่อยู่ในรายการของ${BANK_FILE_PURPOSE_LABEL[values.purpose]}: ${unknown.join(', ')}`,
    })
  }
  if (new Set(columns).size !== columns.length) {
    ctx.addIssue({ code: 'custom', path: ['columnMapping'], message: 'เลือกคอลัมน์ซ้ำ' })
  }
}

export const bankFileFormatFieldsSchema = bankFileFormatFields.superRefine(refineBankFileFormat)
export const bankFileFormatCreateSchema = bankFileFormatFields
  .extend({ reason: reasonSchema })
  .superRefine(refineBankFileFormat)
export const bankFileFormatUpdateSchema = bankFileFormatCreateSchema
export const bankFileFormatDeleteSchema = z.object({ reason: reasonSchema })
/** `POST /:id/test` — ผลทดสอบเปลี่ยน `test_status` (state machine `13` §8) ⇒ ต้องมี reason */
export const bankFileTestSchema = z.object({ reason: reasonSchema })

// ── §6.10 Functional Permission Matrix (37 รายการ × role) ──────────────
export const matrixLevelSchema = z.enum(['none', 'view', 'manage'])

export const functionalPermissionUpdateSchema = z.object({
  entries: z
    .array(
      z.object({
        roleId: uuidSchema,
        capabilityCode: z.string().trim().min(1).max(80),
        level: matrixLevelSchema,
      }),
    )
    .min(1, 'ไม่มีรายการที่จะเปลี่ยน')
    .max(500, 'เปลี่ยนสิทธิ์ครั้งละไม่เกิน 500 รายการ'),
  reason: reasonSchema,
})

// ── §6.12 เลขที่เอกสาร (มติ PO U102 — ตั้งค่าได้ทุกชนิด) ─────────────────
export const documentNumberTypeSchema = z.enum(DOCUMENT_NUMBER_TYPES)

const documentNumberingFields = z.object({
  prefix: z
    .string()
    .trim()
    .toUpperCase()
    .max(MAX_PREFIX_LENGTH, `คำนำหน้ายาวได้ไม่เกิน ${MAX_PREFIX_LENGTH} ตัวอักษร`)
    .regex(PREFIX_PATTERN, 'คำนำหน้าใช้ได้เฉพาะ A-Z, 0-9 และขีด (-) คั่นกลาง — ไม่ขึ้นต้น/ลงท้ายด้วยขีด'),
  includeYear: z.boolean(),
  digits: z
    .number()
    .int('จำนวนหลักต้องเป็นจำนวนเต็ม')
    .min(MIN_DIGITS, `จำนวนหลักต้องอยู่ระหว่าง ${MIN_DIGITS}-${MAX_DIGITS}`)
    .max(MAX_DIGITS, `จำนวนหลักต้องอยู่ระหว่าง ${MIN_DIGITS}-${MAX_DIGITS}`),
  resetYearly: z.boolean(),
  /**
   * เลขลำดับถัดไป (ไม่บังคับ) — เฉพาะเอกสารที่ไม่ใช่เอกสารภาษี · ต่ำกว่าเลขที่ใช้แล้วไม่ได้
   * (`NUMBERING_SEQ_BELOW_ISSUED`) · เอกสารภาษีส่งมา = `NUMBERING_SEQ_NOT_EDITABLE`
   */
  nextSequence: z
    .number()
    .int('เลขลำดับต้องเป็นจำนวนเต็ม')
    .min(1, 'เลขลำดับถัดไปต้องมากกว่า 0')
    .max(99_999_999, 'เลขลำดับถัดไปมากเกินไป')
    .optional(),
})

function resetNeedsYear<T extends { includeYear: boolean; resetYearly: boolean }>(value: T, ctx: z.RefinementCtx): void {
  if (value.resetYearly && !value.includeYear) {
    ctx.addIssue({
      code: 'custom',
      path: ['resetYearly'],
      message: 'รีเซ็ตลำดับทุกปีต้องรวมปี พ.ศ. ในเลขด้วย — ไม่งั้นเลขปีใหม่จะซ้ำกับปีก่อน',
    })
  }
}

export const documentNumberingFieldsSchema = documentNumberingFields.superRefine(resetNeedsYear)

/**
 * PATCH ชุดเลขเอกสาร 1 ชนิด — ตัวนับ (`currentSeq`/`currentYear`/`lastNumber` ฯลฯ) **ห้ามส่งมา**
 * (ตอบ `NUMBERING_SEQ_NOT_EDITABLE` ที่ชั้น route ก่อน parse) · ตั้งเลขถัดไปผ่าน `nextSequence` เท่านั้น
 */
export const documentNumberingUpdateSchema = documentNumberingFields
  .extend({ reason: reasonSchema })
  .superRefine(resetNeedsYear)

export const NUMBERING_READONLY_KEYS = [
  'lastNumber',
  'lastResetYear',
  'taxInvoiceSeq',
  'seq',
  'currentSeq',
  'currentYear',
  'lastIssuedNumber',
] as const

/** ตรวจว่า body พยายามแก้ตัวเดินเลขด้วยมือหรือไม่ (เรียกก่อน parse) */
export function bodyTouchesNumberingSequence(body: unknown): boolean {
  if (typeof body !== 'object' || body === null) return false
  return NUMBERING_READONLY_KEYS.some((key) => key in (body as Record<string, unknown>))
}

// ── §6.13 เทมเพลตเอกสาร (มติ PO U122) ─────────────────────────────────────
export const templateDocumentTypeSchema = z.enum(['billing_invoice', 'tax_invoice', 'handover_note'])

const taxDocTemplateFields = z.object({
  footerNote: optionalText(MAX_FOOTER_NOTE_LENGTH),
  printSignature: z.boolean({ error: () => 'กรุณาระบุว่าจะพิมพ์รูปลายเซ็นหรือไม่' }),
})

export const taxDocTemplateFieldsSchema = taxDocTemplateFields
/** `.strict()` — ช่องที่ตัดออกแล้ว (โลโก้/ลายเซ็น URL/ขนาดกระดาษ/ภาษา) ส่งมา = 400 ไม่ใช่ถูกเพิกเฉยเงียบ ๆ */
export const taxDocTemplateUpdateSchema = taxDocTemplateFields
  .extend({
    documentType: templateDocumentTypeSchema,
    reason: reasonSchema,
  })
  .strict()

export type CycleInput = z.infer<typeof cycleFieldsSchema>
export type CycleListQuery = z.infer<typeof cycleListQuerySchema>
export type ApprovalMatrixInput = z.infer<typeof approvalMatrixFieldsSchema>
export type FinancePolicyInput = z.infer<typeof financePolicyFieldsSchema>
export type BankAccountInput = z.infer<typeof bankAccountFieldsSchema>
export type BankAccountListQuery = z.infer<typeof bankAccountListQuerySchema>
export type TaxProfileInput = z.infer<typeof taxProfileFieldsSchema>
export type VatRateInput = z.infer<typeof vatRateFieldsSchema>
export type CostCenterInput = z.infer<typeof costCenterFieldsSchema>
export type BankFileFormatInput = z.infer<typeof bankFileFormatFieldsSchema>
export type FunctionalPermissionUpdateInput = z.infer<typeof functionalPermissionUpdateSchema>
export type DocumentNumberingInput = z.infer<typeof documentNumberingFieldsSchema>
export type TaxDocTemplateInput = z.infer<typeof taxDocTemplateFieldsSchema>
