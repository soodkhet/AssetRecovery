import type { SubstituteReceiptRefDto } from '@/lib/substitute-receipts/types'
import type { FieldGroup } from '@/lib/field/field-status'
import type { ExpenseViewType } from '@/lib/field/schemas'
import type {
  AssignmentStatus,
  CaseOutcome,
  ExpenseStatus,
  ExpenseType,
  FuelMode,
  ReassignmentResolution,
  TravelOriginSource,
} from '@/lib/generated/prisma/enums'

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
  /** เหตุผลปิดงานไม่สำเร็จที่เลือกค้างไว้ (UAT Q16) — รหัสจาก `CLOSE_FAIL_REASONS` */
  failReason: string | null
  failReasonDetail: string | null
  updatedAt: string
}

/** หลักฐานชุดที่ส่งไปแล้วของรอบนี้ (`41` §6.4) — ฟอร์มโหมด `needs_revision` เอาไปตั้งค่าเริ่มต้น */
export interface FieldSubmittedEvidenceDto {
  outcome: CaseOutcome
  photos: string[]
  videos: string[]
  productPhotos: string[]
  audioUrl: string | null
  /** "บันทึกเพิ่มเติม" ของชุดนี้ (มติ PO 03/10/2569 — UAT Q15) */
  note: string | null
  /** เหตุผลปิดงานไม่สำเร็จของชุดนี้ (UAT Q16) — ล็อกในโหมดตีกลับ */
  failReason: string | null
  failReasonDetail: string | null
  submittedAt: string
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
  /** เวลาปิดงาน**ครั้งแรก**ของรอบ — ส่งหลักฐานใหม่ไม่เขียนทับ (มติ PO U26) */
  closedAt: string | null
  /** เวลาส่งหลักฐานใหม่ล่าสุดหลังถูกตีกลับ · ไม่เคยส่งใหม่ = `null` (มติ PO U26) */
  resubmittedAt: string | null
  outcome: CaseOutcome | null
  /** มี draft ค้าง = ปุ่มบนการ์ดเป็น "จบงาน" + badge Draft (`41` §7.5) */
  hasDraft: boolean
  hasPendingReassignment: boolean
  checkinCount: number
  /** `41` §6.8 — แสดงก่อนกดรับงานเสมอ (ค่าตายตัวต่อเคสจากแผนค่าตอบแทนของทีม) */
  commissionSatang: number | null
  noSuccessFeeSatang: number | null
  /** `41` §7.11 — non-null เฉพาะสถานะ `reassigned_away` (การ์ดแบบไม่มีสถานะค่าใช้จ่าย) */
  reassignedAway: FieldReassignedAwayDto | null
  /**
   * สถานะรายการเบิกของ assignment รอบนี้ (`41` §7.11 — ป้าย "ค่าใช้จ่าย" บนการ์ดแท็บจบงาน)
   * ว่าง = ยังไม่มีรายการเบิก (เคสไม่มี expense ตาม DEC-006/D6) หรือเป็นเคสที่ถูกโอนไป
   */
  expenseStatuses: ExpenseStatus[]
}

/**
 * เคสที่ **ถูกโอนไปให้คนอื่น** (`41` §7.11) — มาจาก `reassignment_history` (insert-only) ของรอบที่
 * ผู้เรียกเป็นผู้รับผิดชอบคนเดิม · การ์ดนี้ไม่มีสถานะค่าใช้จ่ายเพราะไม่ใช่ผลการปิดงาน
 */
export interface FieldReassignedAwayDto {
  /** พนักงานคนใหม่ที่รับเคสต่อ */
  toAgentName: string
  /** เวลาที่เคสถูกโอนจริง (`reassignment_history.resolved_at`) */
  reassignedAt: string
  reason: string
  /** `timeout_auto` = เกินกำหนดเวลาตอบรับ · `consented` = ยินยอมเอง (ใช้เหตุผลที่ผู้จัดการระบุ) */
  resolution: ReassignmentResolution
}

