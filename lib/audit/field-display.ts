import { QUESTION_STATUS_LABEL } from '@/lib/accounting/question'
import { ADJUSTMENT_TARGET_LABEL, ADJUSTMENT_TYPE_LABEL } from '@/lib/adjustments/adjustment'
import { DEBTOR_NATIONALITY_LABEL, DOCUMENT_MODE_LABEL, DOCUMENT_SLOT_LABEL } from '@/lib/cases/case'
import { CASE_STATUS_ACTIONS, CASE_STATUS_RULES, type CaseStatusAction } from '@/lib/cases/state-machine'
import { AUDIT_EVENT_LABEL } from '@/lib/audit/event-labels'
import { CLOSE_FAIL_REASON_LABEL } from '@/lib/field/fail-reasons'
import { JOB_TYPES, jobTypeLabel } from '@/lib/jobs/job-types'
import type { PortalSection } from '@/lib/portal/access'
import type { WhtBasis } from '@/lib/settings/tax-profile'
import type { PersonalDataFile } from '@/lib/uploads/personal-data'
import type { RevenueSkipReason } from '@/lib/warehouse/revenue-service'
import { DEVICE_CATALOG_STATUS_LABEL } from '@/lib/device-catalog/catalog'
import { TAC_SOURCE_LABEL } from '@/lib/device-catalog/tac'
import { DOCUMENT_NUMBER_LABEL } from '@/lib/document-numbering/format'
import { CHECKIN_TYPE_LABEL } from '@/lib/field/evidence-review-ui'
import { FIELD_STATUS_LABEL } from '@/lib/field/field-ui'
import { FUNCTIONAL_GROUP_LABEL } from '@/lib/roles/matrix'
import { INVOICE_DELIVERY_FORMAT_LABEL } from '@/lib/sales/sales'
import { SERVICE_FEE_BASIS_LABEL, SERVICE_FEE_MODEL_LABEL } from '@/lib/service-fee/template'
import { BANK_FILE_PURPOSE_LABEL } from '@/lib/settings/bank-file'
import { CYCLE_SCOPE_LABEL } from '@/lib/settings/cycles'
import { TEMPLATE_DOCUMENT_TYPE_LABEL } from '@/lib/settings/tax-doc-template'
import { TAX_PROFILE_INCOME_TYPE_OPTION_LABEL } from '@/lib/settings/tax-profile'
import { ASSET_CONDITION_LABEL, ASSET_STATUS_LABEL, HANDOVER_TYPE_LABEL } from '@/lib/warehouse/warehouse-ui'
import { WHT_DELIVERY_FORMAT_LABEL } from '@/lib/wht/wht'
import { ADJUSTMENT_STATUS_LABEL } from '@/lib/adjustments/adjustment-ui'
import { ADVANCE_RETURN_CHANNEL_LABEL, ADVANCE_RETURN_METHOD_LABEL } from '@/lib/advances/advance'
import { ADVANCE_STATUS_LABEL } from '@/lib/advances/advance-ui'
import { normalizeFieldName } from '@/lib/audit/diff'
import { AUDIT_FIELD_TOKEN_LABEL } from '@/lib/audit/field-tokens'
import { BANK_MATCH_STATUS_LABEL } from '@/lib/bank-recon/matching'
import { ASSET_TYPE_LABEL, CASE_SOURCE_LABEL, CASE_STATUS_LABEL } from '@/lib/cases/status-display'
import { FUEL_MODE_LABEL } from '@/lib/compensation/plan'
import { CREDIT_NOTE_STATUS_LABEL, CREDIT_NOTE_TYPE_LABEL } from '@/lib/credit-notes/credit-note'
import { CUSTOMER_WHT_STATUS_LABEL } from '@/lib/customer-wht/customer-wht'
import { EXPORT_STATUS_LABEL } from '@/lib/exports/pack'
import { DOCUMENT_STATUS_LABEL } from '@/lib/expenses/expense-record'
import { EXPENSE_STATUS_LABEL, EXPENSE_TYPE_LABEL } from '@/lib/field/expense-ui'
import { COMPANY_DOCUMENT_LABEL } from '@/lib/finance-companies/documents'
import { JOB_STATUS_LABEL } from '@/lib/jobs/job-state'
import type { AccountingPeriodStatus, PayeeType } from '@/lib/generated/prisma/enums'
import { WHT_CONDITION_LABEL } from '@/lib/payees/payee'
import { PAYOUT_STATUS_LABEL } from '@/lib/payout/payout'
import { REPORT_DEFINITIONS } from '@/lib/reports/catalog'
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
  WHT_THRESHOLD_SCOPE_LABEL,
} from '@/lib/settings/wht-policy'
import { SUBSTITUTE_RECEIPT_STATUS_LABEL } from '@/lib/substitute-receipts/substitute-receipt'
import { TEAM_SIDE_LABEL } from '@/lib/ui/status-badge'
import { LOT_STATUS_LABELS } from '@/lib/warehouse/lot-status'
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

/**
 * อ่านค่าจาก map ด้วยคีย์ที่มาจากข้อมูล (ชื่อฟิลด์/ค่า enum ใน audit) — เฉพาะคีย์ของ map เอง (`Object.hasOwn`)
 * กันคีย์อย่าง `constructor`/`__proto__`/`toString` ได้ของจาก prototype แทนป้าย (mytester6 รีวิว)
 */
