import type { TaxProfileDefaults } from '@/lib/settings/tax-profile-defaults'
import type {
  WhtCertificateMode,
  WhtFilingMethod,
  WhtIncomeCategory,
  WhtIncomeTypeMode,
  WhtPolicySettings,
} from '@/lib/settings/wht-policy'
import type {
  ExpenseType,
  BankAccountUsage,
  BankFileEncoding,
  BankFileTestStatus,
  BankFileType,
  BankFilePurpose,
  TaxProfileIncomeType,
  CutoffRuleType,
  CycleScopeKind,
  CycleType,
  DueRuleType,
  TemplateDocumentType,
  WhtFilingForm,
} from '@/lib/generated/prisma/enums'
import type { MatrixLevel } from '@/lib/roles/matrix'
import type { WhtBasis } from '@/lib/settings/tax-profile'

/**
 * รูปร่างข้อมูลที่ API ของไฟล์ 13 ส่งออก — **pure ล้วน (type-only)** เพื่อให้ฝั่ง client import ได้
 * โดยไม่ลาก Prisma/`pg` เข้า bundle (ดูกับดัก 2026-08-14 ใน `REUSE_INDEX`)
 *
 * เงินทุกช่องลงท้าย `Satang` เสมอ · วันที่ส่งเป็น **ISO 8601 UTC** (`03` §6.5) แล้วให้ FE แปลง
 * เป็น พ.ศ. ด้วย `fmtDate`/`fmtDateTime` — API ไม่ส่งข้อความวันที่ที่ format แล้ว
 */

export interface CycleDto {
  id: string
  name: string
  type: CycleType
  cutoffRuleType: CutoffRuleType
  cutoffDates: number[]
  /** ข้อความกติกาตัดรอบแบบอิสระเดิม (ก่อนมติ PO U146) — อ้างอิงเท่านั้น · รอบใหม่ = null */
  legacyCutoffText: string | null
  dueRuleType: DueRuleType
  dueRuleValue: number | null
  /** label ที่ผู้ใช้เห็น — ห้าม parse มาคำนวณ (A5) */
  dueRule: string
  /** ขอบเขตจริง (มติ PO U133) */
  scopeKind: CycleScopeKind
  /** บริษัทที่รอบบิลใช้ (เฉพาะ selected_companies) — เรียงตามชื่อ */
  companies: Array<{ id: string; name: string }>
  /** ข้อความ "ใช้กับ" แบบอิสระเดิมก่อนมติ — อ้างอิงเท่านั้น · รอบใหม่ = null */
  legacyScopeNote: string | null
  isActive: boolean
  updatedAt: string
}

export interface ApprovalMatrixDto {
  id: string
  condition: string
  conditionThresholdSatang: number | null
  /** role id ต่อขั้น — ค่าที่เก็บจริง (มติ PO U149) */
  approvalFlowRoleIds: string[]
  /** ชื่อ role **ปัจจุบัน** ของแต่ละขั้น (แสดงผล) — ลำดับเดียวกับ `approvalFlowRoleIds` */
  approvalFlow: string[]
  enforceSegregationOfDuties: boolean
  isActive: boolean
  updatedAt: string
}

export interface FinancePolicyDto {
  advanceMaxAmountPerRequestSatang: number | null
  requirePayeeIdDocument: boolean
  arAgingBuckets: number[]
  /** ชื่อช่วงอายุหนี้ที่รายงาน AR Aging ใช้ (ไฟล์ 19 §6.4) — คำนวณจาก `arAgingBuckets` */
  arAgingLabels: string[]
  writeOffToleranceSatang: number
  /** มติ PO U103 — เพดานใบรับรองแทนใบเสร็จต่อใบ / ต่อคนต่อเดือน */
  substituteReceiptMaxPerDocSatang: number
  substituteReceiptMaxPerMonthSatang: number
  /** `null` = ยังไม่เคยตั้งค่า (ค่าที่เห็นคือค่าเริ่มต้น ยังไม่มีแถวใน DB) */
  updatedAt: string | null
}

/** §6.14 เกณฑ์ SLA งานติดตาม (D18) — เก็บที่ `assignment_policy_settings` */
export interface SlaPolicyDto {
  slaAlertHours: number
  /** `null` = ยังไม่เคยตั้งค่า (ค่าที่เห็นคือค่าเริ่มต้นของระบบ ยังไม่มีแถวใน DB) */
  updatedAt: string | null
}