/** เพื่อนร่วมทีมสำหรับช่อง "พักร่วมกับ" ของฟอร์มเบิกที่พัก (`41` §6.6 — เลือกได้เฉพาะคนในทีม) */
export interface FieldTeammateDto {
  id: string
  fullName: string
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
  /**
   * หลักฐานชุดล่าสุดที่ปิดงานไปแล้ว (null = ยังไม่เคยปิดงานรอบนี้) — ฟอร์มโหมด `needs_revision`
   * ใช้ตั้งค่าเริ่มต้นและใช้เทียบว่ามีการแก้ไขสื่อจริงก่อน `resubmit_close_case` (`41` §8)
   */
  submittedEvidence: FieldSubmittedEvidenceDto | null
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
  /**
   * รายการเบิกที่ระบบสร้างจริงจากการปิดงาน/ส่งหลักฐานใหม่ (มีเฉพาะ 2 action นั้น) — toast อ่านจากตรงนี้
   * ไม่ hardcode ชนิด (UAT BUG-069)
   */
  createdExpenses?: readonly { expenseType: ExpenseType; grossSatang: number }[]
  /** ระยะทางคำนวณไม่ได้ตอนปิดงาน — ค่าน้ำมันจะตามมาทีหลัง (D10) */
  fuelDistancePending?: boolean
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

/** รายการเบิก 1 แถว (`41` §6.6 · §7.9) — เงินเป็น satang เสมอ · `distanceKm` เป็น string (NUMERIC) */
export interface FieldExpenseDto {
  id: string
  caseId: string | null
  caseRef: string | null
  debtorName: string | null
  expenseType: ExpenseType
  grossSatang: number
  /** ระยะทางจริงของ fuel PER_KM — string เพื่อไม่ให้ float ปัดเศษ (`41` §6.6) */
  distanceKm: string | null
  /** `YYYY-MM-DD` (คอลัมน์ `DATE`) — หน้าจอแปลงเป็น พ.ศ. ด้วย `fmtDate` */
  expenseDate: string
  status: ExpenseStatus
  rejectReason: string | null
  /** หมายเหตุตอนเบิก (`revision_note`) — ไม่เปลี่ยนตอนส่งใหม่ */
  note: string | null
  /** ข้อความชี้แจงตอนส่งใหม่ครั้งล่าสุด (`resubmit_note` · UAT BUG-098) */
  resubmitNote: string | null
  receiptFileUrl: string | null
  sharedWithUserId: string | null
  sharedWithName: string | null
  /** จำนวนคืนของใบเบิกค่าที่พัก (มติ PO O50) — รายการชนิดอื่น = 1 เสมอ */
  hotelNights: number
  /** เพดานต่อคืนจาก snapshot แผนของใบเบิกค่าที่พัก — `null` = ไม่ตั้งเพดาน/ไม่ใช่ค่าที่พัก */
  hotelMaxPerNightSatang: number | null
  /** ใบเสร็จค่าที่พักออกในนามบริษัท (มติ PO U96 #14) — รายการชนิดอื่น = false เสมอ */
  receiptInCompanyName: boolean
  /** auto-mapping เคสที่ลงพื้นที่ในช่วงวันที่พัก (วันเข้าพัก … + จำนวนคืน − 1) — **ใช้ตรวจสอบเท่านั้น ไม่มีผลต่อยอด** (`41` §6.6) */
  matchedCaseIds: string[]
  /** ใบรับรองแทนใบเสร็จ (มติ PO U103) — ใบเบิกที่ติ๊ก "ไม่มีใบเสร็จ" · ไม่มี = `null` */
  substituteReceipt: SubstituteReceiptRefDto | null
  createdAt: string
}

export interface FieldExpenseListDto {
  type: ExpenseViewType
  items: FieldExpenseDto[]
  /** สรุปยอดหัวหน้าจอ (`41` §7.9) — superseded/rejected ไม่นับ */
  pendingSatang: number
  approvedSatang: number
  /**
   * ยอดรอดำเนินการรวม**ทุกแท็บ** (ผูกกับเคส + เบิกแยก + เบิกส่วนเกินเงินทดรองของตัวเอง) — มติ PO U27
   * ค่าเดียวกันไม่ว่าเปิดแท็บไหน · คำนวณฝั่ง server
   */
  pendingAllTabsSatang: number
  /**
   * วันลงพื้นที่ (`YYYY-MM-DD` วันไทย) ที่ค่าน้ำมันเหมาจ่าย/เบี้ยเลี้ยงยังไม่ถูกคำนวณ — มติ PO UAT Q21
   * (job รายวันคิดหลังจบวัน) · หน้าจอแสดง "รอคำนวณหลังจบวัน" แทนการเดายอด · แท็บ "เบิกแยก" = ว่างเสมอ
   */
  pendingFieldDates: string[]
}

export interface FieldIncomeItemDto {
  caseId: string
  caseRef: string
  debtorName: string | null
  outcome: CaseOutcome
  closedAt: string | null
  amountSatang: number
}

/** สรุปรายได้ (`41` §7.10) — ไม่ระบุเดือน = สะสมตลอด */
export interface FieldIncomeSummaryDto {
  month: string | null
  successCount: number
  failCount: number
  commissionSatang: number
  noSuccessFeeSatang: number
  items: FieldIncomeItemDto[]
}

export interface FieldExpenseActionResultDto {
  expense: FieldExpenseDto
  events: readonly string[]
}
