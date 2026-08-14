import type { AssetStatus } from '@/lib/generated/prisma/enums'
import { canAssetAction } from '@/lib/warehouse/asset-status'
import {
  WAREHOUSE_INTAKE_CAPABILITY,
  WAREHOUSE_REJECT_INTAKE_CAPABILITY,
} from '@/lib/warehouse/permissions'

/**
 * ปุ่มบนแถวของแท็บ "รับเข้าคลัง" (`44` §8.2 Action Buttons) — **pure ล้วน**
 *
 * ```
 * pending_intake   → [รับเข้าคลัง] [ตีกลับ]
 * intake_rejected  → [ดูเหตุผล]   [รับใหม่]
 * ```
 *
 * ⚠️ ห้าม if สถานะเองในหน้าจอ — "รับเข้าคลัง"/"รับใหม่" เป็น action `intake` ตัวเดียวกัน
 *    ต่างแค่ป้ายบนปุ่ม (modal เดียวกัน · `asset-status.ts` `isIntakeRetry()` เป็นคนตัดสิน event)
 * ⚠️ การซ่อนปุ่มเป็นแค่ UX — API ตรวจ `requirePermission()` ซ้ำเสมอ (DEC-002)
 *    ผู้ใช้ฝั่งบริษัทไฟแนนซ์ไม่มี capability เหล่านี้ ⇒ เห็นแท็บแบบอ่านอย่างเดียวโดยอัตโนมัติ
 */

export const ASSET_ROW_ACTIONS = ['intake', 'reject_intake', 'view_reject'] as const
export type AssetRowAction = (typeof ASSET_ROW_ACTIONS)[number]

export interface AssetActionButton {
  action: AssetRowAction
  label: string
  /** ปุ่มหลักของแถว (สีเข้ม) — 1 ปุ่มต่อแถวเท่านั้น */
  primary: boolean
}

/** capability ที่ต้องมีต่อ action (`44` §13) — `view_reject` เป็นการอ่าน ไม่ต้องมีสิทธิ์เพิ่ม */
const ACTION_CAPABILITY: Readonly<Record<AssetRowAction, string | null>> = {
  intake: WAREHOUSE_INTAKE_CAPABILITY,
  reject_intake: WAREHOUSE_REJECT_INTAKE_CAPABILITY,
  view_reject: null,
}

export function assetActionCapability(action: AssetRowAction): string | null {
  return ACTION_CAPABILITY[action]
}

export function assetRowActions(
  status: AssetStatus,
  canManage: (capability: string) => boolean,
): AssetActionButton[] {
  const buttons: AssetActionButton[] = []

  if (status === 'intake_rejected') {
    buttons.push({ action: 'view_reject', label: 'ดูเหตุผล', primary: false })
  }
  if (canAssetAction(status, 'intake') && canManage(WAREHOUSE_INTAKE_CAPABILITY)) {
    buttons.push({
      action: 'intake',
      label: status === 'intake_rejected' ? 'รับใหม่' : 'รับเข้าคลัง',
      primary: true,
    })
  }
  if (canAssetAction(status, 'reject_intake') && canManage(WAREHOUSE_REJECT_INTAKE_CAPABILITY)) {
    buttons.push({ action: 'reject_intake', label: 'ตีกลับ', primary: false })
  }

  return buttons
}
