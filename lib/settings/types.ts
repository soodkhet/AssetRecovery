import type {
  BankAccountUsage,
  BankFileEncoding,
  BankFileTestStatus,
  BankFileType,
  CutoffRuleType,
  CycleType,
  DueRuleType,
  InvoiceNumberingMode,
  TaxDocLanguage,
  TaxDocPaperSize,
  TaxDocumentType,
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
  cutoffText: string | null
  dueRuleType: DueRuleType
  dueRuleValue: number | null
  /** label ที่ผู้ใช้เห็น — ห้าม parse มาคำนวณ (A5) */
  dueRule: string
  scope: string
  isActive: boolean
  updatedAt: string
}

export interface ApprovalMatrixDto {
  id: string
  condition: string
  conditionThresholdSatang: number | null
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
  advanceUnclearedToEmployeeReceivable: boolean
  /** `null` = ยังไม่เคยตั้งค่า (ค่าที่เห็นคือค่าเริ่มต้น ยังไม่มีแถวใน DB) */
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
  statementFormat: string | null
  paymentFileFormat: string | null
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
  incomeType: string
  filingForm: WhtFilingForm
  isActive: boolean
  updatedAt: string
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

export interface CostCenterDto {
  id: string
  code: string
  name: string
  description: string | null
  isActive: boolean
  updatedAt: string
}

export interface BankFileFormatDto {
  id: string
  bankName: string
  fileType: BankFileType
  encoding: BankFileEncoding
  columnMapping: string
  columns: string[]
  testStatus: BankFileTestStatus
  /** ใช้สร้างไฟล์โอนเงินจริงได้หรือยัง (`BANK_FILE_NOT_TESTED` gate — `13` §6.8) */
  usable: boolean
  isActive: boolean
  updatedAt: string
}

export interface NumberingDto {
  mode: InvoiceNumberingMode
  prefix: string
  digitLength: number
  /** ระบบเดินให้เอง ห้ามแก้มือ (`NUMBERING_SEQ_NOT_EDITABLE`) */
  lastNumber: number
  lastResetYear: number | null
  /** ตัวอย่างเลขถัดไปตามรูปแบบปัจจุบัน */
  nextNumberPreview: string
  issuedInvoiceCount: number
}

export interface TaxDocTemplateDto {
  documentType: TaxDocumentType
  documentTypeLabel: string
  logoUrl: string | null
  footerNote: string | null
  signatureImageUrl: string | null
  paperSize: TaxDocPaperSize
  language: TaxDocLanguage
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
