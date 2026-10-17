import { QUESTION_STATUS_LABEL } from '@/lib/accounting/question'
import { ADJUSTMENT_STATUS_LABEL } from '@/lib/adjustments/adjustment-ui'
import { ADVANCE_RETURN_CHANNEL_LABEL, ADVANCE_RETURN_METHOD_LABEL } from '@/lib/advances/advance'
import { ADVANCE_STATUS_LABEL } from '@/lib/advances/advance-ui'
import { normalizeFieldName } from '@/lib/audit/diff'
import { AUDIT_FIELD_TOKEN_LABEL } from '@/lib/audit/field-tokens'
import { BANK_MATCH_STATUS_LABEL } from '@/lib/bank-recon/matching'
import { CASE_SOURCE_LABEL, CASE_STATUS_LABEL } from '@/lib/cases/status-display'
import { FUEL_MODE_LABEL } from '@/lib/compensation/plan'
import { CREDIT_NOTE_STATUS_LABEL, CREDIT_NOTE_TYPE_LABEL } from '@/lib/credit-notes/credit-note'
import { CUSTOMER_WHT_STATUS_LABEL } from '@/lib/customer-wht/customer-wht'
import { EXPORT_STATUS_LABEL } from '@/lib/exports/pack'
import { DOCUMENT_STATUS_LABEL } from '@/lib/expenses/expense-record'
import { EXPENSE_STATUS_LABEL, EXPENSE_TYPE_LABEL } from '@/lib/field/expense-ui'
import { COMPANY_DOCUMENT_LABEL } from '@/lib/finance-companies/documents'
import { JOB_STATUS_LABEL } from '@/lib/jobs/job-state'
import type { AccountingPeriodStatus } from '@/lib/generated/prisma/enums'
import { WHT_CONDITION_LABEL } from '@/lib/payees/payee'
import { PAYOUT_STATUS_LABEL } from '@/lib/payout/payout'
import { EXCEPTION_LEVEL_LABEL, EXCEPTION_MODULE_LABEL } from '@/lib/reports/dashboard'
import { BILLING_STATUS_LABEL, REVENUE_FEE_MODEL_LABEL, REVENUE_STATUS_LABEL, VAT_MODE_LABEL } from '@/lib/revenue/revenue-ui'
import { ROLE_GROUP_LABEL } from '@/lib/roles/role-groups'
import { TAX_INVOICE_STATUS_LABEL } from '@/lib/sales/sales'
import { BANK_ACCOUNT_USAGE_LABEL } from '@/lib/settings/bank-account'
import { periodLockPolicyFor } from '@/lib/settings/period-lock'
import {
  WHT_CERTIFICATE_MODE_LABEL,
  WHT_FILING_METHOD_LABEL,
  WHT_INCOME_CATEGORY_LABEL,
  WHT_INCOME_TYPE_MODE_LABEL,
} from '@/lib/settings/wht-policy'
import { SUBSTITUTE_RECEIPT_STATUS_LABEL } from '@/lib/substitute-receipts/substitute-receipt'
import { TEAM_SIDE_LABEL } from '@/lib/ui/status-badge'
import { LOT_STATUS_LABELS } from '@/lib/warehouse/lot-status'
import { ASSET_STATUS_LABEL } from '@/lib/warehouse/warehouse-ui'
import { WHT_CERTIFICATE_STATUS_LABEL, WHT_FILING_FORM_LABEL, WHT_FILING_STATUS_LABEL } from '@/lib/wht/wht'

/**
 * mytester6 T-009 + T-026 — ตัวแปลง "ชื่อฟิลด์" และ "ค่า enum/boolean" ในตาราง "ค่าก่อน / หลัง" ของบันทึกการใช้งาน — **pure ล้วน**
 *
 * ค่าที่เก็บใน audit คงเป็นชื่อคอลัมน์/enum ภายในเดิม (หลักฐานห้ามแก้) — แปลงที่ชั้นแสดงผลเท่านั้น
 * 1. ชื่อฟิลด์: ป้ายเฉพาะ (`AUDIT_FIELD_LABEL`) → แตกคำแล้วแปลทีละคำ (`AUDIT_FIELD_TOKEN_LABEL`) → ชื่อเดิม (ไม่พัง)
 *    เทียบแบบไม่สน `_`/ตัวพิมพ์ ⇒ `allowance_satang` กับ `allowanceSatang` ได้ป้ายเดียวกัน
 * 2. ค่า: boolean → ใช่/ไม่ใช่ · enum ตามฟิลด์ (สถานะแยกตามชนิดเป้าหมาย) ใช้ป้ายชุดเดียวกับหน้าจอของโมดูลนั้น ·
 *    รายการ (array) ของ enum แปลทีละตัว · ค่าที่ไม่รู้จัก ⇒ `null` (ผู้เรียกแสดงค่าดิบ)
 * กันหลุดด้วย `lib/audit/field-label-coverage.test.ts` (สแกนซอร์ส + สคีมา)
 */

