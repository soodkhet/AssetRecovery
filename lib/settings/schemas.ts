import { z } from 'zod'
import { dateOnlySchema, pctSchema, reasonSchema, satangSchema } from '@/lib/api/validation'
import { MAX_APPROVAL_STEPS, duplicateApprovalSteps } from '@/lib/settings/approval-matrix'
import { ACCOUNT_TYPE_VALUES, MAX_AUTO_MATCH_TOLERANCE_DAYS } from '@/lib/settings/bank-account'
import { MAX_CUTOFF_DAY, MIN_CUTOFF_DAY, describeDueRule } from '@/lib/settings/cycles'
import {
  MAX_AGING_BUCKETS,
  MAX_AGING_BUCKET_DAYS,
  MIN_AGING_BUCKETS,
} from '@/lib/settings/finance-policy'
import { MAX_DIGIT_LENGTH, MIN_DIGIT_LENGTH } from '@/lib/settings/numbering'
import { MAX_FOOTER_NOTE_LENGTH } from '@/lib/settings/tax-doc-template'
import { WHT_BASIS_VALUES } from '@/lib/settings/tax-profile'

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

const uuidSchema = z.string().uuid('รูปแบบรหัสไม่ถูกต้อง')
const nameSchema = z.string().trim().min(2, 'ชื่อสั้นเกินไป').max(120, 'ชื่อยาวเกินไป')
/** ช่องข้อความสั้นที่ยอมให้ว่างได้ — ฟอร์มส่ง `''` มาเสมอ ต้องแปลงเป็น null **ก่อน** ตรวจรูปแบบ */
const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().trim().max(max, `ข้อความยาวเกิน ${max} ตัวอักษร`).nullable().default(null),
  )
const optionalUrl = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z.string().trim().max(500, 'ลิงก์ยาวเกินไป').url('รูปแบบลิงก์ไม่ถูกต้อง').nullable().default(null),
)

// ── §6.1 รอบบิล/รอบจ่าย ────────────────────────────────────────────────
export const cycleTypeSchema = z.enum(['AR', 'AP'])
export const cutoffRuleTypeSchema = z.enum(['fixed_dates', 'month_end', 'custom_text'])
export const dueRuleTypeSchema = z.enum(['net_days', 'day_of_next_month', 'month_end'])

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
  cutoffText: optionalText(200),
  dueRuleType: dueRuleTypeSchema,
  dueRuleValue: z
    .number()
    .int('ค่าของเงื่อนไขต้องเป็นจำนวนเต็ม')
    .min(1, 'ค่าของเงื่อนไขต้องมากกว่า 0')
    .max(365, 'ค่าของเงื่อนไขมากเกินไป')
    .nullable()
    .default(null),
  scope: z.string().trim().min(2, 'ระบุขอบเขตที่ใช้รอบนี้').max(200, 'ขอบเขตยาวเกินไป'),
})

/** ตัวตรวจรูปร่างเงื่อนไข — ใช้ร่วมทั้ง schema ฝั่งฟอร์มและ schema ที่มี `reason` (ห้าม copy) */
const refineCycle: RefineFn<z.infer<typeof cycleFieldsBase>> = (values, ctx) => {
  // ตรงกับ CHECK `cycles_cutoff_shape` — ค่าที่ไม่เข้าคู่กับชนิดต้องถูกปฏิเสธที่ API ก่อนถึง DB
  if (values.cutoffRuleType === 'fixed_dates' && values.cutoffDates.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['cutoffDates'], message: 'เลือกวันที่ตัดรอบอย่างน้อย 1 วัน' })
  }
  if (values.cutoffRuleType === 'custom_text' && (values.cutoffText === null || values.cutoffText.length === 0)) {
    ctx.addIssue({ code: 'custom', path: ['cutoffText'], message: 'ระบุคำอธิบายกติกาวันตัดรอบ' })
  }
  // ตรงกับ CHECK `cycles_due_rule_shape` (A5)
  if (values.dueRuleType !== 'month_end' && values.dueRuleValue === null) {
    ctx.addIssue({ code: 'custom', path: ['dueRuleValue'], message: 'ระบุค่าของเงื่อนไขกำหนดชำระ' })
  }
  if (values.dueRuleType === 'day_of_next_month' && values.dueRuleValue !== null && values.dueRuleValue > MAX_CUTOFF_DAY) {
    ctx.addIssue({ code: 'custom', path: ['dueRuleValue'], message: `วันที่ต้องอยู่ระหว่าง 1-${MAX_CUTOFF_DAY}` })
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
  condition: z.string().trim().min(2, 'ระบุเงื่อนไขที่ทำให้ใช้สายอนุมัตินี้').max(200, 'เงื่อนไขยาวเกินไป'),
  /** เพดานเงินเป็น **satang** เสมอ (Rule 01) — FE แปลงจากบาทด้วย `parseBahtInput()` ก่อนส่ง */
  conditionThresholdSatang: satangSchema('เพดานเงิน').nullable().default(null),
  approvalFlow: z
    .array(z.string().trim().min(1, 'ชื่อบทบาทว่างไม่ได้').max(120, 'ชื่อบทบาทยาวเกินไป'))
    .min(1, 'ต้องมีขั้นอนุมัติอย่างน้อย 1 ขั้น')
    .max(MAX_APPROVAL_STEPS, `ขั้นอนุมัติได้ไม่เกิน ${MAX_APPROVAL_STEPS} ขั้น`),
  enforceSegregationOfDuties: z.boolean().default(false),
})

