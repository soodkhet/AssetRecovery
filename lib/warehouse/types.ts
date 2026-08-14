import type { AssetCondition, AssetStatus, HandoverLotStatus, HandoverType } from '@/lib/generated/prisma/enums'
import type { AssetTab } from '@/lib/warehouse/asset-status'
import type { LotTab } from '@/lib/warehouse/lot-status'

/**
 * DTO ของโมดูลคลัง (`44` §15) — รูปร่างที่ API ส่งออกและหน้าจอ 2.14/2.15 ใช้
 *
 * ⚠️ วันเวลาในชั้นนี้เป็น **ISO 8601 UTC** เสมอ (Rule 01) — การแปลง Asia/Bangkok + พ.ศ. ทำที่ display
 *    layer ผ่าน `fmtDate`/`fmtDateTime` เท่านั้น ห้าม format ที่ service
 */

export interface AssetListItemDto {
  id: string
  caseId: string
  caseRef: string
  debtorName: string
  deviceDesc: string
  imeiContract: string | null
  imeiActual: string | null
  serialContract: string | null
  serialActual: string | null
  assetStatus: AssetStatus
  condition: AssetCondition | null
  conditionNote: string | null
  companyId: string
  companyName: string
  teamId: string | null
  teamName: string | null
  agentId: string | null
  agentName: string | null
  /** วันที่เคสปิด (snapshot จาก `cases.closed_at`) */
  closedAt: string
  receivedAt: string | null
  rejectReason: string | null
  rejectedAt: string | null
  lotId: string | null
  lotNumber: string | null
  photoCount: number
}

export interface AssetDetailDto extends AssetListItemDto {
  photos: readonly string[]
  /** ล็อตที่เครื่องนี้อยู่ (ถ้ามี) — ตัดวงจรไม่ให้ FE ต้องยิงซ้ำอีกรอบ */
  lot: LotSummaryDto | null
  rejectedByName: string | null
}

export interface AssetListDto {
  items: readonly AssetListItemDto[]
  total: number
  page: number
  limit: number
}

export interface LotSummaryDto {
  id: string
  lotNumber: string
  docRef: string
  type: HandoverType
  status: HandoverLotStatus
  companyId: string
  companyName: string
  scheduledAt: string | null
  deliveredAt: string | null
  confirmedAt: string | null
  assetCount: number
  /** แท็บที่ล็อตนี้ไปโผล่ (`44` §9.3) — คำนวณจาก status ผ่าน `lotTab()` ห้าม if เองที่หน้าจอ */
  tab: LotTab
}

export interface LotDetailDto extends LotSummaryDto {
  contactPerson: string | null
  deliveryAddr: string | null
  trackingNo: string | null
  signedDocUrl: string | null
  deliveryProofUrl: string | null
  note: string | null
  confirmedByName: string | null
  createdAt: string
  assets: readonly AssetListItemDto[]
}

export interface LotListDto {
  items: readonly LotSummaryDto[]
  total: number
  page: number
  limit: number
}

/**
 * ผลของการยืนยันส่งมอบ (`44` §11) — คืนสิ่งที่ side effect ทำไปทั้งหมดเพื่อให้หน้าจอ/เทสต์
 * ตรวจได้ว่า 4 ขั้นเกิดครบจริง (ไม่ใช่แค่สถานะล็อตเปลี่ยน)
 */
export interface LotConfirmResultDto {
  lot: LotDetailDto
  assetIdsHandedOver: readonly string[]
  expenseIdsUnlocked: readonly string[]
  /** ว่างอยู่จนกว่า Phase 3.6 จะเสียบ RevenueService ตัวจริง (ดู `revenue-service.ts`) */
  revenueIdsCreated: readonly string[]
  /** เคสที่ผ่านเกตครบแล้ว — Phase 3.6 จะสร้าง Revenue จากชุดนี้ */
  revenueEligibleCaseIds: readonly string[]
  events: readonly string[]
}

/** จำนวนเครื่องแยกตามแท็บ — ใช้กับ badge บนหัวหน้าคลัง (`44` §8.1) */
export type AssetTabCounts = Readonly<Record<AssetTab, number>>