type LabelMap = Readonly<Record<string, string>>

/** ป้ายเฉพาะของฟิลด์ที่พบบ่อย (คีย์ snake_case — เทียบแบบ normalize) */
const FIELD_LABELS: LabelMap = {
  // ทั่วไป
  status: 'สถานะ',
  level: 'ระดับ',
  reason: 'เหตุผล',
  note: 'หมายเหตุ',
  notes: 'หมายเหตุ',
  title: 'หัวข้อ',
  description: 'รายละเอียด',
  name: 'ชื่อ',
  code: 'รหัส',
  side: 'ฝั่ง (Inhouse/Outsource)',
  version: 'ฉบับที่',
  is_active: 'เปิดใช้งาน',
  active: 'เปิดใช้งาน',
  deleted_at: 'เวลาลบ',
  created_at: 'เวลาสร้าง',
  created_by: 'ผู้สร้าง',
  updated_at: 'เวลาแก้ไข',
  updated_by: 'ผู้แก้ไข',
  effective_from: 'มีผลตั้งแต่',
  effective_to: 'มีผลถึง',
  events: 'เหตุการณ์',
  channel: 'ช่องทาง',
  document: 'เอกสาร',
  file_name: 'ชื่อไฟล์',
  file_names: 'ชื่อไฟล์',
  file_path: 'ไฟล์',
  file_sha256: 'ค่าตรวจสอบไฟล์ (SHA-256)',
  file_hash: 'ค่าตรวจสอบไฟล์',
  original_name: 'ชื่อไฟล์ต้นฉบับ',
  mime_type: 'ชนิดไฟล์',
  size_bytes: 'ขนาดไฟล์ (ไบต์)',
  row_count: 'จำนวนแถว',
  item_count: 'จำนวนรายการ',
  bulk_count: 'จำนวนรายการ',
  // ข้อยกเว้น (mytester H-06)
  period_id: 'รอบบัญชี',
  authorize_note: 'เหตุผลที่อนุมัติยกเว้น',
  authorized_at: 'เวลาอนุมัติยกเว้น',
  authorized_by: 'ผู้อนุมัติยกเว้น',
  resolution_note: 'หมายเหตุการแก้ไข',
  resolved_at: 'เวลาแก้ไข',
  resolved_by: 'ผู้แก้ไข',
  source_module: 'โมดูลต้นทาง',
  source_ref: 'ที่มา',
  is_resolved: 'แก้ไขแล้ว',
  // เงิน
  amount_satang: 'ยอดเงิน',
  gross_satang: 'ยอดก่อนหัก',
  net_satang: 'ยอดสุทธิ',
  total_satang: 'ยอดรวม',
  vat_satang: 'ภาษีมูลค่าเพิ่ม',
  wht_satang: 'ภาษีหัก ณ ที่จ่าย',
  withheld_satang: 'ภาษีที่หัก ณ ที่จ่าย',
  transfer_satang: 'ยอดโอน',
  requested_satang: 'ยอดที่ขอ',
  approved_satang: 'ยอดที่อนุมัติ',
  used_satang: 'ยอดใช้จริง',
  return_satang: 'ยอดคืน',
  excess_satang: 'ยอดส่วนเกิน',
  received_satang: 'ยอดที่รับ',
  amount_before_vat_satang: 'มูลค่าก่อนภาษี',
  total_before_vat_satang: 'มูลค่าก่อนภาษี',
  rate_pct: 'อัตรา (%)',
  wht_pct: 'อัตราภาษีหัก ณ ที่จ่าย (%)',
  vat_rate_pct_used: 'อัตรา VAT ที่ใช้ (%)',
  // แผนค่าตอบแทน
  allowance_satang: 'เบี้ยเลี้ยง',
  commission_satang: 'ค่าคอมมิชชัน (ปิดงานสำเร็จ)',
  no_success_fee_satang: 'ค่าตอบแทนกรณีไม่สำเร็จ',
  fuel_mode: 'วิธีคิดค่าน้ำมัน',
  fuel_daily_flat_satang: 'ค่าน้ำมันเหมาจ่ายรายวัน',
  fuel_max_per_case_satang: 'ค่าน้ำมันสูงสุดต่อเคส',
  fuel_rate_per_km_satang: 'ค่าน้ำมันต่อกิโลเมตร',
  hotel_max_per_night_satang: 'ค่าที่พักสูงสุดต่อคืน',
  hotel_receipt_required: 'บังคับแนบใบเสร็จค่าที่พัก',
  comp_plan_id: 'แผนค่าตอบแทน',
  comp_plan_version: 'ฉบับของแผนค่าตอบแทน',
  // ค่าตั้ง
  holiday_date: 'วันหยุด',
  supervisor_can_assign_outsource: 'หัวหน้างานมอบหมายงานให้ Outsource ได้',
  supervisor_can_assign_inhouse: 'หัวหน้างานมอบหมายงานให้ Inhouse ได้',
  account_name: 'ชื่อบัญชี',
  account_number: 'เลขที่บัญชี',
  bank_name: 'ธนาคาร',
  bank_code: 'รหัสธนาคาร',
  bank_account_id: 'บัญชีธนาคาร',
  retention_years: 'ระยะเก็บ (ปี)',
  stale_alert_days: 'แจ้งเตือนค้างเกิน (วัน)',
  // ผู้รับเงิน/ภาษี
  payee_id: 'ผู้รับเงิน',
  payee_name: 'ชื่อผู้รับเงิน',
  payee_tax_id: 'เลขประจำตัวผู้เสียภาษีผู้รับเงิน',
  payee_address: 'ที่อยู่ผู้รับเงิน',
  payee_branch_code: 'สาขาผู้รับเงิน',
  wht_condition: 'เงื่อนไขการหักภาษี',
  wht_certificate_mode: 'การออกหนังสือรับรองหัก ณ ที่จ่าย',
  wht_income_type_mode: 'การกำหนดประเภทเงินได้',
  wht_inhouse_income_category: 'ประเภทเงินได้ Inhouse',
  wht_outsource_income_category: 'ประเภทเงินได้ Outsource',
  wht_base_expense_types: 'ประเภทค่าใช้จ่ายที่รวมในฐานภาษี',
  wht_allow_gross_up_conditions: 'อนุญาตเงื่อนไขออกภาษีให้',
  filing_method: 'วิธียื่นแบบ',
  filing_form: 'แบบที่ยื่น',
  certificate_number: 'เลขที่หนังสือรับรอง',
  certificate_date: 'วันที่หนังสือรับรอง',
  certificate_status: 'สถานะหนังสือรับรอง',
  // เอกสารขาย/ภาษี
  invoice_number: 'เลขที่ใบกำกับภาษี',
  invoice_date: 'วันที่ใบกำกับภาษี',
  tax_invoice_id: 'ใบกำกับภาษี',
  credit_note_number: 'เลขที่ใบลด/เพิ่มหนี้',
  note_type: 'ชนิดเอกสาร',
  doc_kind: 'ชนิดเอกสาร',
  doc_type: 'ชนิดเอกสาร',
  document_type: 'ชนิดเอกสาร',
  issue_date: 'วันที่ออก',
  cancel_reason: 'เหตุผลที่ยกเลิก',
  cancelled_at: 'เวลายกเลิก',
  rejection_reason: 'เหตุผลที่ปฏิเสธ',
  buyer_name: 'ชื่อผู้ซื้อ',
  buyer_tax_id: 'เลขประจำตัวผู้เสียภาษีผู้ซื้อ',
  buyer_branch_code: 'สาขาผู้ซื้อ',
  seller_name: 'ชื่อผู้ขาย',
  seller_tax_id: 'เลขประจำตัวผู้เสียภาษีผู้ขาย',
  seller_branch_code: 'สาขาผู้ขาย',
  vat_mode: 'การคิด VAT',
  fee_model: 'รูปแบบค่าบริการ',
  // บัญชี/ส่งออก
  failed_checks: 'เงื่อนไขที่ไม่ผ่าน',
  ready: 'พร้อมส่ง',
  mapping_rule: 'วิธีจับคู่ศูนย์ต้นทุน',
  cost_center_id: 'ศูนย์ต้นทุน',
  cost_center_code: 'รหัสศูนย์ต้นทุน',
  document_status: 'ความครบของเอกสาร',
  match_note: 'หมายเหตุการจับคู่',
  match_status: 'สถานะการจับคู่',
  sent_at: 'เวลาส่ง',
  locked_at: 'เวลาล็อก',
  zip_file: 'ไฟล์ ZIP',
  content_digest: 'ค่าตรวจสอบเนื้อหา',
  // เงินทดรอง/เบิก
  return_method: 'วิธีคืนเงิน',
  expense_type: 'ประเภทรายการเบิก',
  expense_date: 'วันที่เกิดรายการ',
  receipt_file_url: 'ไฟล์ใบเสร็จ',
  receipt_file_hash: 'ค่าตรวจสอบไฟล์ใบเสร็จ',
  // ผู้ใช้/สิทธิ์
  role_group: 'กลุ่มบทบาท',
  must_change_password: 'ต้องเปลี่ยนรหัสผ่าน',
  manager_ids: 'ผู้จัดการทีม',
  company_id: 'บริษัทไฟแนนซ์',
  company_ids: 'บริษัทไฟแนนซ์',
  company_name: 'ชื่อบริษัท',
  case_id: 'เคส',
  target_type: 'ชนิดเป้าหมาย',
  target_id: 'เป้าหมาย',
  imei: 'เลข IMEI',
  tac: 'รหัส TAC',
  tacs: 'รหัส TAC',
  // id ภายนอก/ไฟล์ทั่วไป (camelCase จากโค้ดบางจุด)
  fileName: 'ชื่อไฟล์',
}