function ownValue<T>(map: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(map, key) ? map[key] : undefined
}

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
  // ── mytester6 SV6-03 — ชื่อที่แปลทีละคำแล้วอ่านไม่รู้เรื่อง/ผิดความหมาย (คำเรียงแบบอังกฤษ · `postal_code` ⇒ "รหัสไปรษณีย์ รหัส" ·
  //    `national_id` ⇒ "ประชาชน" ทั้งที่เก็บเลขนิติบุคคลด้วย) ⇒ ป้ายเฉพาะ — ข้อความตามหน้าจอของโมดูลนั้นเมื่อมี
  // ผู้รับเงิน/ที่อยู่/ภาษี (mytester6 SV6-03)
  payee_type: 'ประเภทผู้รับเงิน',
  national_id: 'เลขประจำตัวผู้เสียภาษี (บัตรประชาชน/ทะเบียนนิติบุคคล)',
  tax_id: 'เลขประจำตัวผู้เสียภาษี',
  payer_tax_id: 'เลขประจำตัวผู้เสียภาษีผู้จ่าย',
  legal_name: 'ชื่อนิติบุคคล (ตามหนังสือรับรอง)',
  name_title: 'คำนำหน้าชื่อ',
  payee_name_title: 'คำนำหน้าชื่อผู้รับเงิน',
  full_name: 'ชื่อ-นามสกุล',
  short_name: 'ชื่อย่อ',
  name_en: 'ชื่อภาษาอังกฤษ',
  name_key: 'ชื่อสำหรับเทียบซ้ำ',
  name_edited_at: 'เวลาแก้ชื่อ',
  branch_code: 'เลขที่สาขา',
  payer_branch_code: 'เลขที่สาขาผู้จ่าย',
  tax_profile_id: 'กติกาภาษี (Tax Profile)',
  tax_profile_default_id: 'กติกาภาษีค่าเริ่มต้น',
  inhouse_corporate_tax_profile_id: 'กติกาภาษีค่าเริ่มต้น Inhouse นิติบุคคล',
  inhouse_individual_tax_profile_id: 'กติกาภาษีค่าเริ่มต้น Inhouse บุคคลธรรมดา',
  outsource_corporate_tax_profile_id: 'กติกาภาษีค่าเริ่มต้น Outsource นิติบุคคล',
  outsource_individual_tax_profile_id: 'กติกาภาษีค่าเริ่มต้น Outsource บุคคลธรรมดา',
  wht_40_2_pct: 'อัตราหัก ณ ที่จ่าย 40(1)/40(2) (%)',
  income_category_override: 'ประเภทเงินได้ (กำหนดรายคน)',
  income_type: 'ประเภทเงินได้',
  income_type_code: 'รหัสประเภทเงินได้',
  income_type_mode: 'การกำหนดประเภทเงินได้',
  inhouse_income_category: 'ประเภทเงินได้ Inhouse',
  outsource_income_category: 'ประเภทเงินได้ Outsource',
  wht_income_category: 'ประเภทเงินได้ (ภาษีหัก ณ ที่จ่าย)',
  id_document_url: 'ไฟล์เอกสารยืนยันตัวตน',
  id_document_hash: 'ค่าตรวจสอบไฟล์เอกสารยืนยันตัวตน',
  id_document_unverified: 'เอกสารยืนยันตัวตนยังไม่ได้ตรวจ',
  require_payee_id_document: 'บังคับแนบเอกสารยืนยันตัวตนผู้รับเงิน',
  is_verified: 'ยืนยันข้อมูลแล้ว',
  is_payout_account: 'เป็นบัญชีรับเงิน',
  vat_registered: 'จดทะเบียน VAT',
  address_detail: 'ที่อยู่ (บ้านเลขที่/ถนน)',
  address_subdistrict: 'ตำบล/แขวง',
  address_district: 'อำเภอ/เขต',
  address_province: 'จังหวัด',
  address_postal_code: 'รหัสไปรษณีย์',
  address_note: 'หมายเหตุที่อยู่',
  addr_detail: 'ที่อยู่ (บ้านเลขที่/ถนน)',
  addr_subdistrict: 'ตำบล/แขวง',
  addr_district: 'อำเภอ/เขต',
  addr_province: 'จังหวัด',
  addr_postal_code: 'รหัสไปรษณีย์',
  id_card_addr_detail: 'ที่อยู่ตามบัตรประชาชน (บ้านเลขที่/ถนน)',
  id_card_addr_subdistrict: 'ตำบล/แขวง (ตามบัตรประชาชน)',
  id_card_addr_district: 'อำเภอ/เขต (ตามบัตรประชาชน)',
  id_card_addr_province: 'จังหวัด (ตามบัตรประชาชน)',
  id_card_addr_postal_code: 'รหัสไปรษณีย์ (ตามบัตรประชาชน)',
  work_addr_detail: 'ที่อยู่ที่ทำงาน (บ้านเลขที่/ถนน)',
  work_addr_subdistrict: 'ตำบล/แขวง (ที่ทำงาน)',
  work_addr_district: 'อำเภอ/เขต (ที่ทำงาน)',
  work_addr_province: 'จังหวัด (ที่ทำงาน)',
  work_addr_postal_code: 'รหัสไปรษณีย์ (ที่ทำงาน)',
  delivery_addr: 'ที่อยู่จัดส่ง',
  buyer_address: 'ที่อยู่ผู้ซื้อ',
  buyer_phone: 'โทรศัพท์ผู้ซื้อ',
  seller_address: 'ที่อยู่ผู้ขาย',
  seller_phone: 'โทรศัพท์ผู้ขาย',
  payer_address: 'ที่อยู่ผู้จ่าย',
  payer_name: 'ชื่อผู้จ่าย',
  payer_signer_name: 'ชื่อผู้ลงนาม (ผู้จ่าย)',
  payer_signer_title: 'ตำแหน่งผู้ลงนาม (ผู้จ่าย)',
  authorized_signer_name: 'ชื่อผู้มีอำนาจลงนาม',
  authorized_signer_title: 'ตำแหน่งผู้มีอำนาจลงนาม',
  signer_name: 'ชื่อผู้ลงนาม',
  contact_name: 'ชื่อผู้ติดต่อ',
  contact_person: 'ผู้ติดต่อ',
  contact_phone: 'โทรศัพท์ผู้ติดต่อ',
  account_type: 'ประเภทบัญชี',
  // ภาษี/WHT
  wht_issue_zero_rate_40_2_certificate: 'ออกหนังสือรับรองหัก ณ ที่จ่ายแม้อัตรา 0% (40(1)/40(2))',
  issue_zero_rate_40_2_certificate: 'ออกหนังสือรับรองหัก ณ ที่จ่ายแม้อัตรา 0% (40(1)/40(2))',
  wht_min_threshold_satang: 'เกณฑ์ขั้นต่ำที่ต้องหักภาษี ณ ที่จ่าย',
  wht_threshold_scope: 'ขอบเขตการนับเกณฑ์ขั้นต่ำ',
  threshold_scope: 'ขอบเขตการนับเกณฑ์ขั้นต่ำ',
  condition_threshold_satang: 'เกณฑ์ยอดของเงื่อนไข',
  wht_base_included: 'รวมในฐานภาษีหัก ณ ที่จ่าย',
  wht_basis: 'ฐานภาษีหัก ณ ที่จ่าย',
  base_expense_types: 'ประเภทค่าใช้จ่ายที่รวมในฐานภาษี',
  allow_gross_up_conditions: 'อนุญาตเงื่อนไขออกภาษีให้',
  wht_carried_base_satang: 'ฐานภาษีหัก ณ ที่จ่ายที่ยกมา',
  wht_pct_snapshot: 'อัตราภาษีหัก ณ ที่จ่าย (%) ที่บันทึกไว้',
  wht_policy_id: 'นโยบายภาษีหัก ณ ที่จ่าย',
  wht_withheld_by_customer_pct: 'อัตราที่ลูกค้าหัก ณ ที่จ่าย (%)',
  wht_withheld_by_customer_satang: 'ยอดที่ลูกค้าหัก ณ ที่จ่าย',
  customer_wht_certificate_id: 'หนังสือรับรองหัก ณ ที่จ่ายจากลูกค้า',
  withheld_date: 'วันที่หัก ณ ที่จ่าย',
  amount_matches_withheld: 'ยอดตรงกับที่หัก ณ ที่จ่าย',
  amount_matches_adjustment: 'ยอดตรงกับรายการปรับปรุง',
  certificate_mode: 'การออกหนังสือรับรอง',
  replaces_certificate_id: 'ออกแทนหนังสือรับรอง',
  filing_due_date: 'วันครบกำหนดยื่นแบบ',
  supplementary_filed_at: 'เวลายื่นแบบเพิ่มเติม',
  supplementary_filed_by: 'ผู้ยื่นแบบเพิ่มเติม',
  supplementary_required_at: 'เวลาที่ต้องยื่นแบบเพิ่มเติม',
  refreshed_filing_summaries: 'สรุปการยื่นแบบที่คำนวณใหม่',
  pnd1_satang: 'ยอด ภ.ง.ด.1',
  pnd3_satang: 'ยอด ภ.ง.ด.3',
  pnd53_satang: 'ยอด ภ.ง.ด.53',
  vat_mode_snapshot: 'การคิด VAT ที่บันทึกไว้',
  // เอกสารขาย/ภาษี/ใบรับรองแทนใบเสร็จ
  replaces_document_id: 'ออกแทนเอกสาร',
  replaces_invoice_number: 'ออกแทนใบกำกับภาษีเลขที่',
  replaces_receipt_id: 'ออกแทนใบเสร็จ',
  replaces_receipt_number: 'ออกแทนใบเสร็จเลขที่',
  replaces_substitute_receipt_id: 'ออกแทนใบรับรองแทนใบเสร็จ',
  replaces_tax_invoice_id: 'ออกแทนใบกำกับภาษี',
  substitute_receipt_id: 'ใบรับรองแทนใบเสร็จ',
  substitute_receipt_number: 'เลขที่ใบรับรองแทนใบเสร็จ',
  substitute_receipt_total_satang: 'ยอดรวมใบรับรองแทนใบเสร็จ',
  substitute_receipt_max_per_doc_satang: 'ใบรับรองแทนใบเสร็จ: ยอดสูงสุดต่อฉบับ',
  substitute_receipt_max_per_month_satang: 'ใบรับรองแทนใบเสร็จ: ยอดสูงสุดต่อเดือน',
  max_per_doc_satang: 'ยอดสูงสุดต่อฉบับ',
  max_per_month_satang: 'ยอดสูงสุดต่อเดือน',
  receipt_number: 'เลขที่ใบเสร็จ',
  receipt_in_company_name: 'ใบเสร็จออกในนามบริษัท',
  receipt_file_unverified: 'ไฟล์ใบเสร็จยังไม่ได้ตรวจ',
  cash_receipt_id: 'ใบเสร็จรับเงิน',
  credit_note_required: 'ต้องออกใบลดหนี้',
  credit_note_waive_reason: 'เหตุผลที่ไม่ออกใบลดหนี้',
  credit_note_waived_at: 'เวลายกเว้นใบลดหนี้',
  credit_note_waived_by: 'ผู้ยกเว้นใบลดหนี้',
  is_credit: 'เป็นรายการลดหนี้',
  invoice_detail_snapshot: 'รายละเอียดใบกำกับภาษีที่บันทึกไว้',
  default_invoice_delivery_format: 'รูปแบบส่งใบกำกับภาษีค่าเริ่มต้น',
  delivery_format: 'รูปแบบการส่ง',
  delivery_proof_hash: 'ค่าตรวจสอบไฟล์หลักฐานการส่ง',
  delivery_proof_url: 'ไฟล์หลักฐานการส่ง',
  document_mode: 'รูปแบบเอกสาร',
  document_template_snapshot: 'แม่แบบเอกสารที่บันทึกไว้',
  seller_profile_snapshot: 'ข้อมูลผู้ขายที่บันทึกไว้',
  letterhead_snapshot: 'หัวจดหมายที่บันทึกไว้',
  footer_note: 'หมายเหตุท้ายเอกสาร',
  print_signature: 'พิมพ์ลายเซ็น',
  issue_mode: 'วิธีออกเอกสาร',
  last_issued_at: 'เวลาออกเลขล่าสุด',
  last_issued_number: 'เลขที่ออกล่าสุด',
  current_seq: 'เลขลำดับปัจจุบัน',
  current_year: 'ปีปัจจุบัน',
  reset_yearly: 'เริ่มนับใหม่ทุกปี',
  include_year: 'ใส่ปีในเลขที่',
  include_header: 'มีแถวหัวตาราง',
  voucher_number: 'เลขที่ใบสำคัญจ่าย',
  voucher_numbers: 'เลขที่ใบสำคัญจ่าย',
  doc_ref: 'เลขอ้างอิงเอกสาร',
  signed_doc_hash: 'ค่าตรวจสอบไฟล์เอกสารที่เซ็นแล้ว',
  signed_doc_url: 'ไฟล์เอกสารที่เซ็นแล้ว',
  signed_file_path: 'ไฟล์ที่เซ็นแล้ว',
  signed_file_sha256: 'ค่าตรวจสอบไฟล์ที่เซ็นแล้ว',
  signed_satang: 'ยอดที่เซ็นรับ',
  signature_mime_type: 'ชนิดไฟล์ลายเซ็น',
  signature_path: 'ไฟล์ลายเซ็น',
  signature_sha256: 'ค่าตรวจสอบไฟล์ลายเซ็น',
  signature_size_bytes: 'ขนาดไฟล์ลายเซ็น (ไบต์)',
  logo_mime_type: 'ชนิดไฟล์โลโก้',
  logo_sha256: 'ค่าตรวจสอบไฟล์โลโก้',
  logo_size_bytes: 'ขนาดไฟล์โลโก้ (ไบต์)',
  logo_url: 'ไฟล์โลโก้',
  // นโยบายการเงิน/เงินทดรอง/เบิก
  advance_max_amount_per_request_satang: 'ยอดเงินทดรองสูงสุดต่อคำขอ',
  advance_number: 'เลขที่เงินทดรอง',
  advance_offset_satang: 'ยอดหักกลบเงินทดรอง',
  matched_advance_id: 'เงินทดรองที่จับคู่',
  released_advance_ids: 'เงินทดรองที่ปล่อยคืน',
  released_expense_ids: 'รายการเบิกที่ปล่อยคืน',
  reversed_advance_offset_count: 'จำนวนการหักกลบเงินทดรองที่กลับรายการ',
  return_number: 'เลขที่การรับคืน',
  return_outstanding_satang: 'ยอดค้างรับคืน',
  return_outstanding_before_satang: 'ยอดค้างรับคืน (ก่อน)',
  return_outstanding_after_satang: 'ยอดค้างรับคืน (หลัง)',
  due_clear_date: 'วันครบกำหนดเคลียร์',
  clear_reviewed_at: 'เวลาตรวจการเคลียร์',
  clear_reviewed_by: 'ผู้ตรวจการเคลียร์',
  documented_total_satang: 'ยอดรวมที่มีเอกสาร',
  excess_claim_id: 'รายการเบิกส่วนเกิน',
  excess_claim_superseded: 'รายการเบิกส่วนเกินถูกแทนที่',
  superseded_by_expense_id: 'ถูกแทนที่ด้วยรายการเบิก',
  expense_record_id: 'รายการเบิก',
  expense_record_ids: 'รายการเบิก',
  allowance_total_satang: 'ยอดเบี้ยเลี้ยงรวม',
  fuel_total_satang: 'ยอดค่าน้ำมันรวม',
  hotel_nights: 'จำนวนคืนที่พัก',
  field_day_settlement_id: 'การปิดยอดรายวันภาคสนาม',
  field_date: 'วันที่ทำงานภาคสนาม',
  legacy_case_ids: 'เคสที่จ่ายตามกติกาเดิมไปแล้ว (ไม่รวมในการกระจาย)',
  legacy_cutoff_text: 'ข้อความตัดรอบแบบเดิม',
  legacy_scope_note: 'หมายเหตุขอบเขตแบบเดิม',
  payee_recovery: 'ยอดเรียกคืนจากผู้รับเงิน',
  recovery_id: 'ยอดเรียกคืน',
  recovery_offset_satang: 'ยอดหักกลบยอดเรียกคืน',
  approval_flow_role_ids: 'บทบาทในสายอนุมัติ',
  approval_history: 'ประวัติการอนุมัติ',
  approval_matrix_id: 'สายอนุมัติ',
  approval_step_current: 'ขั้นอนุมัติปัจจุบัน',
  approval_step_total: 'จำนวนขั้นอนุมัติ',
  approved_roles: 'บทบาทที่อนุมัติแล้ว',
  approver_roles: 'บทบาทผู้อนุมัติ',
  missing_approver_roles: 'บทบาทผู้อนุมัติที่ยังขาด',
  required_approver_roles: 'บทบาทผู้อนุมัติที่ต้องมี',
  step_role: 'บทบาทของขั้น',
  rejected_at_step: 'ปฏิเสธที่ขั้น',
  enforce_segregation_of_duties: 'บังคับแยกหน้าที่ (ผู้ขอ ≠ ผู้อนุมัติ)',
  executive_approved_at: 'เวลาผู้บริหารอนุมัติ',
  executive_approved_by: 'ผู้บริหารที่อนุมัติ',
  finance_approved_at: 'เวลาการเงินอนุมัติ',
  finance_approved_by: 'การเงินผู้อนุมัติ',
  manager_approved_at: 'เวลาผู้จัดการอนุมัติ',
  manager_approved_by: 'ผู้จัดการที่อนุมัติ',
  // รอบจ่าย/วางบิล/ธนาคาร
  payout_batch_id: 'รอบจ่าย',
  payout_batch_item_id: 'รายการในรอบจ่าย',
  matched_payout_id: 'รอบจ่ายที่จับคู่',
  billing_batch_id: 'รอบวางบิล',
  matched_billing_id: 'รอบวางบิลที่จับคู่',
  batch_number: 'เลขที่รอบ',
  cycle_name: 'ชื่อรอบ',
  bill_outstanding_satang: 'ยอดค้างชำระตามบิล',
  bank_fee_written_off_date: 'วันที่ตัดค่าธรรมเนียมธนาคาร',
  bank_fee_written_off_satang: 'ค่าธรรมเนียมธนาคารที่ตัดจำหน่าย',
  write_off_tolerance_satang: 'ส่วนต่างที่ยอมให้ตัดจำหน่าย',
  auto_match_tolerance_days: 'ส่วนต่างวันที่ยอมรับในการจับคู่อัตโนมัติ (วัน)',
  bank_file_format_id: 'รูปแบบไฟล์ธนาคาร',
  payment_file_format_id: 'รูปแบบไฟล์โอนเงิน',
  statement_format_id: 'รูปแบบไฟล์รายการเดินบัญชี',
  bank_transaction_id: 'รายการเดินบัญชีธนาคาร',
  is_split_allocation: 'แบ่งจับคู่หลายรายการ',
  matched_ref: 'เลขอ้างอิงที่จับคู่',
  matched_via: 'วิธีจับคู่',
  payment_file_generated_at: 'เวลาสร้างไฟล์โอนเงิน',
  payment_file_sha256: 'ค่าตรวจสอบไฟล์โอนเงิน',
  payment_file_url: 'ไฟล์โอนเงิน',
  payment_file_version: 'ฉบับของไฟล์โอนเงิน',
  confirm_file_not_sent: 'ยืนยันว่าไม่ได้ส่งไฟล์',
  pay_due_date: 'วันครบกำหนดจ่าย',
  due_date_source: 'ที่มาของวันครบกำหนด',
  due_rule: 'กติกาวันครบกำหนด',
  due_rule_type: 'ประเภทกติกาวันครบกำหนด',
  due_rule_value: 'ค่าของกติกาวันครบกำหนด',
  cutoff_dates: 'วันที่ตัดรอบ',
  cutoff_rule_type: 'ประเภทกติกาตัดรอบ',
  suspense_note: 'หมายเหตุรายการรอตรวจสอบ',
  refund_file_path: 'ไฟล์หลักฐานคืนเงิน',
  refund_file_sha256: 'ค่าตรวจสอบไฟล์หลักฐานคืนเงิน',
  refund_note: 'หมายเหตุการคืนเงิน',
  column_mapping: 'การจับคู่คอลัมน์',
  // รายได้/ค่าบริการ
  service_fee_base_satang: 'ฐานค่าบริการ',
  service_fee_basis_snapshot: 'ฐานค่าบริการที่บันทึกไว้',
  service_fee_fail_fee_satang: 'ค่าบริการกรณีไม่สำเร็จ',
  service_fee_model_snapshot: 'รูปแบบค่าบริการที่บันทึกไว้',
  service_fee_rate_pct: 'อัตราค่าบริการ (%)',
  service_fee_template_id: 'แม่แบบค่าบริการ',
  prev_service_fee_base_satang: 'ฐานค่าบริการ (เดิม)',
  prev_service_fee_basis: 'ฐานค่าบริการ (เดิม)',
  prev_service_fee_fail_fee_satang: 'ค่าบริการกรณีไม่สำเร็จ (เดิม)',
  prev_service_fee_model: 'รูปแบบค่าบริการ (เดิม)',
  prev_service_fee_rate_pct: 'อัตราค่าบริการ (%) (เดิม)',
  prev_debt_amount_satang: 'ยอดหนี้ (เดิม)',
  prev_closed_at: 'เวลาปิดงาน (เดิม)',
  prev_outcome: 'ผลลัพธ์ (เดิม)',
  fail_fee_satang: 'ค่าบริการกรณีไม่สำเร็จ',
  fee_model_snapshot: 'รูปแบบค่าบริการที่บันทึกไว้',
  debt_amount_satang: 'ยอดหนี้',
  projected_revenue_satang: 'รายได้ประมาณการ',
  projected_revenue_source: 'ที่มาของรายได้ประมาณการ',
  revenue_eligible_case_ids: 'เคสที่เข้าเงื่อนไขรับรู้รายได้',
  revenue_ids_created: 'รายได้ที่สร้าง',
  revenue_ids_released: 'รายได้ที่ปล่อยคืน',
  adjustment_amount_satang: 'ยอดปรับปรุง',
  adjustment_type: 'ประเภทรายการปรับปรุง',
  locked_period_adjustment: 'ปรับปรุงงวดที่ล็อกแล้ว',
  calculation_source: 'ที่มาของการคำนวณ',
  compensation_plan_id: 'แผนค่าตอบแทน',
  asset_value_satang: 'มูลค่าทรัพย์',
  target_current_satang: 'ยอดปัจจุบันของเป้าหมาย',
  // ค่าตั้ง/รอบบัญชี/งาน
  last_readiness_checked_at: 'เวลาตรวจความพร้อมล่าสุด',
  last_readiness_passed_count: 'จำนวนเงื่อนไขที่ผ่าน (ตรวจล่าสุด)',
  last_readiness_total_count: 'จำนวนเงื่อนไขทั้งหมด (ตรวจล่าสุด)',
  period_label: 'งวด',
  period_status_at_target: 'สถานะงวดของรายการ',
  setting_assumptions_confirmed: 'ค่าตั้งที่นักบัญชียืนยันแล้ว',
  assumption_key: 'ค่าตั้งที่รอนักบัญชียืนยัน',
  debtor_document_retention_years: 'ระยะเก็บเอกสารลูกหนี้ (ปี)',
  debtor_documents_purged_at: 'เวลาลบเอกสารลูกหนี้ถาวร',
  files_purged: 'ลบไฟล์ถาวรแล้ว',
  sla_alert_hours: 'แจ้งเตือนเมื่อค้างเกิน (ชั่วโมง)',
  accept_deadline_hours: 'เวลาให้ตอบรับงาน (ชั่วโมง)',
  reassign_timeout_hours: 'เวลาให้ตอบคำขอเปลี่ยนผู้รับผิดชอบ (ชั่วโมง)',
  supervisor_can_assign_system: 'หัวหน้างานมอบหมายงานผ่านระบบได้',
  access_level: 'ระดับสิทธิ์',
  capability_id: 'สิทธิ์',
  functional_group: 'กลุ่มงาน',
  actor_role: 'บทบาทผู้ดำเนินการ',
  viewer_role_group: 'กลุ่มบทบาทผู้ดู',
  view_as_company_id: 'ดูในนามบริษัท',
  on_behalf_of_user_id: 'ทำแทนผู้ใช้',
  shared_with_user_id: 'แชร์ให้ผู้ใช้',
  simulated_as_of: 'จำลอง ณ วันที่',
  password_changed_by_self: 'ผู้ใช้เปลี่ยนรหัสผ่านเอง',
  password_reset_by_admin: 'ผู้ดูแลรีเซ็ตรหัสผ่าน',
  password_set_by_admin: 'ผู้ดูแลตั้งรหัสผ่าน',
  last_login_at: 'เวลาเข้าสู่ระบบล่าสุด',
  last_seen_at: 'เวลาใช้งานล่าสุด',
  session_login_at: 'เวลาเข้าสู่ระบบของเซสชัน',
  employee_code: 'รหัสพนักงาน',
  supabase_uid: 'รหัสผู้ใช้ในระบบยืนยันตัวตน',
  user_agent: 'เบราว์เซอร์/อุปกรณ์',
  ip_address: 'หมายเลข IP',
  team_change_reason: 'เหตุผลที่เปลี่ยนทีม',
  assigned_team_id: 'ทีมที่ได้รับมอบหมาย',
  suggested_team_id: 'ทีมที่ระบบแนะนำ',
  // งานเบื้องหลัง/ส่งออก/รายงาน
  report_id: 'รายงาน',
  report_code: 'รหัสรายงาน',
  range_label: 'ช่วงข้อมูล',
  range_from: 'ข้อมูลตั้งแต่',
  range_to: 'ข้อมูลถึง',
  export_ready: 'พร้อมส่งออก',
  job_type: 'ประเภทงานเบื้องหลัง',
  max_attempts: 'จำนวนครั้งสูงสุดที่ลอง',
  max_retries: 'จำนวนครั้งสูงสุดที่ลองใหม่',
  last_error: 'ข้อผิดพลาดล่าสุด',
  error_message: 'ข้อความข้อผิดพลาด',
  source_job_ref: 'งานเบื้องหลังต้นทาง',
  source_job_type: 'ประเภทงานเบื้องหลังต้นทาง',
  source_file: 'ไฟล์ต้นทาง',
  source_file_line: 'บรรทัดในไฟล์ต้นทาง',
  source_sha: 'ค่าตรวจสอบไฟล์ต้นทาง',
  source_updated_at: 'เวลาแก้ไขข้อมูลต้นทาง',
  cache_key: 'คีย์แคช',
  dedupe_key: 'คีย์กันซ้ำ',
  idempotency_key: 'คีย์กันทำซ้ำ',
  throttle_key: 'คีย์จำกัดความถี่',
  event_code: 'รหัสเหตุการณ์',
  post_completion_synced_at: 'เวลาซิงก์หลังเสร็จสิ้น',
  schedule_order: 'ลำดับในกำหนดการ',
  occurrence_seq: 'ครั้งที่',
  // เคส/ภาคสนาม/คลัง/อุปกรณ์
  case_ref: 'เลขที่สัญญา',
  case_ref_normalized: 'เลขอ้างอิงเคส (ปรับรูปแบบแล้ว)',
  tracking_no: 'เลขพัสดุ',
  tracking_round: 'รอบการติดตาม',
  new_round: 'รอบใหม่',
  previous_round: 'รอบก่อนหน้า',
  debtor_name: 'ชื่อลูกหนี้',
  debtor_national_id: 'เลขบัตรประชาชนลูกหนี้',
  debtor_nationality: 'สัญชาติลูกหนี้',
  debtor_nationality_other: 'สัญชาติลูกหนี้ (อื่น ๆ)',
  debtor_passport_no: 'เลขหนังสือเดินทางลูกหนี้',
  debtor_phone_mobile: 'โทรศัพท์มือถือลูกหนี้',
  debtor_phone_work: 'โทรศัพท์ที่ทำงานลูกหนี้',
  debtor_facebook: 'เฟซบุ๊กลูกหนี้',
  debtor_line_id: 'LINE ID ลูกหนี้',
  client_reject_reason: 'เหตุผลที่ลูกค้าตีกลับ',
  decline_reason: 'เหตุผลที่ปฏิเสธ',
  reject_reason: 'เหตุผลที่ปฏิเสธ',
  reassign_reason: 'เหตุผลที่เปลี่ยนผู้รับผิดชอบ',
  reassigned_from: 'เปลี่ยนผู้รับผิดชอบจาก',
  was_accepted_before_reassign: 'รับงานแล้วก่อนเปลี่ยนผู้รับผิดชอบ',
  pending_reassignment_id: 'คำขอเปลี่ยนผู้รับผิดชอบ',
  from_agent_id: 'จากเจ้าหน้าที่ภาคสนาม',
  to_agent_id: 'ถึงเจ้าหน้าที่ภาคสนาม',
  new_agent_id: 'เจ้าหน้าที่ภาคสนามคนใหม่',
  fail_reason: 'เหตุผลที่ไม่สำเร็จ',
  fail_reason_detail: 'รายละเอียดเหตุผลที่ไม่สำเร็จ',
  resubmit_note: 'หมายเหตุการส่งใหม่',
  revision_note: 'หมายเหตุการแก้ไข',
  review_note: 'หมายเหตุการตรวจ',
  request_note: 'หมายเหตุคำขอ',
  decision_note: 'หมายเหตุการตัดสิน',
  condition_note: 'หมายเหตุสภาพ',
  checkin_type: 'ประเภทการเช็คอิน',
  checked_in_at: 'เวลาเช็คอิน',
  audio_url: 'ไฟล์เสียง',
  evidence_approved_id: 'หลักฐานที่อนุมัติ',
  evidence_file_path: 'ไฟล์หลักฐาน',
  evidence_file_sha256: 'ค่าตรวจสอบไฟล์หลักฐาน',
  travel_origin_lat: 'ละติจูดจุดเริ่มเดินทาง',
  travel_origin_lng: 'ลองจิจูดจุดเริ่มเดินทาง',
  travel_origin_source: 'ที่มาของจุดเริ่มเดินทาง',
  distance_km: 'ระยะทาง (กม.)',
  product_photos: 'รูปสินค้า',
  imei_actual: 'IMEI จริง',
  imei_contract: 'IMEI ตามสัญญา',
  serial_actual: 'หมายเลขเครื่องจริง',
  serial_contract: 'หมายเลขเครื่องตามสัญญา',
  serial_no: 'หมายเลขเครื่อง',
  color_capacity_matched: 'สี/ความจุตรงกับสัญญา',
  color_capacity_note: 'หมายเหตุสี/ความจุ',
  lot_number: 'เลขที่ล็อต',
  asset_capacity: 'ความจุของทรัพย์',
  asset_color: 'สีของทรัพย์',
  asset_description: 'รายละเอียดทรัพย์',
  asset_kind: 'ชนิดทรัพย์',
  asset_status: 'สถานะทรัพย์',
  device_capacity: 'ความจุอุปกรณ์',
  device_color: 'สีอุปกรณ์',
  device_desc: 'รายละเอียดอุปกรณ์',
  device_model_id: 'รุ่นอุปกรณ์',
  brand_id: 'แบรนด์',
  brand_name: 'ชื่อแบรนด์',
  brand_names: 'ชื่อแบรนด์',
  brands_added: 'แบรนด์ที่เพิ่ม',
  model_name: 'ชื่อรุ่น',
  models_added: 'รุ่นที่เพิ่ม',
  models_updated: 'รุ่นที่แก้ไข',
  added_models: 'รุ่นที่เพิ่ม',
  sample_models: 'ตัวอย่างรุ่น',
  capacity_options: 'ตัวเลือกความจุ',
  color_options: 'ตัวเลือกสี',
  release_year: 'ปีที่วางจำหน่าย',
  tacs_added: 'รหัส TAC ที่เพิ่ม',
  tac_checked_at: 'เวลาตรวจรหัส TAC',
  tac_etag: 'รุ่นข้อมูลรหัส TAC',
  tac_imported_at: 'เวลานำเข้ารหัส TAC',
  tac_source_sha: 'ค่าตรวจสอบไฟล์ต้นทางรหัส TAC',
  tac_source_updated_at: 'เวลาแก้ไขข้อมูลต้นทางรหัส TAC',
  // ไฟล์ทั่วไป
  file_url: 'ไฟล์',
  file_urls: 'ไฟล์',
  file_type: 'ชนิดไฟล์',
  file_hashes: 'ค่าตรวจสอบไฟล์',
  file_rows: 'จำนวนแถวในไฟล์',
  photo_hashes: 'ค่าตรวจสอบไฟล์รูปถ่าย',
  link_path: 'ลิงก์',
  line_no: 'ลำดับบรรทัด',
  line_date: 'วันที่ของรายการ',
  answer_text: 'คำตอบ',
  question_text: 'คำถาม',
  changed_fields: 'ฟิลด์ที่เปลี่ยน',
  changed_from: 'เปลี่ยนจาก',
  before_data: 'ข้อมูลก่อนแก้',
  after_data: 'ข้อมูลหลังแก้',
  manual_status: 'สถานะที่ระบุเอง',
  auto_marked: 'ระบบทำเครื่องหมายอัตโนมัติ',
  scope_kind: 'ชนิดขอบเขต',
  target_ref: 'อ้างอิงเป้าหมาย',
  test_status: 'สถานะการทดสอบ',
  confirmed_source: 'ที่มาของการยืนยัน',
  received_source: 'ที่มาของการรับ',
  recent_years: 'ปีล่าสุด',
  external_id: 'รหัสภายนอก',
  year_be: 'ปี (พ.ศ.)',
  mode: 'วิธีดำเนินการ',
  format: 'รูปแบบไฟล์',
  // id ภายนอก/ไฟล์ทั่วไป (camelCase จากโค้ดบางจุด)
  fileName: 'ชื่อไฟล์',

  // ── ตรวจซ้ำ staging SV6-R-01 — คีย์ที่เดิมได้ผลแปลทีละคำ/อังกฤษ (ข้อมูลเสริมของการส่งออก · คีย์ camel · ผลงานเบื้องหลัง)
  // ข้อมูลเสริมของการนำเอกสารออก (`emitDocumentExportAudit` · `details`)
  batch_name: 'ชื่อรอบจ่าย',
  batch_status: 'สถานะรอบจ่าย',
  invoice_status: 'สถานะใบกำกับภาษี',
  lot_status: 'สถานะล็อต',
  company_status: 'สถานะบริษัท',
  case_status: 'สถานะเคส',
  redownload: 'ดาวน์โหลดซ้ำ',
  attachments: 'เอกสารแนบในชุด',
  content_type: 'ชนิดไฟล์',
  storage_path: 'ตำแหน่งไฟล์ในที่เก็บ',
  export_record_id: 'ประวัติการส่งออก',
  criteria: 'เงื่อนไขที่ใช้',
  // ชุดส่งบัญชี: จำนวนเอกสารที่แนบต่อชนิด
  vouchers: 'ใบสำคัญจ่าย',
  billing_invoices: 'ใบแจ้งหนี้',
  tax_invoices: 'ใบกำกับภาษี',
  wht_certificates: 'หนังสือรับรองหัก ณ ที่จ่าย',
  billing_cycle_id: 'รอบวางบิล',
  is_primary: 'บัญชีหลัก',
  attached: 'แนบแล้ว',
  not_attached: 'ยังไม่ได้แนบ',
  // การเข้าถึงที่ถูกปฏิเสธ (พอร์ทัล/ทรัพย์ในคลัง)
  requested_id: 'รหัสที่ขอเปิด',
  section: 'หมวดข้อมูล',
  slot: 'ช่องเอกสาร',
  trigger: 'ที่มาของการสั่งงาน',
  // เคส / การมอบหมาย / ภาคสนาม
  team_changed: 'เปลี่ยนทีมจากที่ระบบเสนอ',
  bundle_documents_confirmed: 'ยืนยันว่าเอกสารชุดมีสัญญาและบัตรครบ',
  product_photo_in_contract: 'รูปสินค้ารวมอยู่ในไฟล์สัญญา',
  new_assignment_id: 'การมอบหมายใหม่',
  finance_company_id: 'บริษัทไฟแนนซ์',
  total_rows: 'จำนวนแถวทั้งหมด',
  failed_rows: 'แถวที่ไม่ผ่าน',
  asset_brand_model: 'ยี่ห้อ/รุ่นทรัพย์',
  asset_imei_serial: 'IMEI/หมายเลขเครื่อง',
  asset_type: 'ประเภททรัพย์',
  document_mode_before: 'รูปแบบเอกสารเดิม',
  storage_file_kept: 'เก็บไฟล์ไว้ในที่เก็บ',
  debtor_documents: 'เอกสารลูกหนี้',
  substitute_receipt_cancelled: 'ยกเลิกใบรับรองแทนใบเสร็จ',
  substitute_receipt_issued: 'ออกใบรับรองแทนใบเสร็จ',
  travel_origin: 'จุดเริ่มเดินทาง',
  travel_origin_before: 'จุดเริ่มเดินทางเดิม',
  fuel_distance_pending: 'ค่าน้ำมันรอคำนวณระยะทาง',
  field_day_expenses_held: 'รายการเบิกรายวันที่พักไว้',
  field_day_expenses_not_held: 'รายการเบิกรายวันที่ไม่ได้พัก',
  superseded_expense_ids: 'รายการเบิกเดิมที่ถูกแทนที่',
  scheduled_at: 'เวลาที่กำหนด',
  scheduled_date: 'วันนัดลงพื้นที่',
  address_current: 'ที่อยู่ปัจจุบัน',
  address_id_card: 'ที่อยู่ตามบัตรประชาชน',
  address_work: 'ที่อยู่ที่ทำงาน',
  postal_code: 'รหัสไปรษณีย์',
  outstanding_debt_satang: 'ยอดหนี้คงเหลือ',
  source_channel: 'ช่องทางที่ส่งเคส',
  // คลัง / ล็อต
  imei_match: 'IMEI ตรงกัน',
  removed_asset_id: 'ทรัพย์ที่นำออก',
  asset_ids_handed_over: 'ทรัพย์ที่ส่งมอบแล้ว',
  revenue_by_case: 'ผลการสร้างรายได้รายเคส',
  expense_ids_unlocked: 'รายการเบิกที่ปลดล็อก',
  // การเงิน / ภาษี / ผู้ใช้
  suspended_reason: 'เหตุผลที่ระงับ',
  advance_offsets: 'หักกลบเงินทดรอง',
  sales_record_id: 'รายการขาย',
  reversal_reason: 'เหตุผลที่กลับรายการ',
  ar_aging_buckets: 'ช่วงอายุลูกหนี้ (วัน)',
  role_name: 'บทบาท',
  user_full_name: 'ชื่อผู้ใช้',
  signer_title: 'ตำแหน่งผู้ลงนาม',
  // ผลของงานเบื้องหลัง (`jobs.result`) และข้อมูลแนบ (`jobs.payload`)
  due: 'ถึงกำหนด',
  resolved: 'จัดการแล้ว',
  skipped: 'ข้าม',
  sent: 'ส่งแล้ว',
  retried: 'ลองใหม่',
  failed: 'ไม่สำเร็จ',
  marked: 'ทำเครื่องหมายแล้ว',
  notified: 'แจ้งเตือนแล้ว',
  refreshed: 'ปรับปรุงแล้ว',
  settled: 'คำนวณแล้ว',
  already_settled: 'คำนวณไว้แล้ว (ข้าม)',
  period_locked: 'งวดปิดแล้ว (รอสร้างย้อนหลัง)',
  period_locked_notified: 'แจ้งเรื่องงวดปิดแล้ว',
  approval_notified: 'แจ้งผู้อนุมัติแล้ว',
  expenses_created: 'รายการเบิกที่สร้าง',
  cases_purged: 'เคสที่ลบเอกสารถาวร',
  files_failed: 'ไฟล์ที่ลบไม่สำเร็จ',
  organizations: 'จำนวนองค์กร',
  already_done: 'ทำไว้แล้ว (ข้าม)',
  expense_record_count: 'จำนวนรายการเบิก',
  dev_trigger: 'สั่งจากเครื่องมือทดสอบ',
  as_of: 'ณ วันที่',
  force: 'บังคับทำใหม่',
  confirm_duplicate: 'ยืนยันสร้างซ้ำ',
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

