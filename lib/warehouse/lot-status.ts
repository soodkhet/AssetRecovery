import type { HandoverLotStatus, HandoverType } from '@/lib/generated/prisma/enums'
import { WarehouseError } from '@/lib/warehouse/errors'

/**
 * State machine + กติกาเอกสารของล็อตส่งมอบ (`44` §6.3 · §9.2 · §9.3 · §10) — **pure ล้วน**
 *
 * ```
 * [*] → pending_attach          (สร้างล็อตแบบ finance_pickup — ไฟแนนซ์มารับที่คลัง)
 * [*] → pending_delivery_proof  (สร้างล็อตแบบ we_deliver — ของออกจากคลังไปแล้ว)
 * pending_attach | pending_delivery_proof → confirmed   (แนบเอกสารครบ + ระบุวันส่งมอบจริง)
 * ```
 *
 * ⚠️ `confirmed` = terminal ตาม `02` §13 — ห้ามแก้/ลบ บังคับ 2 ชั้น: ตัวนี้ (service) + DB trigger
 *    `trg_handover_lots_confirmed_no_update|delete` (migration `20260814183000`)
 */

export const LOT_STATUSES = [
  'pending_attach',
  'pending_delivery_proof',
  'confirmed',
] as const satisfies readonly HandoverLotStatus[]

/** สถานะเริ่มต้นตามรูปแบบการส่งมอบ (`44` §9.2) — ต่างกันเพราะ "ของยังอยู่ในคลังไหม" ไม่ใช่เอกสาร */
export function initialLotStatus(type: HandoverType): HandoverLotStatus {
  return type === 'we_deliver' ? 'pending_delivery_proof' : 'pending_attach'
}

/** 2 แท็บท้ายของหน้าคลัง (`44` §8.1 · §9.3) */
export const LOT_TABS = ['pending_handover', 'handed_over'] as const
export type LotTab = (typeof LOT_TABS)[number]

/**
 * แท็บที่ล็อตไปโผล่ (`44` §9.3)
 * — `we_deliver` ที่ยังรอหลักฐานอยู่แท็บ "ส่งมอบแล้ว" **ทันที** เพราะเครื่องออกจากคลังไปแล้ว (§6.3)
 */
const TAB_OF: Readonly<Record<HandoverLotStatus, LotTab>> = {
  pending_attach: 'pending_handover',
  pending_delivery_proof: 'handed_over',
  confirmed: 'handed_over',
}

export function lotTab(status: HandoverLotStatus): LotTab {
  return TAB_OF[status]
}

export function statusesInLotTab(tab: LotTab): HandoverLotStatus[] {
  return LOT_STATUSES.filter((status) => TAB_OF[status] === tab)
}

/** ป้ายสถานะบนการ์ดล็อต (`44` §9.3) — สีคุมด้วย statusBadge กลาง ที่นี่เก็บแค่ข้อความ */
export const LOT_STATUS_LABELS: Readonly<Record<HandoverLotStatus, string>> = {
  pending_attach: 'รอแนบใบเซ็นรับ',
  pending_delivery_proof: 'รอแนบหลักฐานจัดส่ง',
  confirmed: 'ยืนยันแล้ว',
}

export function isLotConfirmed(status: HandoverLotStatus): boolean {
  return status === 'confirmed'
}

/**
 * ทดสอบซ้ำ local L-02 (ต่อมติชั่วคราว M5) — "ล็อตว่าง" = ยังไม่ยืนยันและไม่มีเครื่องเหลือ (นำเครื่องออกหมดแล้ว)
 * ไม่ใช่สถานะใหม่ — คำนวณจากสถานะ + จำนวนเครื่อง · หน้าคลังติดป้าย "ล็อตว่าง" · พอร์ทัลไม่แสดง · ออกใบส่งมอบไม่ได้
 */
export function isEmptyOpenLot(lot: { status: HandoverLotStatus; assetCount: number }): boolean {
  return !isLotConfirmed(lot.status) && lot.assetCount === 0
}

