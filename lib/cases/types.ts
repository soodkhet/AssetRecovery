import type { DocumentSlot } from '@/lib/cases/case'

/**
 * DTO ของโมดูลรับเคส — **type-only** เพื่อให้ฝั่ง client import ได้โดยไม่ลาก Prisma เข้า bundle
 * (กับดัก 2026-08-14 ใน REUSE_INDEX) · วันเวลาเป็น ISO 8601 UTC เสมอ แล้วให้ FE แปลง พ.ศ. ด้วย `fmtDateTime`
 */

export interface CaseAddressDto {
  detail: string | null
  postalCode: string | null
  province: string | null
  district: string | null
  subdistrict: string | null
}

export interface CaseContactDto {
  id: string
  contactName: string
  relationship: string
  contactPhone: string | null
}

export interface CaseDocumentDto {
  id: string
  documentType: DocumentSlot
  fileUrl: string
  fileHash: string
  originalName: string
  mimeType: string
  sizeBytes: number
  uploadedAt: string
  uploadedBy: string
  uploadedByName: string
}

export interface CaseEditHistoryDto {
  id: string
  note: string | null
  changedFields: string[]
  editedAt: string
  editedBy: string
  editedByName: string
}

/** `38` §6.4 `recycle_history` — แถว `recycle_requests` ที่อนุมัติแล้ว */
export interface CaseRecycleHistoryDto {
  id: string
  requestNote: string
  decisionNote: string | null
  status: string
  previousRound: number | null
  newRound: number | null
  decidedAt: string | null
  decidedByName: string | null
  createdAt: string
}

/** แถวในหน้า List (`38` §7.2) */
export interface CaseListItemDto {
  id: string
  caseRef: string
  trackingRound: number
  status: string
  sourceChannel: string
  financeCompanyId: string
  financeCompanyName: string
  debtorName: string | null
  province: string | null
  assetBrandModel: string | null
  outstandingDebtSatang: number | null
  suggestedTeamName: string | null
  assignedTeamName: string | null
  documentCount: number
  createdAt: string
  createdByName: string
}

export interface CaseListResultDto {
  items: CaseListItemDto[]
  total: number
  page: number
  limit: number
}

/** ความพร้อมขึ้น `pending_review` (`38` §9) — คำนวณจาก pure `caseReadiness()` */
export interface CaseReadinessDto {
  ready: boolean
  missingFields: string[]
  missingDocuments: DocumentSlot[]
}

export interface CaseDetailDto extends CaseListItemDto {
  caseRefNormalized: string
  debtorNationality: string | null
  debtorNationalityOther: string | null
  debtorNationalId: string | null
  debtorPassportNo: string | null
  debtorPhoneMobile: string | null
  debtorPhoneWork: string | null
  debtorLineId: string | null
  debtorFacebook: string | null
  addressCurrent: CaseAddressDto
  addressWork: CaseAddressDto
  addressIdCard: CaseAddressDto
  assetType: string | null
  assetImeiSerial: string | null
  projectedRevenueSatang: number | null
  projectedRevenueSource: string | null
  reviewNote: string | null
  reviewedAt: string | null
  outcome: string | null
  closedAt: string | null
  updatedAt: string
  contacts: CaseContactDto[]
  documents: CaseDocumentDto[]
  editHistory: CaseEditHistoryDto[]
  recycleHistory: CaseRecycleHistoryDto[]
  readiness: CaseReadinessDto
}