const NORMALIZED_FIELD_LABELS: ReadonlyMap<string, string> = new Map(
  Object.entries(FIELD_LABELS).map(([field, label]) => [normalizeFieldName(field), label]),
)

/** แตกชื่อฟิลด์เป็นคำ (snake_case + camelCase) — ตัวพิมพ์เล็กทั้งหมด */
export function auditFieldTokens(field: string): string[] {
  return field
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[_\s.-]+/)
    .filter((token) => token !== '')
}

/** คำท้ายที่เปลี่ยนเป็นคำนำหน้า (ภาษาไทยขึ้นต้นด้วยคำหลัก) — `created_at` ⇒ "เวลา" + "สร้าง" */
const LEADING_FROM_SUFFIX: LabelMap = {
  at: 'เวลา',
  by: 'ผู้',
  date: 'วันที่',
  satang: 'ยอด',
  count: 'จำนวน',
  pct: 'อัตรา (%) ',
  id: '',
  ids: '',
}

/** ป้ายจากการแปลทีละคำ · มีคำที่ไม่รู้จัก ⇒ `null` */
export function auditComposedFieldLabel(field: string): string | null {
  const tokens = auditFieldTokens(field)
  if (tokens[0] === 'is' && tokens.length > 1) tokens.shift()
  const last = tokens[tokens.length - 1]
  let lead = ''
  if (last !== undefined && tokens.length > 1 && LEADING_FROM_SUFFIX[last] !== undefined) {
    lead = LEADING_FROM_SUFFIX[last]
    tokens.pop()
  }
  const words: string[] = []
  for (const token of tokens) {
    const word = AUDIT_FIELD_TOKEN_LABEL[token]
    if (word === undefined) return null
    if (word !== '') words.push(word)
  }
  const label = `${lead}${words.join(' ')}`.trim()
  return label === '' ? null : label
}

