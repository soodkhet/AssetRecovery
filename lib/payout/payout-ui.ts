import { fmtSatangSymbol } from '@/lib/format/money'
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
  cancelled: 'ยกเลิกแล้ว',
}

/** สีจาก 10 กลุ่มของ `04` §8.1 เท่านั้น — `file_generated` = "ส่งแล้ว/รอขั้นถัดไป" (เงินยังไม่เข้าปลายทาง) */
const PAYOUT_STATUS_GROUP: Readonly<Record<PayoutBatchStatus, StatusBadgeGroup>> = {
  draft: 'neutral',
  checking: 'pending',
  file_generated: 'sent',
  completed: 'success',
  // มติ PO U67 — กลุ่มเดียวกับเอกสารที่ถูกยกเลิกใน mapper กลาง (`cancelled` → แดง)
  cancelled: 'critical',
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
  { value: 'cancelled', label: 'ยกเลิกแล้ว' },
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

/**
 * ปุ่ม "ยกเลิกรอบจ่าย" (มติ PO U67) — ตารางเดียวกับ API · ยามละเอียด (โอนแล้ว/ยืนยันไฟล์) อยู่ที่
 * `assertPayoutCancellable()` ฝั่ง API
 */
export function canCancelPayout(status: PayoutBatchStatus): boolean {
  return canPayoutAction(status, 'cancel')
}

/**
 * ดาวน์โหลดไฟล์โอนซ้ำได้เมื่อมีไฟล์อยู่จริงเท่านั้น (ไม่งั้น endpoint ตอบ `PAYMENT_FILE_NOT_GENERATED`)
 * · รอบที่ยกเลิกแล้วห้ามดาวน์โหลด (มติ PO U67 — กันอัปโหลดไฟล์เก่าเข้าธนาคาร)
 */
export function canDownloadPaymentFile(batch: Pick<PayoutBatchDto, 'paymentFileUrl' | 'status'>): boolean {
  return batch.paymentFileUrl !== null && batch.status !== 'cancelled'
}

/** เคยสร้างไฟล์มาแล้ว = ครั้งต่อไปต้องยืนยัน `DUPLICATE_PAYMENT_FILE` ก่อนเสมอ (`17` §6.3) */
export function isDuplicatePaymentFile(batch: Pick<PayoutBatchDto, 'paymentFileGeneratedAt'>): boolean {
  return batch.paymentFileGeneratedAt !== null
}

/**
 * รอบที่ยังรอเงินออก — ไม่ใช่ `completed` (จ่ายแล้ว) และไม่ใช่ `cancelled` (มติ PO U67 — รายการกลับไปรอจ่าย
 * แล้ว ถ้านับซ้ำจะเห็นยอดรอจ่ายเกินจริง)
 */
export function isPendingPayoutStatus(status: PayoutBatchStatus): boolean {
  return status !== 'completed' && status !== 'cancelled'
}

/**
 * ยอดเงินที่ยังไม่ออกจากบัญชีบริษัท — KPI หัวแท็บ (`14` §6.1 นับรอบที่ยังไม่ `completed`)
 * นับ **ยอดโอนจริง** (`transferSatang` จาก server) ไม่ใช่ net — ยอดหักคืนเงินทดรองไม่ได้ออกจากบัญชี (BUG-154 · มติ PO U30)
 */
export function pendingPayoutTransferSatang(batches: readonly PayoutBatchDto[]): number {
  return batches
    .filter((batch) => isPendingPayoutStatus(batch.status))
    .reduce((total, batch) => total + batch.transferSatang, 0)
}

type PayoutTransferSource = Pick<PayoutBatchDto, 'transferSatang' | 'advanceOffsetSatang'>

/** รอบนี้มีหักคืนเงินทดรองหรือไม่ — มีแล้วหน้าจอต้องแสดงบรรทัด "หักคืนเงินทดรอง" แยก (มติ PO U30) */
export function hasAdvanceOffset(batch: Pick<PayoutBatchDto, 'advanceOffsetSatang'>): boolean {
  return batch.advanceOffsetSatang > 0
}

/**
 * ข้อความยอดโอนจริงของรอบ (ใช้ใน toast/คำอธิบายสั้น) — ยอดทั้งหมดมาจาก server ไม่คำนวณที่หน้าจอ (Rule 01)
 * มีหักคืนเงินทดรอง ⇒ ต่อท้ายยอดหักให้เห็นว่าทำไมยอดโอนต่ำกว่ายอดหลังภาษี (BUG-154)
 */
export function payoutTransferText(batch: PayoutTransferSource): string {
  const transfer = `ยอดโอน ${fmtSatangSymbol(batch.transferSatang)}`
  return hasAdvanceOffset(batch)
    ? `${transfer} (หักคืนเงินทดรอง ${fmtSatangSymbol(batch.advanceOffsetSatang)})`
    : transfer
}

export function countPendingPayoutBatches(batches: readonly PayoutBatchDto[]): number {
  return batches.filter((batch) => isPendingPayoutStatus(batch.status)).length
}

/** ลิงก์ 50 ทวิ ต่อผู้รับในหน้ารอบจ่าย (staging E-052) */
export interface PayoutWhtCertificateLink {
  id: string
  label: string
  certificateNumber: string
  href: string
}

/**
 * staging E-052 — ปุ่ม "50 ทวิ" ต่อผู้รับในหน้ารอบจ่ายที่จ่ายสำเร็จ: ใบที่ยังใช้งาน (ใบยกเลิกไม่มีปุ่ม)
 * เรียงตามชื่อผู้รับ แล้วเลขที่ใบ · ใบเกิดเมื่อรอบ `completed` เท่านั้น (รอบสถานะอื่น = ว่าง)
 */
export function payoutWhtCertificateLinks(
  batchStatus: PayoutBatchStatus,
  certificates: readonly { id: string; certificateNumber: string; payeeName: string; status: string }[],
): PayoutWhtCertificateLink[] {
  if (batchStatus !== 'completed') return []
  return [...certificates]
    .filter((certificate) => certificate.status === 'active')
    .sort(
      (a, b) => a.payeeName.localeCompare(b.payeeName, 'th') || a.certificateNumber.localeCompare(b.certificateNumber),
    )
    .map((certificate) => ({
      id: certificate.id,
      label: `50 ทวิ · ${certificate.payeeName}`,
      certificateNumber: certificate.certificateNumber,
      href: `/api/accounting/wht-certificates/${certificate.id}/pdf`,
    }))
}