interface ComposedFieldLabel {
  label: string
  /** จำนวนคำที่แปลมาต่อกัน (ไม่นับคำนำหน้าจากคำท้าย เช่น "เวลา"/"วันที่") */
  words: number
}

function composeFieldLabel(field: string): ComposedFieldLabel | null {
  const tokens = auditFieldTokens(field)
  if (tokens[0] === 'is' && tokens.length > 1) tokens.shift()
  const last = tokens[tokens.length - 1]
  let lead = ''
  const leading = last !== undefined && tokens.length > 1 ? ownValue(LEADING_FROM_SUFFIX, last) : undefined
  if (leading !== undefined) {
    lead = leading
    tokens.pop()
  }
  const words: string[] = []
  for (const token of tokens) {
    const word = ownValue(AUDIT_FIELD_TOKEN_LABEL, token)
    if (word === undefined) return null
    if (word !== '') words.push(word)
  }
  const label = `${lead}${words.join(' ')}`.trim()
  return label === '' ? null : { label, words: words.length }
}

/** ป้ายจากการแปลทีละคำ · มีคำที่ไม่รู้จัก ⇒ `null` */
export function auditComposedFieldLabel(field: string): string | null {
  return composeFieldLabel(field)?.label ?? null
}

function specificFieldLabel(field: string): string | undefined {
  return NORMALIZED_FIELD_LABELS.get(normalizeFieldName(field))
}

