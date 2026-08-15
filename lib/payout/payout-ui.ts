import type { PayoutBatchSide, PayoutBatchStatus } from '@/lib/generated/prisma/enums'
import { canPayoutAction } from '@/lib/payout/payout'
import type { PayoutBatchDto } from '@/lib/payout/types'
import type { StatusBadgeGroup } from '@/lib/ui/status-badge'

/**
 * ป้าย/สี/สิทธิ์ปุ่มของแท็บ "รอบจ่ายเงิน" (`17` §8 · mockup `finance.html` แท็บ `payout`)
 * — **pure ล้วน** ใช้ร่วม FE/BE
 *
 * ⚠️ หน้าจอ **ห้าม if สถานะเอง** — ทุกปุ่มถาม `canPayoutAction()` ซึ่งอ่านตาราง transition
 *    ชุดเดียวกับ API (`23` §6.6) ⇒ ปุ่มกับ endpoint ไม่มีทางเห็นไม่ตรงกัน
 * ⚠️ ยอดเงินทุกช่องมาจาก API (snapshot ของรอบ) — ที่นี่ไม่คิดสูตรใด ๆ (Rule 01)
 */

export const PAYOUT_STATUS_LABEL_SHORT: Readonly<Record<PayoutBatchStatus, string>> = {
  draft: 'ร่าง',
  checking: 'รอตรวจสอบ',
  file_generated: 'สร้างไฟล์โอนแล้ว',
  completed: 'จ่ายสำเร็จ',
}

/** สีจาก 10 กลุ่มของ `04` §8.1 เท่านั้น — `file_generated` = "ส่งแล้ว/รอขั้นถัดไป" (เงินยังไม่เข้าปลายทาง) */
const PAYOUT_STATUS_GROUP: Readonly<Record<PayoutBatchStatus, StatusBadgeGroup>> = {
  draft: 'neutral',
  checking: 'pending',
  file_generated: 'sent',
  completed: 'success',
}

export function payoutStatusBadgeGroup(status: PayoutBatchStatus): StatusBadgeGroup {
  return PAYOUT_STATUS_GROUP[status]
}

/** `17` §8 — ฝั่งของรอบต้องแยกด้วยสายตาได้ทันที (mockup: inhouse ฟ้า / outsource ม่วง) */
export const PAYOUT_SIDE_BADGE_CLASS: Readonly<Record<PayoutBatchSide, string>> = {
  inhouse: 'bg-blue-100 text-blue-800',
  outsource: 'bg-purple-100 text-purple-800',
}

/** ตัวกรองสถานะ — ค่าตรงกับ `status` ของ `GET /api/payout-batches` (`payoutBatchListQuerySchema`) */
export const PAYOUT_STATUS_FILTERS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'checking', label: 'รอตรวจสอบ' },
  { value: 'file_generated', label: 'สร้างไฟล์โอนแล้ว' },
  { value: 'completed', label: 'จ่ายสำเร็จ' },
] as const satisfies readonly { value: string; label: string }[]

export type PayoutStatusFilter = (typeof PAYOUT_STATUS_FILTERS)[number]['value']

export const PAYOUT_SIDE_FILTERS = [
  { value: 'all', label: 'ทุกฝั่ง' },
  { value: 'inhouse', label: 'Inhouse' },
  { value: 'outsource', label: 'Outsource' },
] as const satisfies readonly { value: string; label: string }[]

export type PayoutSideFilter = (typeof PAYOUT_SIDE_FILTERS)[number]['value']

/** ปุ่ม "สร้างไฟล์โอน" — `checking` (ครั้งแรก) และ `file_generated` (สร้างซ้ำ ต้องยืนยันก่อน `17` §6.3) */
export function canGeneratePaymentFile(status: PayoutBatchStatus): boolean {
  return canPayoutAction(status, 'generate_file')
}

/** ปุ่ม "ยืนยันจ่ายแล้ว" — manual confirm เป็นทางเลือกสำรองของ sync จากไฟล์ 35 (`17` §9/§18) */
export function canCompletePayout(status: PayoutBatchStatus): boolean {
  return canPayoutAction(status, 'complete')
}

/** ดาวน์โหลดไฟล์โอนซ้ำได้เมื่อมีไฟล์อยู่จริงเท่านั้น (ไม่งั้น endpoint ตอบ `PAYMENT_FILE_NOT_GENERATED`) */
export function canDownloadPaymentFile(batch: Pick<PayoutBatchDto, 'paymentFileUrl'>): boolean {
  return batch.paymentFileUrl !== null
}

/** เคยสร้างไฟล์มาแล้ว = ครั้งต่อไปต้องยืนยัน `DUPLICATE_PAYMENT_FILE` ก่อนเสมอ (`17` §6.3) */
export function isDuplicatePaymentFile(batch: Pick<PayoutBatchDto, 'paymentFileGeneratedAt'>): boolean {
  return batch.paymentFileGeneratedAt !== null
}

/** ยอดเงินที่ยังไม่ออกจากบัญชีบริษัท — KPI หัวแท็บ (`14` §6.1 นับรอบที่ยังไม่ `completed`) */
export function pendingPayoutNetSatang(batches: readonly PayoutBatchDto[]): number {
  return batches
    .filter((batch) => batch.status !== 'completed')
    .reduce((total, batch) => total + batch.netSatang, 0)
}

export function countPendingPayoutBatches(batches: readonly PayoutBatchDto[]): number {
  return batches.filter((batch) => batch.status !== 'completed').length
}
