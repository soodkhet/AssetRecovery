import type { AssetCondition, AssetStatus, HandoverLotStatus, HandoverType } from '@/lib/generated/prisma/enums'
import type { StatusBadgeGroup } from '@/lib/ui/status-badge'
import type { AssetTab } from '@/lib/warehouse/asset-status'
import type { LotTab } from '@/lib/warehouse/lot-status'

/**
 * ข้อความ/สีของหน้าคลัง (`44` §8) — **pure ล้วน** (หน้าจอ 2.14/2.15 + เอกสาร PDF/Excel ใช้ชุดเดียวกัน)
 *
 * ⚠️ ห้ามใส่คลาสสีเองในหน้าจอ — badge ทุกตัวมาจาก 10 กลุ่มของ `04` §8.1 ผ่านตัวแมปที่นี่
 */

export const ASSET_STATUS_LABEL: Readonly<Record<AssetStatus, string>> = {
  pending_intake: 'รอรับเข้าคลัง',
  intake_rejected: 'ตีกลับ',
  in_custody: 'อยู่ในคลัง',
  handover_pending: 'รอส่งมอบ',
  handed_over: 'ส่งมอบแล้ว',
}

const ASSET_STATUS_GROUP: Readonly<Record<AssetStatus, StatusBadgeGroup>> = {
  pending_intake: 'pending',
  intake_rejected: 'critical',
  in_custody: 'info',
  handover_pending: 'cleared',
  handed_over: 'success',
}

export function assetStatusLabel(status: AssetStatus): string {
  return ASSET_STATUS_LABEL[status]
}

export function assetStatusBadgeGroup(status: AssetStatus): StatusBadgeGroup {
  return ASSET_STATUS_GROUP[status]
}

export const ASSET_CONDITION_LABEL: Readonly<Record<AssetCondition, string>> = {
  normal: 'ปกติ',
  damaged: 'ชำรุด',
  partial_loss: 'อุปกรณ์ขาดหาย',
}

const ASSET_CONDITION_GROUP: Readonly<Record<AssetCondition, StatusBadgeGroup>> = {
  normal: 'success',
  damaged: 'critical',
  partial_loss: 'warning',
}

/** สภาพเครื่องที่ยังไม่ได้ตรวจ = `null` — ใช้ขีดกลางทั้งบนจอและในเอกสาร */
export const EMPTY_CONDITION_DISPLAY = '—'

export function assetConditionLabel(condition: AssetCondition | null): string {
  return condition === null ? EMPTY_CONDITION_DISPLAY : ASSET_CONDITION_LABEL[condition]
}

export function assetConditionBadgeGroup(condition: AssetCondition | null): StatusBadgeGroup {
  return condition === null ? 'neutral' : ASSET_CONDITION_GROUP[condition]
}

/** ชื่อแท็บของหน้าคลัง (`44` §8.1) */
export const ASSET_TAB_LABEL: Readonly<Record<AssetTab, string>> = {
  intake: 'รับเข้าคลัง',
  in_custody: 'ในคลัง',
  pending_handover: 'รอส่งมอบ',
  handed_over: 'ส่งมอบแล้ว',
}

export const LOT_TAB_LABEL: Readonly<Record<LotTab, string>> = {
  pending_handover: 'รอส่งมอบ',
  handed_over: 'ส่งมอบแล้ว',
}

/** ป้ายประเภทการส่งมอบบนการ์ดล็อต (`44` §8.4 — 🏢 ไฟแนนซ์มารับ / 🚚 เราส่งให้) */
export const HANDOVER_TYPE_LABEL: Readonly<Record<HandoverType, string>> = {
  finance_pickup: 'ไฟแนนซ์มารับที่คลัง',
  we_deliver: 'เราจัดส่งไปให้',
}

export const HANDOVER_TYPE_SHORT_LABEL: Readonly<Record<HandoverType, string>> = {
  finance_pickup: 'ไฟแนนซ์มารับ',
  we_deliver: 'เราส่งให้',
}

const LOT_STATUS_GROUP: Readonly<Record<HandoverLotStatus, StatusBadgeGroup>> = {
  pending_attach: 'warning',
  pending_delivery_proof: 'warning',
  confirmed: 'success',
}

export function lotStatusBadgeGroup(status: HandoverLotStatus): StatusBadgeGroup {
  return LOT_STATUS_GROUP[status]
}
