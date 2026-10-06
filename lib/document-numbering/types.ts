import type { DocumentNumberType } from '@/lib/generated/prisma/enums'

/** 1 แถวของหน้าตั้งค่า "เลขที่เอกสาร" (`GET /api/settings/document-numbering`) */
export interface DocumentNumberingDto {
  docType: DocumentNumberType
  label: string
  /** ระบบออกเลขเมื่อไร */
  issuedWhen: string
  isTaxDocument: boolean
  prefix: string
  includeYear: boolean
  digits: number
  resetYearly: boolean
  /** ระบบเดินให้เอง (ห้ามแก้มือ) */
  currentSeq: number
  /** ปี พ.ศ. ของ `currentSeq` */
  currentYear: number | null
  lastIssuedNumber: string | null
  lastIssuedAt: string | null
  /** รูปแบบอ่านง่าย `INV-{พ.ศ.}-NNNN` */
  pattern: string
  /** ตัวอย่างเลขถัดไป ณ วันนี้ */
  nextNumberPreview: string
  /** เลขลำดับต่ำสุดที่ตั้งเป็น "เลขถัดไป" ได้ (ณ ปีปัจจุบัน) */
  minNextSequence: number
  /** จำนวนเอกสารที่ออกไปแล้ว (เอกสารภาษีเท่านั้น — อื่น ๆ = null) */
  issuedCount: number | null
  /** เอกสารภาษีที่ออกไปแล้ว ⇒ แก้รูปแบบไม่ได้ */
  formatLocked: boolean
  updatedAt: string
}
