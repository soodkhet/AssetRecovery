import type { FieldGroup } from '@/lib/field/field-status'
import type { AssignmentStatus, CaseOutcome, FuelMode, TravelOriginSource } from '@/lib/generated/prisma/enums'

/**
 * DTO ของ Field Tracker (`41` §17.1 · `45` §6.3) — **type-only** เพื่อให้ฝั่ง client import ได้
 * โดยไม่ลาก Prisma เข้า bundle (กับดัก 14/08/2569)
 *
 * เวลา = ISO 8601 UTC เสมอ · `scheduleDate` เป็นคอลัมน์ `DATE` จึงส่งเป็น `YYYY-MM-DD`
 * (หน้าจอแปลงเป็น พ.ศ. ด้วย `fmtDate` — Rule 01)
 */

export interface FieldAddressDto {
  detail: string | null
  subdistrict: string | null
  district: string | null
  province: string | null
  postalCode: string | null
}

export interface FieldContactDto {
  id: string
  contactName: string
  relation: string
  phone: string | null
  note: string | null
}

export interface FieldDocumentDto {
  id: string
  documentType: string
  fileUrl: string
  originalName: string
  mimeType: string
}

export interface FieldCheckinDto {
  id: string
  checkinType: string
  latitude: number
  longitude: number
  addressNote: string | null
  note: string | null
  checkedInAt: string
}

export interface FieldTravelOriginDto {
  latitude: number
  longitude: number
  source: TravelOriginSource
  setAt: string
}

export interface FieldCloseDraftDto {
  outcome: CaseOutcome | null
  photos: string[]
  videos: string[]
  productPhotos: string[]
  audioUrl: string | null
  note: string | null
  updatedAt: string
}

export interface FieldPendingReassignmentDto {
  id: string
  requestedByName: string
  requestedAt: string
  newAgentName: string
  reason: string
  expiresAt: string
}

export interface FieldCaseListItemDto {
  caseId: string
  assignmentId: string
  caseRef: string
  trackingRound: number
  status: AssignmentStatus
  group: FieldGroup
  agentId: string
  agentName: string
  debtorName: string | null
  province: string | null
  district: string | null
  assetDescription: string | null
  debtAmountSatang: number | null
  assignedAt: string
  acceptedAt: string | null
  scheduleDate: string | null
  scheduleOrder: number | null
  closedAt: string | null
  outcome: CaseOutcome | null
  /** มี draft ค้าง = ปุ่มบนการ์ดเป็น "จบงาน" + badge Draft (`41` §7.5) */
  hasDraft: boolean
  hasPendingReassignment: boolean
  checkinCount: number
  /** `41` §6.8 — แสดงก่อนกดรับงานเสมอ (ค่าตายตัวต่อเคสจากแผนค่าตอบแทนของทีม) */
  commissionSatang: number | null
  noSuccessFeeSatang: number | null
}

export interface FieldCaseListResultDto {
  view: 'own' | 'team'
  group: FieldGroup | null
  /** มุมมองทีม = read-only ทั้งชุด (`41` §11) — หน้าจอห้ามแสดงปุ่มจัดวัน/ปิดงานของเพื่อนร่วมทีม */
  readOnly: boolean
  items: FieldCaseListItemDto[]
}

export interface FieldCaseDetailDto extends FieldCaseListItemDto {
  companyName: string
  teamId: string | null
  teamName: string | null
  /** โหมดค่าน้ำมันของทีม — `PER_KM` เท่านั้นที่แสดงกล่องจุดเริ่มเดินทาง (`41` §7.6) */
  fuelMode: FuelMode | null
  debtorNationalId: string | null
  debtorPassportNo: string | null
  debtorPhoneMobile: string | null
  debtorPhoneWork: string | null
  debtorLineId: string | null
  debtorFacebook: string | null
  imei: string | null
  serialNo: string | null
  currentAddress: FieldAddressDto
  workAddress: FieldAddressDto
  idCardAddress: FieldAddressDto
  contacts: FieldContactDto[]
  documents: FieldDocumentDto[]
  productPhotos: FieldDocumentDto[]
  checkins: FieldCheckinDto[]
  travelOrigin: FieldTravelOriginDto | null
  draft: FieldCloseDraftDto | null
  pendingReassignment: FieldPendingReassignmentDto | null
  /** เหตุผลที่ถูกตีกลับหลักฐาน (`41` §10.1) — แสดงเป็นแบนเนอร์ค้างบนฟอร์มโหมด `needs_revision` */
  rejectReason: string | null
}

export interface FieldActionResultDto {
  caseId: string
  assignmentId: string
  status: AssignmentStatus
  group: FieldGroup
  scheduleDate: string | null
  scheduleOrder: number | null
  events: readonly string[]
}

export interface FieldReorderResultDto {
  date: string
  items: { caseId: string; assignmentId: string; scheduleOrder: number }[]
  events: readonly string[]
}

export interface FieldCheckinResultDto {
  caseId: string
  checkin: FieldCheckinDto
  checkinCount: number
  events: readonly string[]
}

export interface FieldCloseDraftResultDto {
  caseId: string
  draft: FieldCloseDraftDto
  travelOrigin: FieldTravelOriginDto | null
  events: readonly string[]
}