/** ระยะเก็บเอกสารลูกหนี้ (PDPA — `13` §6.16 · มติ PO U97) — 1 record ต่อองค์กร */
export interface DataRetentionPolicyDto {
  debtorDocumentRetentionYears: number
  /** `null` = ยังไม่เคยตั้งค่า (ค่าที่เห็นคือค่าเริ่มต้นของระบบ ยังไม่มีแถวใน DB) */
  updatedAt: string | null
}

/** นโยบายการมอบหมายงาน (`40` §6.4/§11) — เก็บที่ `assignment_policy_settings` แถวเดียวกับเกณฑ์ SLA */
export interface AssignmentPolicyDto {
  reassignTimeoutHours: number
  supervisorCanAssignSystem: boolean
  supervisorCanAssignInhouse: boolean
  supervisorCanAssignOutsource: boolean
  /** `null` = ไม่จำกัดเวลากดรับงาน */
  acceptDeadlineHours: number | null
  /** `null` = ยังไม่เคยตั้งค่า (ค่าที่เห็นคือค่าเริ่มต้นของระบบ ยังไม่มีแถวใน DB) */
  updatedAt: string | null
}

export interface BankAccountDto {
  id: string
  bankName: string
  accountName: string
  accountNumber: string
  /** เลขบัญชีแบบปิดบัง — ใช้แสดงในที่ที่ไม่ต้องเห็นเลขเต็ม (`90` §6.2) */
  accountNumberMasked: string
  accountType: string
  usage: BankAccountUsage
  /** อ้างรูปแบบด้วย id (มติ PO U147) */
  statementFormatId: string | null
  paymentFileFormatId: string | null
  /** ข้อความแสดงรูปแบบที่อ้าง (`null` = ไม่ได้ตั้ง) */
  statementFormatLabel: string | null
  paymentFileFormatLabel: string | null
  autoMatchToleranceDays: number
  isPrimary: boolean
  canPay: boolean
  canReceive: boolean
  isActive: boolean
  updatedAt: string
}

export interface TaxProfileDto {
  id: string
  name: string
  whtPct: number
  whtBasis: WhtBasis
  whtMinThresholdSatang: number
  /** รหัสรายการมาตรฐาน (มติ PO U148) */
  incomeTypeCode: TaxProfileIncomeType
  /** ข้อความที่พิมพ์ลง 50 ทวิ */
  incomeType: string
  filingForm: WhtFilingForm
  isActive: boolean
  updatedAt: string
}

/** ช่องหนึ่งของค่าเริ่มต้นตามประเภทผู้รับ (มติ PO U121) */
export interface TaxProfileDefaultSlotDto {
  taxProfileId: string
  name: string
  whtPct: number
  filingForm: WhtFilingForm
}

/** ชุดค่าเริ่มต้นหนึ่งแถว (insert-only) — `slots` ช่องว่าง = `null` */
export interface TaxProfileDefaultsDto {
  id: string
  slots: TaxProfileDefaults<TaxProfileDefaultSlotDto>
  reason: string
  createdAt: string
  createdByName: string
}

export interface TaxProfileDefaultsOverviewDto {
  /** ชุดที่มีผลอยู่ (บันทึกล่าสุด) · `null` = ยังไม่เคยตั้ง (ว่างทั้ง 4 ช่อง) */
  current: TaxProfileDefaultsDto | null
  /** ใหม่ → เก่า */
  history: TaxProfileDefaultsDto[]
}

export interface VatRateDto {
  id: string
  ratePct: number
  effectiveFrom: string
  effectiveTo: string | null
  note: string | null
  /** ช่วงนี้ครอบคลุมวันนี้หรือไม่ — timeline บน UI ไฮไลต์ช่วงที่ใช้อยู่ */
  isCurrent: boolean
  createdAt: string
}

/** ค่าตั้งภาษีหัก ณ ที่จ่าย 1 แถวของประวัติ (มติ PO 05/10/2569 UAT U3/U4/U5/U8) */
export interface WhtPolicyDto {
  id: string
  effectiveFrom: string
  baseExpenseTypes: ExpenseType[]
  certificateMode: WhtCertificateMode
  incomeTypeMode: WhtIncomeTypeMode
  /** 40(2) อัตรา 0% ออก 50 ทวิ + รวมใน ภ.ง.ด.1 (U16) */
  issueZeroRate402Certificate: boolean
  /** โหมดแยกตามประเภททีม: ประเภทเงินได้ของ inhouse / outsource (U33) */
  inhouseIncomeCategory: WhtIncomeCategory
  outsourceIncomeCategory: WhtIncomeCategory
  /** อนุญาตเงื่อนไข (2) ออกให้ตลอดไป / (3) ออกให้ครั้งเดียว (U105) */
  allowGrossUpConditions: boolean
  /** วิธียื่น ภ.ง.ด. (U45) */
  filingMethod: WhtFilingMethod
  reason: string
  createdAt: string
  createdByName: string
  /** แถวนี้คือค่าที่มีผลวันนี้ */
  isCurrent: boolean
}