/** ชื่อฟิลด์ภาษาไทยของตาราง "ค่าก่อน / หลัง" — ป้ายเฉพาะ → แปลทีละคำ → ชื่อเดิม (ไม่พัง) */
export function auditFieldLabel(field: string): string {
  return NORMALIZED_FIELD_LABELS.get(normalizeFieldName(field)) ?? auditComposedFieldLabel(field) ?? field
}

// ── ค่า enum / boolean ─────────────────────────────────────────────────────────

const PERIOD_STATUSES: readonly AccountingPeriodStatus[] = ['collecting', 'sent_to_accountant', 'locked']
const PERIOD_STATUS_LABEL: LabelMap = Object.fromEntries(
  PERIOD_STATUSES.map((status) => [status, periodLockPolicyFor(status).statusLabel]),
)

/** สถานะแยกตามชนิดเป้าหมาย (ป้ายชุดเดียวกับหน้าจอของโมดูลนั้น) */
const STATUS_LABEL_BY_TARGET: Readonly<Record<string, LabelMap>> = {
  exceptions: { open: 'เปิดอยู่', authorized: 'อนุมัติยกเว้นแล้ว', resolved: 'แก้ไขแล้ว' },
  export_records: EXPORT_STATUS_LABEL,
  wht_certificates: WHT_CERTIFICATE_STATUS_LABEL,
  wht_filing_summaries: WHT_FILING_STATUS_LABEL,
  tax_invoices: TAX_INVOICE_STATUS_LABEL,
  credit_notes: CREDIT_NOTE_STATUS_LABEL,
  accounting_periods: PERIOD_STATUS_LABEL,
  payout_batches: PAYOUT_STATUS_LABEL,
  advances: ADVANCE_STATUS_LABEL,
  substitute_receipts: SUBSTITUTE_RECEIPT_STATUS_LABEL,
  adjustments: ADJUSTMENT_STATUS_LABEL,
  expenses: EXPENSE_STATUS_LABEL,
  billing_batches: BILLING_STATUS_LABEL,
  revenues: REVENUE_STATUS_LABEL,
  cases: CASE_STATUS_LABEL,
  assets: ASSET_STATUS_LABEL,
  handover_lots: LOT_STATUS_LABELS,
  accountant_questions: QUESTION_STATUS_LABEL,
  customer_wht_certificates: CUSTOMER_WHT_STATUS_LABEL,
  jobs: JOB_STATUS_LABEL,
  bank_transactions: BANK_MATCH_STATUS_LABEL,
}

