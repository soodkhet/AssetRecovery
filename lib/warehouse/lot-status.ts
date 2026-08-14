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

/** `44` §10 "Confirmed is Terminal" — ทุก mutation ของล็อตต้องเรียกตัวนี้ก่อนเสมอ */
export function assertLotMutable(status: HandoverLotStatus): void {
  if (isLotConfirmed(status)) throw new WarehouseError('LOT_ALREADY_CONFIRMED', { context: { status } })
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