export interface WhtPolicyOverviewDto {
  /** ค่าที่มีผลวันนี้ (ไม่มีแถวที่มีผล = ค่าเริ่มต้นตามมติ) */
  current: WhtPolicySettings
  currentId: string | null
  isDefault: boolean
  defaults: WhtPolicySettings
  /** ใหม่ → เก่า (รวมแถวที่วันที่มีผลยังไม่ถึง) */
  history: WhtPolicyDto[]
}

export interface CostCenterDto {
  id: string
  code: string
  name: string
  description: string | null
  isActive: boolean
  updatedAt: string
}

/** วันหยุดในปฏิทินองค์กร (มติ PO U93) — `holidayDate` = `YYYY-MM-DD` ค.ศ. (แสดงผลเป็น พ.ศ. ด้วย `fmtDate`) */
export interface PublicHolidayDto {
  id: string
  holidayDate: string
  name: string
  yearBe: number
  weekdayLabel: string
  createdByName: string | null
  createdAt: string
}

export interface PublicHolidayListDto {
  items: PublicHolidayDto[]
  /** ปี พ.ศ. ที่มีวันหยุดอยู่ (ใหม่ → เก่า) — ตัวเลือกของตัวกรองปี */
  years: number[]
}

/** ผลของการเพิ่ม/ลบ/นำเข้าวันหยุด — พร้อมรอบนำส่ง ภ.ง.ด. ที่กำหนดยื่นถูกคิดใหม่ */
export interface HolidayMutationResultDto {
  created: PublicHolidayDto[]
  /** วันที่ (`YYYY-MM-DD`) ที่ข้ามเพราะมีอยู่แล้ว (นำเข้าเท่านั้น) */
  skippedDates: string[]
  deleted: PublicHolidayDto | null
  refreshedFilings: { periodLabel: string; fromDate: string; toDate: string }[]
}

export interface BankFileFormatDto {
  id: string
  /** statement / payment (มติ PO U147) */
  purpose: BankFilePurpose
  /** รหัสธนาคารมาตรฐาน — `null` = ข้อมูลเดิมที่ต้องเลือกธนาคารใหม่ */
  bankCode: string | null
  bankName: string
  /** ข้อความแสดงในตัวเลือก (ธนาคาร · ชนิดไฟล์ · จำนวนคอลัมน์) */
  label: string
  fileType: BankFileType
  encoding: BankFileEncoding
  columnMapping: string
  /** staging E-009 — ไฟล์โอนมีแถวหัวคอลัมน์ */
  includeHeader: boolean
  columns: string[]
  testStatus: BankFileTestStatus
  /** ใช้สร้างไฟล์โอนเงินจริงได้หรือยัง (`BANK_FILE_NOT_TESTED` gate — `13` §6.8) */
  usable: boolean
  isActive: boolean
  updatedAt: string
}

/** เทมเพลตเอกสาร 1 ชนิด (`13` §6.13 · มติ PO U122) */
export interface TaxDocTemplateDto {
  documentType: TemplateDocumentType
  documentTypeLabel: string
  footerNote: string | null
  printSignature: boolean
  /** ชื่อช่องลายเซ็นที่รูปจะไปอยู่ (เช่น "ผู้มีอำนาจลงนาม") */
  signatureSlotLabel: string
  /** ชนิดตัวอย่าง PDF (`/api/accounting/document-samples/:type/pdf`) */
  sampleType: string
  updatedAt: string | null
}

/** แถวหนึ่งของ Functional Permission Matrix (`13` §6.10) — 1 capability × ทุก role */
export interface FunctionalMatrixRowDto {
  code: string
  label: string
  module: string
  description: string | null
  locked: boolean
  lockOwner: string | null
  /** ระดับสิทธิ์ต่อ role — key = `roleId` */
  levels: Record<string, MatrixLevel>
  /** role ที่แก้แถวนี้ได้ — key = `roleId` */
  editable: Record<string, boolean>
}

export interface FunctionalMatrixRoleDto {
  id: string
  name: string
  roleGroup: string
  isEditable: boolean
}

export interface FunctionalMatrixSectionDto {
  id: string
  label: string
  rows: FunctionalMatrixRowDto[]
}

export interface FunctionalMatrixDto {
  roles: FunctionalMatrixRoleDto[]
  sections: FunctionalMatrixSectionDto[]
}