/** สถานะทั่วไปเมื่อไม่รู้ชนิดเป้าหมาย/ไม่มีในชุดของเป้าหมาย */
const GENERIC_STATUS_LABEL: LabelMap = {
  active: 'ใช้งาน',
  inactive: 'ปิดใช้งาน',
  cancelled: 'ยกเลิก',
  pending: 'รอดำเนินการ',
  approved: 'อนุมัติแล้ว',
  rejected: 'ปฏิเสธ',
  completed: 'เสร็จสิ้น',
  failed: 'ไม่สำเร็จ',
  draft: 'ร่าง',
  open: 'เปิดอยู่',
  closed: 'ปิดแล้ว',
  generated: 'สร้างแล้ว',
  sent: 'ส่งแล้ว',
  confirmed: 'ยืนยันแล้ว',
  suspended: 'ระงับ',
}

/** เงื่อนไขความพร้อมปิดงวด — ข้อความเดียวกับหน้าต่างตรวจความพร้อม */
const READINESS_CHECK_LABEL: LabelMap = {
  period_ended: 'งวดสิ้นเดือนแล้ว',
  billing_revenue_sync: 'ยอดวางบิลตรงกับรายได้ของรอบ',
  bank_reconcile: 'กระทบยอดธนาคารครบ 100%',
  no_critical_exception: 'ไม่มีข้อยกเว้นระดับวิกฤตที่เปิดอยู่',
  no_open_payouts: 'รอบจ่ายของงวดจ่ายสำเร็จหรือยกเลิกครบ',
}

/** ชนิดเอกสาร/ไฟล์ที่นำออกจากระบบ (`emitDocumentExportAudit` · `document`) */
const EXPORT_DOCUMENT_LABEL: LabelMap = {
  accounting_pack_zip: 'ชุดเอกสารบัญชี (ZIP)',
  advance_request_pdf: 'ใบเบิกเงินทดรอง (PDF)',
  advance_return_pdf: 'ใบรับคืนเงินทดรอง (PDF)',
  billing_invoice_pdf: 'ใบแจ้งหนี้ (PDF)',
  handover_note_pdf: 'ใบส่งมอบทรัพย์ (PDF)',
  handover_note_xlsx: 'ใบส่งมอบทรัพย์ (Excel)',
  payment_file: 'ไฟล์โอนเงิน',
  payment_voucher_pdf: 'ใบสำคัญจ่าย (PDF)',
  payout_summary_pdf: 'สรุปรอบจ่ายเงิน (PDF)',
  payslip_pdf: 'สลิปค่าตอบแทน (PDF)',
  report_export_file: 'ไฟล์รายงาน',
  substitute_receipt_pdf: 'ใบรับรองแทนใบเสร็จ (PDF)',
  tax_invoice_pdf: 'ใบเสร็จรับเงิน/ใบกำกับภาษี (PDF)',
  wht_certificate_pdf: 'หนังสือรับรองหัก ณ ที่จ่าย (PDF)',
}