/** ชื่อฟิลด์ภาษาไทยของตาราง "ค่าก่อน / หลัง" — ป้ายเฉพาะ → แปลทีละคำ → ชื่อเดิม (ไม่พัง) */
export function auditFieldLabel(field: string): string {
  return specificFieldLabel(field) ?? auditComposedFieldLabel(field) ?? field
}

/**
 * ตรวจซ้ำ staging SV6-R-01 — ป้ายของฟิลด์นี้มาจากการแปลทีละคำตั้งแต่ 2 คำขึ้นไป (เช่น "รอบ ชื่อ" · "ทีม เปลี่ยน")
 * ซึ่งมักอ่านไม่รู้เรื่อง ⇒ คีย์ที่รู้จักในซอร์ส/สคีมาต้องมีป้ายเฉพาะ (`field-label-coverage.test.ts` ล็อก)
 * คำเดียว + คำนำหน้าจากคำท้าย (`cancelled_at` ⇒ "เวลายกเลิก") ถือว่าอ่านได้
 */
export function auditFieldLabelIsWordByWord(field: string): boolean {
  if (specificFieldLabel(field) !== undefined) return false
  const composed = composeFieldLabel(field)
  return composed !== null && composed.words >= 2
}

// ── ค่า enum / boolean ─────────────────────────────────────────────────────────

