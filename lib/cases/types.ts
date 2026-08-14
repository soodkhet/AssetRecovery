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

/** ผลของ `GET /api/cases/:id/team-suggestion` (`38` §7.4 · §17.1) */
export interface CaseTeamSuggestionDto {
  province: string | null
  suggestedTeamId: string | null
  suggestedTeamName: string | null
  matchedTeams: Array<{ id: string; name: string }>
  /** ไม่มีทีมตรงจังหวัด — FE บังคับเลือกทีมเองพร้อมเหตุผล (`CASE_NO_TEAM_MATCH`) */
  noMatch: boolean
  /** ทีมที่บันทึกไว้กับเคสตอนนี้ (`cases.suggested_team_id`) */
  savedSuggestedTeamId: string | null
}

/** ผลของ `POST /api/cases/import` (`38` §8 `import_cases` — success/error ต่อแถว) */
export interface CaseImportRowResultDto {
  rowNumber: number
  caseRef: string | null
  status: 'created' | 'failed'
  caseId: string | null
  errorCode: string | null
  errorMessage: string | null
  fields: Record<string, string> | null
}

export interface CaseImportResultDto {
  /** ตรวจอย่างเดียว ไม่สร้างเคสจริง (preview ก่อนยืนยัน) */
  dryRun: boolean
  totalRows: number
  createdCount: number
  failedCount: number
  /** คอลัมน์ในไฟล์ที่ระบบไม่รู้จัก — เตือนเฉย ๆ ไม่ทำให้แถวผิด */
  unmappedHeaders: string[]
  rows: CaseImportRowResultDto[]
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
  suggestedTeamId: string | null
  assignedTeamId: string | null
  teamChangeReason: string | null
  /** snapshot ค่าบริการ ณ ตอน `approved` (`10` §9.2) — ก่อน approved เป็น null ทั้งชุด */
  serviceFeeTemplateId: string | null
  serviceFeeModelSnapshot: string | null
  serviceFeeBaseSatang: number | null
  /** NUMERIC(5,2) — ส่งเป็น number เพื่อให้ FE แสดงได้ตรง (ไม่ใช่ยอดเงิน) */
  serviceFeeRatePct: number | null
  serviceFeeBasisSnapshot: string | null
  serviceFeeChargeOnFail: boolean | null
  /** action ที่ทำได้จากสถานะปัจจุบัน (`38` §10) — UX เท่านั้น API ตรวจซ้ำเสมอ */
  allowedActions: string[]
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