const refineApprovalMatrix: RefineFn<z.infer<typeof approvalMatrixFieldsBase>> = (values, ctx) => {
  const duplicates = duplicateApprovalSteps(values.approvalFlow.map((role) => role.trim()))
  if (values.enforceSegregationOfDuties && duplicates.length > 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['approvalFlow'],
      message: `บังคับแยกหน้าที่แล้วใส่บทบาทซ้ำไม่ได้: ${duplicates.join(', ')}`,
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
  advanceUnclearedToEmployeeReceivable: z.boolean(),
})

export const financePolicyFieldsSchema = financePolicyFields
export const financePolicyUpdateSchema = financePolicyFields.extend({ reason: reasonSchema })

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
  statementFormat: optionalText(120),
  paymentFileFormat: optionalText(120),
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
  incomeType: z.string().trim().min(2, 'ระบุประเภทเงินได้').max(200, 'ประเภทเงินได้ยาวเกินไป'),
  filingForm: whtFilingFormSchema,
})

export const taxProfileFieldsSchema = taxProfileFields
export const taxProfileCreateSchema = taxProfileFields.extend({ reason: reasonSchema })
export const taxProfileUpdateSchema = taxProfileCreateSchema
export const taxProfileDeleteSchema = z.object({ reason: reasonSchema })

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

// ── §6.8 รูปแบบไฟล์ธนาคาร ──────────────────────────────────────────────
export const bankFileTypeSchema = z.enum(['CSV', 'TXT'])
/** ค่า enum ใน DB คือ `UTF-8`/`TIS-620` (`@map`) — API ใช้ชื่อ Prisma เพื่อไม่ให้ขีดกลางหลุดเข้า TS */
export const bankFileEncodingSchema = z.enum(['UTF_8', 'TIS_620'])

const bankFileFormatFields = z.object({
  bankName: nameSchema,
  fileType: bankFileTypeSchema,
  encoding: bankFileEncodingSchema,
  columnMapping: z.string().trim().min(1, 'ระบุรายชื่อคอลัมน์ตามลำดับที่ธนาคารกำหนด').max(2000, 'รายชื่อคอลัมน์ยาวเกินไป'),
})

export const bankFileFormatFieldsSchema = bankFileFormatFields
export const bankFileFormatCreateSchema = bankFileFormatFields.extend({ reason: reasonSchema })
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

// ── §6.12 รูปแบบเลขที่ใบกำกับภาษี ──────────────────────────────────────
export const invoiceNumberingModeSchema = z.enum(['continuous', 'yearly_reset'])

const numberingFields = z.object({
  mode: invoiceNumberingModeSchema,
  prefix: z
    .string()
    .trim()
    .max(20, 'ข้อความนำหน้ายาวเกินไป')
    .regex(/^[A-Za-z0-9]*$/, 'ข้อความนำหน้าใช้ได้เฉพาะ A-Z และ 0-9 (ตัวคั่น - ระบบใส่ให้)')
    .default(''),
  digitLength: z
    .number()
    .int('จำนวนหลักต้องเป็นจำนวนเต็ม')
    .min(MIN_DIGIT_LENGTH, `จำนวนหลักต้องอยู่ระหว่าง ${MIN_DIGIT_LENGTH}-${MAX_DIGIT_LENGTH}`)
    .max(MAX_DIGIT_LENGTH, `จำนวนหลักต้องอยู่ระหว่าง ${MIN_DIGIT_LENGTH}-${MAX_DIGIT_LENGTH}`),
})

export const numberingFieldsSchema = numberingFields

/**
 * PATCH เลขที่ใบกำกับภาษี — **`lastNumber`/`lastResetYear` ห้ามส่งมา** (`13` §6.12 "ระบบ track
 * อัตโนมัติ ไม่ให้แก้มือ") · ส่งมา = `NUMBERING_SEQ_NOT_EDITABLE` ที่ชั้น route ไม่ใช่ 400 เฉยๆ
 * เพื่อให้ error สื่อสาเหตุจริง
 */
export const numberingUpdateSchema = numberingFields.extend({ reason: reasonSchema })

export const NUMBERING_READONLY_KEYS = ['lastNumber', 'lastResetYear', 'taxInvoiceSeq', 'seq'] as const

/** ตรวจว่า body พยายามแก้ตัวเดินเลขด้วยมือหรือไม่ (เรียกก่อน parse) */
export function bodyTouchesNumberingSequence(body: unknown): boolean {
  if (typeof body !== 'object' || body === null) return false
  return NUMBERING_READONLY_KEYS.some((key) => key in (body as Record<string, unknown>))
}

// ── §6.13 รูปแบบเอกสารภาษีทางการ ───────────────────────────────────────
export const taxDocumentTypeSchema = z.enum(['tax_invoice', 'wht_certificate'])
export const taxDocPaperSizeSchema = z.enum(['A4', 'A5'])
export const taxDocLanguageSchema = z.enum(['th', 'th_en_bilingual'])

const taxDocTemplateFields = z.object({
  logoUrl: optionalUrl,
  footerNote: optionalText(MAX_FOOTER_NOTE_LENGTH),
  signatureImageUrl: optionalUrl,
  paperSize: taxDocPaperSizeSchema,
  language: taxDocLanguageSchema,
})

export const taxDocTemplateFieldsSchema = taxDocTemplateFields
export const taxDocTemplateUpdateSchema = taxDocTemplateFields.extend({
  documentType: taxDocumentTypeSchema,
  reason: reasonSchema,
})

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
export type NumberingInput = z.infer<typeof numberingFieldsSchema>
export type TaxDocTemplateInput = z.infer<typeof taxDocTemplateFieldsSchema>