export const EMPTY_LOT_BADGE_LABEL = 'ล็อตว่าง'

/** ใบส่งมอบของล็อตที่ไม่มีเครื่อง = เอกสารเปล่า ⇒ `EMPTY_LOT` (ทั้งภายในและพอร์ทัล — ทดสอบซ้ำ local L-02) */
export function assertLotHasAssetsForDocument(lot: { id: string; assetCount: number }): void {
  if (lot.assetCount > 0) return
  throw new WarehouseError('EMPTY_LOT', {
    detail: `lot=${lot.id} asset_count=0 (handover document)`,
    messages: {
      title: 'ล็อตนี้ไม่มีเครื่อง',
      message: 'ล็อตนี้ไม่มีเครื่องเหลือแล้ว (นำออกหมด) — ไม่มีรายการให้แสดงและออกใบส่งมอบไม่ได้',
    },
  })
}

/**
 * ยืนยันล็อตแล้วได้ error นี้ = มีคน/อีกแท็บยืนยันล็อตเดียวกันไปก่อน (mytester WH-03) — หน้าจอต้องปิดหน้าต่างแล้วรีเฟรชรายการ
 * ไม่ค้างแถบแดงให้กดซ้ำ (ข้อมูลฝั่ง server ถูกต้องอยู่แล้ว)
 */
export function isLotConfirmedElsewhere(errorCode: string | undefined): boolean {
  return errorCode === 'LOT_ALREADY_CONFIRMED'
}

/** `44` §10 "Confirmed is Terminal" — ทุก mutation ของล็อตต้องเรียกตัวนี้ก่อนเสมอ */
export function assertLotMutable(status: HandoverLotStatus): void {
  if (isLotConfirmed(status)) throw new WarehouseError('LOT_ALREADY_CONFIRMED', { context: { status } })
}

/**
 * มติชั่วคราว M5 (mytester WH-05 · รีวิวเฟส 4) — นำเครื่องออกจากล็อตได้เฉพาะล็อต `pending_attach` ที่**ยังไม่แนบใบเซ็นรับ**
 * — แนบใบเซ็นรับแล้ว (ผู้รับเซ็นรับรายการเครื่องไปแล้ว) หรือ `pending_delivery_proof` ขึ้นไป (ของออกจากคลังแล้ว) ⇒ ล็อก
 * ใช้ทั้งฝั่ง server (assert) และหน้าจอ (ซ่อนปุ่ม "นำออกจากล็อต")
 */
export function isLotAssetRemovalLocked(lot: { status: HandoverLotStatus; signedDocUrl: string | null }): boolean {
  return lot.status !== 'pending_attach' || (lot.signedDocUrl !== null && lot.signedDocUrl !== '')
}

export const LOT_ASSET_REMOVAL_LOCKED_MESSAGES = {
  title: 'นำเครื่องออกจากล็อตนี้ไม่ได้',
  message:
    'ล็อตนี้แนบใบเซ็นรับแล้ว หรือเครื่องออกจากคลังไปแล้ว — รายการเครื่องต้องตรงกับเอกสารที่ผู้รับเซ็น จึงนำเครื่องออกไม่ได้',
} as const

/** ใช้ code `LOT_ALREADY_CONFIRMED` (ล็อตอยู่ในสถานะที่แก้รายการเครื่องไม่ได้ — `44` §12) พร้อมข้อความเฉพาะกรณี */
export function assertLotAssetRemovable(lot: { status: HandoverLotStatus; signedDocUrl: string | null }): void {
  assertLotMutable(lot.status)
  if (isLotAssetRemovalLocked(lot)) {
    throw new WarehouseError('LOT_ALREADY_CONFIRMED', {
      messages: LOT_ASSET_REMOVAL_LOCKED_MESSAGES,
      context: { status: lot.status, signedDocAttached: lot.signedDocUrl !== null && lot.signedDocUrl !== '' },
    })
  }
}