const PERIOD_STATUSES: readonly AccountingPeriodStatus[] = ['collecting', 'sent_to_accountant', 'locked']
const PERIOD_STATUS_LABEL: LabelMap = Object.fromEntries(
  PERIOD_STATUSES.map((status) => [status, periodLockPolicyFor(status).statusLabel]),
)

/** สถานะคำขอเปลี่ยนผู้รับผิดชอบ / ผลของคำขอ — ข้อความเดียวกับหน้าภาคสนาม/มอบหมายงาน */
const PENDING_REASSIGNMENT_STATUS_LABEL: LabelMap = {
  waiting_consent: 'รอผู้รับผิดชอบเดิมยินยอม',
  consented: 'ยินยอมแล้ว',
  declined: 'ไม่ยินยอม',
  timeout_auto: 'หมดเวลา — ระบบเปลี่ยนให้อัตโนมัติ',
}
const BANK_FILE_TEST_STATUS_LABEL: LabelMap = { pending: 'ยังไม่ทดสอบ', passed: 'ทดสอบผ่าน', failed: 'ทดสอบไม่ผ่าน' }

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
  case_assignments: FIELD_STATUS_LABEL,
  pending_reassignments: PENDING_REASSIGNMENT_STATUS_LABEL,
  bank_file_formats: BANK_FILE_TEST_STATUS_LABEL,
  device_tac_updates: { success: 'อัปเดตสำเร็จ', not_modified: 'ไม่มีข้อมูลใหม่', failed: 'ไม่สำเร็จ' },
  // คอลัมน์ TEXT (ไม่ใช่ enum) — active | suspended
  finance_companies: { active: 'ใช้งาน', suspended: 'ระงับ' },
}