const MAPPING_RULE_VALUE_LABEL: LabelMap = { auto: 'อัตโนมัติ (Auto)', manual: 'ระบุเอง (Manual)' }
const CHANNEL_VALUE_LABEL: LabelMap = { internal: 'ดาวน์โหลดในระบบ', portal: 'พอร์ทัลลูกค้า' }

/** ค่า enum ตามชื่อฟิลด์ (normalize แล้ว) — ไม่ขึ้นกับชนิดเป้าหมาย */
const VALUE_LABEL_BY_FIELD: ReadonlyMap<string, LabelMap> = new Map(
  Object.entries({
    level: EXCEPTION_LEVEL_LABEL,
    source_module: EXCEPTION_MODULE_LABEL,
    certificate_status: WHT_CERTIFICATE_STATUS_LABEL,
    mapping_rule: MAPPING_RULE_VALUE_LABEL,
    failed_checks: READINESS_CHECK_LABEL,
    channel: CHANNEL_VALUE_LABEL,
    document: EXPORT_DOCUMENT_LABEL,
    fuel_mode: FUEL_MODE_LABEL,
    side: TEAM_SIDE_LABEL,
    team_side: TEAM_SIDE_LABEL,
    note_type: CREDIT_NOTE_TYPE_LABEL,
    return_method: ADVANCE_RETURN_METHOD_LABEL,
    return_channel: ADVANCE_RETURN_CHANNEL_LABEL,
    wht_condition: WHT_CONDITION_LABEL,
    filing_form: WHT_FILING_FORM_LABEL,
    filing_method: WHT_FILING_METHOD_LABEL,
    wht_filing_method: WHT_FILING_METHOD_LABEL,
    wht_certificate_mode: WHT_CERTIFICATE_MODE_LABEL,
    wht_income_type_mode: WHT_INCOME_TYPE_MODE_LABEL,
    wht_inhouse_income_category: WHT_INCOME_CATEGORY_LABEL,
    wht_outsource_income_category: WHT_INCOME_CATEGORY_LABEL,
    document_status: DOCUMENT_STATUS_LABEL,
    match_status: BANK_MATCH_STATUS_LABEL,
    vat_mode: VAT_MODE_LABEL,
    fee_model: REVENUE_FEE_MODEL_LABEL,
    expense_type: EXPENSE_TYPE_LABEL,
    wht_base_expense_types: EXPENSE_TYPE_LABEL,
    role_group: ROLE_GROUP_LABEL,
    viewer_role_group: ROLE_GROUP_LABEL,
    document_type: COMPANY_DOCUMENT_LABEL,
    usage: BANK_ACCOUNT_USAGE_LABEL,
    source_channel: CASE_SOURCE_LABEL,
    period_status_at_target: PERIOD_STATUS_LABEL,
    company_status: GENERIC_STATUS_LABEL,
  } satisfies Record<string, LabelMap>).map(([field, labels]) => [normalizeFieldName(field), labels]),
)

function enumLabel(value: string, field: string, targetType: string | null): string | null {
  const key = normalizeFieldName(field)
  if (key === 'status') {
    const byTarget = targetType === null ? undefined : STATUS_LABEL_BY_TARGET[targetType]?.[value]
    return byTarget ?? GENERIC_STATUS_LABEL[value] ?? null
  }
  return VALUE_LABEL_BY_FIELD.get(key)?.[value] ?? null
}

/**
 * ค่าในตาราง "ค่าก่อน / หลัง" ที่แปลเป็นภาษาไทยได้ — boolean / enum ตามฟิลด์ / รายการ enum · แปลไม่ได้ = `null`
 * (เงิน/วันที่/ชื่อของ id จัดการที่ `auditValueDisplay()`)
 */
export function auditEnumValueLabel(value: unknown, field: string, targetType: string | null): string | null {
  if (typeof value === 'boolean') return value ? 'ใช่' : 'ไม่ใช่'
  if (typeof value === 'string') return enumLabel(value, field, targetType)
  if (Array.isArray(value) && value.length > 0 && value.every((item): item is string => typeof item === 'string')) {
    const labels = value.map((item) => enumLabel(item, field, targetType))
    if (labels.every((label) => label === null)) return null
    return value.map((item, index) => labels[index] ?? item).join(', ')
  }
  return null
}
