import type { PayoutBatchSide, PayoutBatchStatus } from '@/lib/generated/prisma/enums'

/**
 * DTO ของรอบจ่ายเงินที่ส่งออก API (ไฟล์ 17 §8/§14)
 *
 * ⚠️ ยอดทุกตัวเป็น **satang จำนวนเต็ม** (Rule 01) — display หาร 100 ที่ชั้นหน้าจอด้วย `fmtSatang()`
 * ⚠️ `cutoffDate` ไม่มีคอลัมน์ใน `02` §8 ⇒ ไม่อยู่ใน DTO — วันตัดรอบอ่านได้จากชื่อรอบและ audit log
 */
export interface PayoutBatchDto {
  id: string
  name: string
  side: PayoutBatchSide
  status: PayoutBatchStatus
  grossSatang: number
  whtSatang: number
  netSatang: number
  itemCount: number
  bankAccountId: string | null
  bankAccountLabel: string | null
  /** `17` §6.3 — มีค่า = เคยสร้างไฟล์โอนแล้ว (สร้างซ้ำต้องเตือนก่อน) */
  idempotencyKey: string | null
  paymentFileUrl: string | null
  paymentFileGeneratedAt: string | null
  createdAt: string
  createdByName: string
  updatedAt: string
}

/** แหล่งที่มาของรายการในรอบ (`02` §8 A4 — separate FK, exactly-one non-null) */
export type PayoutItemSource = 'expense' | 'advance'

export interface PayoutBatchItemDto {
  id: string
  source: PayoutItemSource
  sourceId: string
  payeeId: string
  payeeName: string
  teamName: string | null
  /** ประเภทรายการเบิก / วัตถุประสงค์เงินทดรอง — ให้การเงินตรวจก่อนสร้างไฟล์โอน */
  description: string
  caseRef: string | null
  trackingRound: number
  grossSatang: number
  whtSatang: number
  netSatang: number
  /** snapshot ณ เวลาสร้างรายการ (`92` §7.1) */
  taxProfileId: string | null
  taxProfileName: string | null
  whtPctSnapshot: number | null
  bankName: string | null
  accountNumberMasked: string | null
}

export interface PayoutBatchDetailDto extends PayoutBatchDto {
  items: readonly PayoutBatchItemDto[]
}

/** ผลของ `POST /:id/generate-payment-file` — ยังไม่ยืนยันซ้ำ = คืน `generated: false` พร้อม warning */
export interface PaymentFileResultDto {
  generated: boolean
  batch: PayoutBatchDto
  fileName: string | null
  /** SHA-256 ของไฟล์ที่สร้าง (hex) — ใช้ยืนยันว่าไฟล์ที่อัปโหลดเข้าธนาคารคือไฟล์เดียวกัน */
  fileHash: string | null
  rowCount: number
  previousGeneratedAt: string | null
}