/** เอกสารที่ต้องแนบก่อน `confirmed` แยกตามรูปแบบการส่งมอบ (`44` §6.3) */
export const LOT_DOCUMENTS = ['signed_doc', 'delivery_proof'] as const
export type LotDocument = (typeof LOT_DOCUMENTS)[number]

export function requiredLotDocuments(type: HandoverType): readonly LotDocument[] {
  // ① ใบเซ็นรับบังคับทุกประเภท · ② หลักฐานจัดส่งบังคับเฉพาะ we_deliver
  return type === 'we_deliver' ? ['signed_doc', 'delivery_proof'] : ['signed_doc']
}

export interface LotDocumentUrls {
  signedDocUrl: string | null
  deliveryProofUrl: string | null
}

/** เอกสารที่ยังขาดอยู่ — ใช้ทั้งฝั่ง assert และปุ่ม "ยืนยันส่งมอบ" บนหน้าจอ (disabled จนกว่าจะครบ) */
export function missingLotDocuments(type: HandoverType, docs: LotDocumentUrls): readonly LotDocument[] {
  const present: Readonly<Record<LotDocument, boolean>> = {
    signed_doc: (docs.signedDocUrl ?? '').trim() !== '',
    delivery_proof: (docs.deliveryProofUrl ?? '').trim() !== '',
  }
  return requiredLotDocuments(type).filter((doc) => !present[doc])
}

export function canConfirmLot(type: HandoverType, docs: LotDocumentUrls): boolean {
  return missingLotDocuments(type, docs).length === 0
}

/**
 * `44` §12 — ขาดใบเซ็นรับ = `LOT_MISSING_SIGNED_DOC` · ขาดหลักฐานจัดส่ง (we_deliver) =
 * `LOT_MISSING_DELIVERY_PROOF` · ขาดทั้งคู่รายงานใบเซ็นรับก่อน (ลำดับการกรอกบนหน้าจอ §8.4)
 */
export function assertLotConfirmDocuments(type: HandoverType, docs: LotDocumentUrls): void {
  const missing = missingLotDocuments(type, docs)
  if (missing.includes('signed_doc')) throw new WarehouseError('LOT_MISSING_SIGNED_DOC', { context: { type } })
  if (missing.includes('delivery_proof')) throw new WarehouseError('LOT_MISSING_DELIVERY_PROOF', { context: { type } })
}

/** เผื่อนาฬิกาเครื่องผู้ใช้เร็วกว่า server เล็กน้อย — เกินนี้ถือว่าเป็นเวลาในอนาคต */
export const LOT_DELIVERED_AT_CLOCK_SKEW_MS = 5 * 60 * 1000

/**
 * วันเวลาที่ผู้รับมารับ/ส่งมอบจริงต้องเกิดขึ้นแล้ว และไม่ก่อนวันสร้างล็อต (staging E-007 · `44` §12) — วันนี้คือ
 * วันรับรู้รายได้ของเคสในล็อต (`19` §6.1) ⇒ เวลาในอนาคต/ย้อนไปก่อนมีล็อต = งวดบัญชีผิด · ตรวจที่ server เสมอ
 */
export function assertLotDeliveredAt(deliveredAt: Date, bounds: { now: Date; lotCreatedAt: Date }): void {
  if (deliveredAt.getTime() > bounds.now.getTime() + LOT_DELIVERED_AT_CLOCK_SKEW_MS) {
    throw new WarehouseError('LOT_DELIVERED_AT_IN_FUTURE', {
      context: { deliveredAt: deliveredAt.toISOString(), now: bounds.now.toISOString() },
    })
  }
  if (deliveredAt.getTime() < bounds.lotCreatedAt.getTime()) {
    throw new WarehouseError('LOT_DELIVERED_AT_BEFORE_LOT', {
      context: { deliveredAt: deliveredAt.toISOString(), lotCreatedAt: bounds.lotCreatedAt.toISOString() },
    })
  }
}
