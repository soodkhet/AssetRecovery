import type { AssetStatus } from '@/lib/generated/prisma/enums'
import { WarehouseError } from '@/lib/warehouse/errors'

/**
 * State machine ของเครื่องในคลัง (`44` §9.1) — **pure ล้วน**
 * (ห้าม import อะไรที่แตะ Prisma — หน้าจอ 2.14/2.15 เรียกตัวเดียวกับที่ API บังคับ)
 *
 * ```
 * [*] → pending_intake          (auto-create เมื่อเคส → closed_success · `44` §6.1)
 * pending_intake   → in_custody       (รับเข้าคลัง — IMEI ไม่ตรงก็รับได้ถ้าธุรการยืนยันทับคำเตือน)
 * pending_intake   → intake_rejected  (ตีกลับ — บังคับ reason)
 * intake_rejected  → in_custody       (กด "รับใหม่" แล้วรับเข้าในขั้นตอนเดียว · §8.2 retry)
 * in_custody       → handover_pending (ถูกใส่เข้าล็อต)
 * handover_pending → handed_over      (ล็อต confirmed — terminal · §11)
 * ```
 *
 * ⚠️ `intake_rejected → in_custody` ตรง ๆ ต่างจาก diagram ของ §9.1 ที่วาดผ่าน `pending_intake` ก่อน
 *    — UI "รับใหม่" เปิด modal รับเข้าคลังตัวเดิม (§8.2) การเขียนสถานะกลางจึงเป็นแค่ขั้นที่ผู้ใช้ไม่เคยเห็น
 *    ผลลัพธ์เท่ากันทุกประการ แต่ไม่มีช่วงที่ระบบค้างสถานะกลางถ้าทรานแซกชันล้ม · ตัวบอกว่ารอบนี้เป็น
 *    การรับใหม่คือ {@link isIntakeRetry} (ใช้ตัดสินว่าต้องลง event `asset.intake_retry` เพิ่มไหม)
 * ⚠️ ห้าม if สถานะเองในหน้าจอ/route — ทุกจุดต้องผ่าน {@link nextAssetStatus} / {@link canAssetAction}
 */

export const ASSET_STATUSES = [
  'pending_intake',
  'intake_rejected',
  'in_custody',
  'handover_pending',
  'handed_over',
] as const satisfies readonly AssetStatus[]

/** action ที่ทำให้ `asset_status` ขยับ (`44` §9.1) */
export const ASSET_ACTIONS = ['intake', 'reject_intake', 'attach_to_lot', 'hand_over'] as const
export type AssetAction = (typeof ASSET_ACTIONS)[number]

interface AssetTransitionRule {
  readonly from: readonly AssetStatus[]
  readonly to: AssetStatus
  readonly label: string
}

export const ASSET_TRANSITIONS: Readonly<Record<AssetAction, AssetTransitionRule>> = {
  intake: { from: ['pending_intake', 'intake_rejected'], to: 'in_custody', label: 'รับเข้าคลัง' },
  reject_intake: { from: ['pending_intake'], to: 'intake_rejected', label: 'ตีกลับ' },
  attach_to_lot: { from: ['in_custody'], to: 'handover_pending', label: 'จัดเข้าล็อตส่งมอบ' },
  hand_over: { from: ['handover_pending'], to: 'handed_over', label: 'ยืนยันส่งมอบ' },
}

/** สถานะสุดท้าย — ห้ามขยับต่อ (`44` §9.1) */
export const ASSET_TERMINAL_STATUS: AssetStatus = 'handed_over'

export function canAssetAction(status: AssetStatus, action: AssetAction): boolean {
  return ASSET_TRANSITIONS[action].from.includes(status)
}

/** สถานะปลายทางของ action — สถานะปัจจุบันไม่รองรับ = `ASSET_INVALID_STATUS` (`44` §12) */
export function nextAssetStatus(status: AssetStatus, action: AssetAction): AssetStatus {
  const rule = ASSET_TRANSITIONS[action]
  if (!rule.from.includes(status)) {
    throw new WarehouseError('ASSET_INVALID_STATUS', {
      context: { status, action },
      detail: `action ${action} ทำได้จากสถานะ ${rule.from.join('|')} เท่านั้น`,
    })
  }
  return rule.to
}

/**
 * รอบนี้เป็นการ "รับใหม่" หลังเคยตีกลับหรือไม่ (`44` §8.2 · §14 `asset.intake_retry`)
 * — true ⇒ ต้องล้างข้อมูลการตีกลับรอบก่อนออก และลง event เพิ่มอีกตัว
 */
export function isIntakeRetry(status: AssetStatus): boolean {
  return status === 'intake_rejected'
}

/** 4 แท็บของหน้าคลัง (`44` §8.1) — แท็บของเครื่องที่อยู่ในล็อตแล้วตัดสินจากสถานะ**ล็อต** (ดู `lotTab()`) */
export const ASSET_TABS = ['intake', 'in_custody', 'pending_handover', 'handed_over'] as const
export type AssetTab = (typeof ASSET_TABS)[number]

const TAB_OF: Readonly<Record<AssetStatus, AssetTab>> = {
  pending_intake: 'intake',
  intake_rejected: 'intake',
  in_custody: 'in_custody',
  handover_pending: 'pending_handover',
  handed_over: 'handed_over',
}

export function assetTab(status: AssetStatus): AssetTab {
  return TAB_OF[status]
}

/** สถานะทั้งหมดของแท็บหนึ่ง — ใช้ประกอบ `where` ของ query (ห้าม hardcode รายการสถานะที่ route/หน้าจอ) */
export function statusesInAssetTab(tab: AssetTab): AssetStatus[] {
  return ASSET_STATUSES.filter((status) => TAB_OF[status] === tab)
}