/**
 * ตรวจซ้ำ staging SV6-R-02 — สถานะที่เก็บในชื่อฟิลด์อื่น (ข้อมูลเสริมของการส่งออก/การเข้าถึง) ⇒ ใช้ชุดสถานะของชนิดเป้าหมายนั้น
 * (`batch_status` ของ PDF รอบจ่าย = สถานะรอบจ่าย ไม่ใช่สถานะทั่วไป)
 */
const STATUS_TARGET_BY_FIELD: ReadonlyMap<string, string> = new Map(
  Object.entries({
    batch_status: 'payout_batches',
    invoice_status: 'tax_invoices',
    lot_status: 'handover_lots',
    company_status: 'finance_companies',
    case_status: 'cases',
  }).map(([field, target]) => [normalizeFieldName(field), target]),
)

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
  deleted: 'ลบแล้ว',
  success: 'สำเร็จ',
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

/**
 * mytester6 SV6-03 — ค่าอังกฤษที่ยังหลุด: ประเภทผู้รับเงิน · ที่มาของวันหยุด · วิธีส่งออก/ชื่อรายงานในประวัติการส่งออก
 * (ข้อความชุดเดียวกับหน้าจอของโมดูลนั้น · รายงานใช้ `REPORT_DEFINITIONS` กลาง)
 */
const PAYEE_TYPE_VALUE_LABEL: Readonly<Record<PayeeType, string>> = { individual: 'บุคคลธรรมดา', corporate: 'นิติบุคคล' }
/** `source` หลายตาราง (วันหยุด/เคส/แคตตาล็อกอุปกรณ์/TAC/จุดเริ่มเดินทาง) — ค่าไม่ชนความหมายกัน */
const SOURCE_VALUE_LABEL: LabelMap = {
  ...TAC_SOURCE_LABEL,
  manual: 'เพิ่มเอง',
  import: 'นำเข้า',
  api: 'API',
  manual_adjusted: 'ปรับตำแหน่งเอง',
  bank_reconciliation: 'จากการจับคู่รายการเดินบัญชี',
  public_holidays: 'วันหยุดราชการ',
  gps_auto: 'GPS อัตโนมัติ',
}
const MODE_VALUE_LABEL: LabelMap = {
  sync: 'ส่งออกทันที',
  job: 'งานเบื้องหลัง',
  auto: 'อัตโนมัติ',
  manual: 'ระบุเอง',
  view_as: 'ดูในนามลูกค้า',
}
const FORMAT_VALUE_LABEL: LabelMap = { xlsx: 'Excel (XLSX)', pdf: 'PDF', csv: 'CSV' }

/**
 * mytester6 SV6-03 — ค่า enum ของคอลัมน์ทุกตัวในสคีมาต้องมีป้าย (`field-label-coverage.test.ts` ล็อก) · ป้ายชุดเดียวกับหน้าจอ
 * ของโมดูลนั้นเมื่อมี (บางชุดอยู่ใน component — คัดข้อความมา เพราะ lib ห้าม import จาก components)
 */
const CASE_OUTCOME_VALUE_LABEL: LabelMap = { closed_success: 'ปิดงานสำเร็จ', closed_fail: 'ปิดงานไม่สำเร็จ' }
const CYCLE_TYPE_VALUE_LABEL: LabelMap = { AR: 'AR — วางบิลลูกค้า', AP: 'AP — จ่ายเงินทีม' }
const CUTOFF_RULE_VALUE_LABEL: LabelMap = { fixed_dates: 'วันที่คงที่ทุกเดือน', month_end: 'ทุกสิ้นเดือน' }
const DUE_RULE_VALUE_LABEL: LabelMap = {
  net_days: 'Net X วัน นับจากวันตัดรอบ',
  day_of_next_month: 'วันที่ X ของเดือนถัดไป',
  month_end: 'สิ้นเดือน',
}
const FILE_TYPE_VALUE_LABEL: LabelMap = { CSV: 'CSV', TXT: 'TXT (ข้อความ)' }
const ENCODING_VALUE_LABEL: LabelMap = { UTF_8: 'UTF-8', TIS_620: 'TIS-620 (ภาษาไทยแบบเก่า)' }
const ACCESS_LEVEL_VALUE_LABEL: LabelMap = { view: 'ดูอย่างเดียว', manage: 'ทำได้' }
const TAX_INVOICE_DOC_KIND_LABEL: LabelMap = {
  tax_invoice: 'ใบกำกับภาษี',
  receipt_tax_invoice: 'ใบเสร็จรับเงิน/ใบกำกับภาษี',
}
const TAC_UPDATE_TRIGGER_LABEL: LabelMap = { daily: 'อัปเดตรายวันอัตโนมัติ', manual: 'สั่งอัปเดตเอง', file: 'นำเข้าไฟล์' }
const REASSIGNMENT_RESOLUTION_LABEL: LabelMap = {
  consented: 'ยินยอมแล้ว',
  timeout_auto: 'หมดเวลา — ระบบเปลี่ยนให้อัตโนมัติ',
}
/** id ของรายงาน (`kpi-summary`) ⇒ "E1 KPI ภาพรวม" — ชื่อเดียวกับหน้ารายงาน */
const REPORT_ID_VALUE_LABEL: LabelMap = Object.fromEntries(
  REPORT_DEFINITIONS.map((report) => [report.id, `${report.code} ${report.title}`]),
)

const MAPPING_RULE_VALUE_LABEL: LabelMap = { auto: 'อัตโนมัติ (Auto)', manual: 'ระบุเอง (Manual)' }
/**
 * ตรวจซ้ำ staging SV6-R-02 — ค่ารหัสที่ไม่ใช่ enum ของ Prisma (string union/ค่าคงที่ใน TS) · ใช้ชุดป้ายของโมดูลเมื่อมี
 * (`field-label-coverage.test.ts` สแกนค่าตัวอักษรใน payload ของ audit ให้มีป้ายครบ)
 */
const MATCHED_VIA_VALUE_LABEL: LabelMap = { proposal: 'ยืนยันคู่ที่ระบบเสนอ', auto: 'อัตโนมัติ', manual: 'เลือกเอง' }
const KIND_VALUE_LABEL: Readonly<Record<PersonalDataFile['kind'] | 'billing' | 'payout', string>> = {
  case_document: 'เอกสารเคส',
  customer_wht: 'หนังสือรับรองหัก ณ ที่จ่ายจากลูกค้า',
  substitute_receipt_signed: 'ใบรับรองแทนใบเสร็จที่ลงนามแล้ว',
  company_document: 'เอกสารบริษัทไฟแนนซ์',
  payee_id_document: 'เอกสารยืนยันตัวตนผู้รับเงิน',
  billing: 'รอบวางบิล',
  payout: 'รอบจ่ายเงิน',
}
/** สาเหตุที่ถูกปฏิเสธการเข้าถึง (พอร์ทัล/เปิดเอกสาร) — `company_status:<สถานะ>` แปลแยกที่ `causeLabel()` */
const ACCESS_DENIED_CAUSE_LABEL: LabelMap = {
  not_company_user: 'ไม่ใช่ผู้ใช้ของบริษัทไฟแนนซ์',
  company_missing: 'ไม่พบบริษัทของผู้ใช้',
  missing: 'ไม่พบข้อมูล',
  missing_capability: 'ไม่มีสิทธิ์ดูหมวดนี้',
  missing_capability_or_download: 'ไม่มีสิทธิ์ดูหมวดนี้หรือดาวน์โหลด',
  view_as_by_company_user: 'ผู้ใช้ของบริษัทใช้โหมดดูในนามลูกค้าไม่ได้',
  view_as_company_not_found: 'ไม่พบบริษัทที่ขอดูในนาม',
  view_as_missing_capability: 'ไม่มีสิทธิ์ดูในนามลูกค้า',
  row_not_found: 'ไม่พบรายการที่ขอ',
  asset_not_viewable: 'ทรัพย์นี้ยังไม่เปิดให้ลูกค้าดู',
  cross_company: 'รายการเป็นของบริษัทอื่น',
}
/** รหัสผลของการเข้าสู่ระบบ/การเข้าถึงที่ไม่สำเร็จ (ข้อความเดียวกับช่องเหตุผลของบันทึกการใช้งาน) */
export const AUDIT_RESULT_CODE_LABEL: LabelMap = {
  INVALID_CREDENTIALS: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
  LOGIN_RATE_LIMITED: 'ถูกพักชั่วคราว — ใส่รหัสผิดหลายครั้ง',
  ACCOUNT_INACTIVE: 'บัญชีถูกปิดใช้งาน',
  COMPANY_SUSPENDED: 'บริษัทถูกระงับ',
  USER_NOT_PROVISIONED: 'ยังไม่ได้ตั้งค่าบัญชีในระบบ',
  PERMISSION_DENIED: 'ไม่มีสิทธิ์เข้าถึง',
}
const PORTAL_SECTION_VALUE_LABEL: Readonly<Record<PortalSection, string>> = {
  cases: 'เคส',
  finance: 'การเงิน',
  handover: 'การส่งมอบ',
  profile: 'ข้อมูลบริษัท',
}
const RESULT_VALUE_LABEL: LabelMap = { success: 'สำเร็จ', failed: 'ไม่สำเร็จ', created: 'สร้างแล้ว', skipped: 'ข้าม' }
/** เหตุผลที่ยังไม่เกิดรายได้ (`revenueByCase[].reason`) — ค่าข้อความอิสระอื่นของ `reason` ไม่ตรงคีย์ จึงไม่ถูกแตะ */
const REVENUE_SKIP_REASON_LABEL: Readonly<Record<RevenueSkipReason, string>> = {
  no_snapshot: 'ยังไม่ได้บันทึกค่าบริการตอนอนุมัติเคส',
  no_outcome: 'เคสยังไม่ปิดงาน',
  model_excludes_fail: 'รูปแบบค่าบริการไม่คิดเคสไม่สำเร็จ',
  field_days_not_settled: 'ค่าเบี้ยเลี้ยงรายวันยังคำนวณไม่ครบ',
  expense_not_approved: 'รายการเบิกยังไม่อนุมัติ',
  warehouse_gate: 'ยังไม่ผ่านการส่งมอบที่คลัง',
  already_created: 'สร้างรายได้ไว้แล้ว',
  missing_basis: 'ไม่มีฐานคำนวณค่าบริการ',
}
const CASE_ACTION_VALUE_LABEL: Readonly<Record<CaseStatusAction, string>> = Object.fromEntries(
  CASE_STATUS_ACTIONS.map((action) => [action, CASE_STATUS_RULES[action].label]),
) as Record<CaseStatusAction, string>
/** `trigger`: การอัปเดตฐาน TAC + เหตุที่หลักฐานปิดงานผ่านอัตโนมัติ */
const TRIGGER_VALUE_LABEL: LabelMap = {
  ...TAC_UPDATE_TRIGGER_LABEL,
  asset_intake: 'คลังรับเครื่องเข้าแล้ว',
  expense_approved: 'ค่าตอบแทนของเคสได้รับอนุมัติแล้ว',
}
/** เอกสารของล็อตที่เปิด/ดาวน์โหลด (`document` ของพอร์ทัล/คลัง) */
const LOT_DOCUMENT_VALUE_LABEL: LabelMap = {
  signed_doc: 'ใบเซ็นรับ',
  delivery_note: 'ใบส่งมอบ (PDF)',
  delivery_proof: 'หลักฐานการส่งมอบ',
}
const RECORD_SOURCE_VALUE_LABEL: LabelMap = { bank_reconciliation: 'จากการจับคู่รายการเดินบัญชี', manual: 'บันทึกเอง' }
const JOB_TYPE_VALUE_LABEL: LabelMap = Object.fromEntries(JOB_TYPES.map((code) => [code, jobTypeLabel(code)]))
const MIME_VALUE_LABEL: LabelMap = {
  'application/pdf': 'PDF',
  'image/jpeg': 'รูปภาพ JPEG',
  'image/png': 'รูปภาพ PNG',
  'image/webp': 'รูปภาพ WebP',
  'image/heic': 'รูปภาพ HEIC',
  'text/csv': 'CSV',
  'text/plain': 'ข้อความ (TXT)',
  'application/zip': 'ZIP',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel (XLSX)',
}
const CALCULATION_SOURCE_VALUE_LABEL: LabelMap = { compensation_plan: 'คำนวณจากแผนค่าตอบแทน', manual: 'กรอกเอง' }
const ACCOUNT_TYPE_VALUE_LABEL: LabelMap = { savings: 'ออมทรัพย์', current: 'กระแสรายวัน' }
const WHT_BASIS_VALUE_LABEL: Readonly<Record<WhtBasis, string>> = {
  before_vat: 'ยอดก่อน VAT (มาตรฐาน)',
  gross_amount: 'ยอดรวมทั้งสิ้น',
}
const CONTEXT_VALUE_LABEL: LabelMap = { change_password: 'เปลี่ยนรหัสผ่าน' }
const CHANGED_FROM_VALUE_LABEL: LabelMap = { finance_companies: 'หน้าบริษัทไฟแนนซ์' }
/** ผลอัปเดตฐาน TAC (`path` ในผลงานเบื้องหลัง) — ค่า path ไฟล์จริงไม่ตรงคีย์ จึงไม่ถูกแตะ */
const TAC_SYNC_PATH_VALUE_LABEL: LabelMap = {
  sha_unchanged: 'ไฟล์ต้นทางไม่เปลี่ยน',
  etag_not_modified: 'ไม่มีข้อมูลใหม่',
  downloaded: 'ดาวน์โหลดข้อมูลใหม่',
  file: 'นำเข้าไฟล์',
}

const CHANNEL_VALUE_LABEL: LabelMap = { internal: 'ดาวน์โหลดในระบบ', portal: 'พอร์ทัลลูกค้า', ...ADVANCE_RETURN_CHANNEL_LABEL }

/** ค่า enum ตามชื่อฟิลด์ (normalize แล้ว) — ไม่ขึ้นกับชนิดเป้าหมาย */
const VALUE_LABEL_BY_FIELD: ReadonlyMap<string, LabelMap> = new Map(
  Object.entries({
    level: EXCEPTION_LEVEL_LABEL,
    source_module: EXCEPTION_MODULE_LABEL,
    certificate_status: WHT_CERTIFICATE_STATUS_LABEL,
    mapping_rule: MAPPING_RULE_VALUE_LABEL,
    failed_checks: READINESS_CHECK_LABEL,
    channel: CHANNEL_VALUE_LABEL,
    document: { ...EXPORT_DOCUMENT_LABEL, ...LOT_DOCUMENT_VALUE_LABEL },
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
    document_type: { ...COMPANY_DOCUMENT_LABEL, ...TEMPLATE_DOCUMENT_TYPE_LABEL, ...DOCUMENT_SLOT_LABEL },
    usage: BANK_ACCOUNT_USAGE_LABEL,
    source_channel: CASE_SOURCE_LABEL,
    period_status_at_target: PERIOD_STATUS_LABEL,
    payee_type: PAYEE_TYPE_VALUE_LABEL,
    source: SOURCE_VALUE_LABEL,
    mode: MODE_VALUE_LABEL,
    format: FORMAT_VALUE_LABEL,
    report_id: REPORT_ID_VALUE_LABEL,
    doc_type: DOCUMENT_NUMBER_LABEL,
    functional_group: FUNCTIONAL_GROUP_LABEL,
    access_level: ACCESS_LEVEL_VALUE_LABEL,
    default_invoice_delivery_format: INVOICE_DELIVERY_FORMAT_LABEL,
    delivery_format: { ...INVOICE_DELIVERY_FORMAT_LABEL, ...WHT_DELIVERY_FORMAT_LABEL },
    model: SERVICE_FEE_MODEL_LABEL,
    service_fee_model_snapshot: SERVICE_FEE_MODEL_LABEL,
    prev_service_fee_model: SERVICE_FEE_MODEL_LABEL,
    fee_model_snapshot: SERVICE_FEE_MODEL_LABEL,
    basis: SERVICE_FEE_BASIS_LABEL,
    service_fee_basis_snapshot: SERVICE_FEE_BASIS_LABEL,
    prev_service_fee_basis: SERVICE_FEE_BASIS_LABEL,
    income_type_code: TAX_PROFILE_INCOME_TYPE_OPTION_LABEL,
    base_expense_types: EXPENSE_TYPE_LABEL,
    certificate_mode: WHT_CERTIFICATE_MODE_LABEL,
    issue_mode: WHT_CERTIFICATE_MODE_LABEL,
    income_type_mode: WHT_INCOME_TYPE_MODE_LABEL,
    inhouse_income_category: WHT_INCOME_CATEGORY_LABEL,
    outsource_income_category: WHT_INCOME_CATEGORY_LABEL,
    income_category_override: WHT_INCOME_CATEGORY_LABEL,
    wht_income_category: WHT_INCOME_CATEGORY_LABEL,
    threshold_scope: WHT_THRESHOLD_SCOPE_LABEL,
    wht_threshold_scope: WHT_THRESHOLD_SCOPE_LABEL,
    type: { ...CYCLE_TYPE_VALUE_LABEL, ...HANDOVER_TYPE_LABEL },
    cutoff_rule_type: CUTOFF_RULE_VALUE_LABEL,
    due_rule_type: DUE_RULE_VALUE_LABEL,
    scope_kind: CYCLE_SCOPE_LABEL,
    purpose: BANK_FILE_PURPOSE_LABEL,
    file_type: FILE_TYPE_VALUE_LABEL,
    encoding: ENCODING_VALUE_LABEL,
    test_status: BANK_FILE_TEST_STATUS_LABEL,
    debtor_nationality: DEBTOR_NATIONALITY_LABEL,
    asset_kind: ASSET_TYPE_LABEL,
    outcome: CASE_OUTCOME_VALUE_LABEL,
    prev_outcome: CASE_OUTCOME_VALUE_LABEL,
    resolution: REASSIGNMENT_RESOLUTION_LABEL,
    manual_status: DEVICE_CATALOG_STATUS_LABEL,
    checkin_type: CHECKIN_TYPE_LABEL,
    asset_status: ASSET_STATUS_LABEL,
    condition: ASSET_CONDITION_LABEL,
    vat_mode_snapshot: VAT_MODE_LABEL,
    adjustment_type: ADJUSTMENT_TYPE_LABEL,
    doc_kind: TAX_INVOICE_DOC_KIND_LABEL,
    // ตรวจซ้ำ staging SV6-R-02 — ค่ารหัสที่ไม่ใช่ enum ในสคีมา (string union/ค่าคงที่ใน TS)
    matched_via: MATCHED_VIA_VALUE_LABEL,
    kind: KIND_VALUE_LABEL,
    slot: DOCUMENT_SLOT_LABEL,
    document_mode: DOCUMENT_MODE_LABEL,
    document_mode_before: DOCUMENT_MODE_LABEL,
    cause: ACCESS_DENIED_CAUSE_LABEL,
    code: AUDIT_RESULT_CODE_LABEL,
    section: PORTAL_SECTION_VALUE_LABEL,
    result: RESULT_VALUE_LABEL,
    reason: REVENUE_SKIP_REASON_LABEL,
    action: CASE_ACTION_VALUE_LABEL,
    trigger: TRIGGER_VALUE_LABEL,
    received_source: RECORD_SOURCE_VALUE_LABEL,
    confirmed_source: RECORD_SOURCE_VALUE_LABEL,
    job_type: JOB_TYPE_VALUE_LABEL,
    mime_type: MIME_VALUE_LABEL,
    content_type: MIME_VALUE_LABEL,
    logo_mime_type: MIME_VALUE_LABEL,
    signature_mime_type: MIME_VALUE_LABEL,
    asset_type: ASSET_TYPE_LABEL,
    fail_reason: CLOSE_FAIL_REASON_LABEL,
    calculation_source: CALCULATION_SOURCE_VALUE_LABEL,
    account_type: ACCOUNT_TYPE_VALUE_LABEL,
    wht_basis: WHT_BASIS_VALUE_LABEL,
    context: CONTEXT_VALUE_LABEL,
    changed_from: CHANGED_FROM_VALUE_LABEL,
    path: TAC_SYNC_PATH_VALUE_LABEL,
    events: AUDIT_EVENT_LABEL,
    // ชนิดเป้าหมายของรายการปรับปรุง (`after.target_type` — ค่าเอกพจน์ `revenue`/`expense`)
    target_type: ADJUSTMENT_TARGET_LABEL,
  } satisfies Record<string, LabelMap>).map(([field, labels]) => [normalizeFieldName(field), labels]),
)

/**
 * สาเหตุแบบมีสถานะต่อท้าย (`company_status:suspended` · `user_status:inactive` · `lot_not_confirmed:draft` ·
 * `not_we_deliver:client_pickup`) ⇒ ข้อความไทย + ป้ายสถานะ/ประเภท · ไม่ใช่รูปแบบนี้ = `null`
 */
function causeWithStatusLabel(value: string): string | null {
  const match = /^(company_status|user_status|lot_not_confirmed|not_we_deliver):(\w+)$/.exec(value)
  const kind = match?.[1]
  const code = match?.[2]
  if (kind === undefined || code === undefined) return null
  if (kind === 'company_status') {
    if (code === 'missing') return 'ไม่พบบริษัทของผู้ใช้'
    return `บริษัทมีสถานะ ${ownValue(STATUS_LABEL_BY_TARGET.finance_companies ?? {}, code) ?? code}`
  }
  if (kind === 'user_status') return `บัญชีผู้ใช้มีสถานะ ${ownValue(GENERIC_STATUS_LABEL, code) ?? code}`
  if (kind === 'lot_not_confirmed') return `ล็อตยังไม่ยืนยันส่งมอบ (${ownValue(LOT_STATUS_LABELS, code) ?? code})`
  return `ล็อตไม่ใช่แบบบริษัทนำส่ง (${ownValue(HANDOVER_TYPE_LABEL, code) ?? code})`
}

function enumLabel(value: string, field: string, targetType: string | null): string | null {
  const key = normalizeFieldName(field)
  const statusTarget = STATUS_TARGET_BY_FIELD.get(key)
  if (key === 'status' || statusTarget !== undefined) {
    const target = statusTarget ?? targetType
    const targetLabels = target === null ? undefined : ownValue(STATUS_LABEL_BY_TARGET, target)
    const byTarget = targetLabels === undefined ? undefined : ownValue(targetLabels, value)
    return byTarget ?? ownValue(GENERIC_STATUS_LABEL, value) ?? null
  }
  if (key === 'cause') {
    const prefixed = causeWithStatusLabel(value)
    if (prefixed !== null) return prefixed
  }
  const labels = VALUE_LABEL_BY_FIELD.get(key)
  return labels === undefined ? null : (ownValue(labels, value) ?? null)
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
