import type { PayoutBatchSide, PayoutBatchStatus, WhtCondition } from '@/lib/generated/prisma/enums'
import type { WhtIncomeCategory, WhtPolicyValues } from '@/lib/settings/wht-policy'

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
  /** snapshot ยอดหักคืนเงินทดรองรวมของรอบ (มติ PO U30) — หักหลัง WHT */
  advanceOffsetSatang: number
  /** staging E-014 — ยอดหักคืนยอดเรียกคืนรวมของรอบ · ไม่ระบุ = 0 */
  recoveryOffsetSatang?: number
  /** ยอดโอนจริงของรอบ = net − ยอดหักคืนเงินทดรอง (`22` §6.14) */
  transferSatang: number
  /**
   * มติ PO U109 — ยอดแยกของทั้งรอบ (`sumPayoutTaxSplit()` จาก snapshot รายการ): ค่าตอบแทน (เงินได้จริง)
   * · ภาษีที่หักจากผู้รับ · ภาษีที่บริษัทออกให้ — `gross` ของรอบรวมภาษีที่ออกให้ไว้แล้ว
   */
  compensationSatang: number
  whtWithheldSatang: number
  whtPaidByPayerSatang: number
  itemCount: number
  bankAccountId: string | null
  bankAccountLabel: string | null
  /** `17` §6.3 — มีค่า = เคยสร้างไฟล์โอนแล้ว (สร้างซ้ำต้องเตือนก่อน) */
  idempotencyKey: string | null
  paymentFileUrl: string | null
  paymentFileGeneratedAt: string | null
  /** snapshot ค่าตั้งภาษี ณ วันสร้างรอบ (มติ PO 05/10/2569 UAT U8) — `null` = รอบที่สร้างก่อนมีค่าตั้ง (พฤติกรรมเดิม) */
  whtPolicy: WhtPolicyValues | null
  /** รอบจ่าย AP ที่ใช้ (มติ PO U133) — null = ไม่ใช้รอบ/รอบเก่า */
  cycleName: string | null
  cycleDueRule: string | null
  /** กำหนดจ่ายตามรอบ `YYYY-MM-DD` (date-only) */
  payDueDate: string | null
  createdAt: string
  createdByName: string
  updatedAt: string
  /** ยกเลิกรอบจ่าย (มติ PO U67) — มีค่าเฉพาะ `status = cancelled` */
  cancelledAt: string | null
  cancelledByName: string | null
  cancelReason: string | null
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
  /** staging E-054 — ฐานของรอบก่อนในเดือนที่ยกมาหักพร้อมรายการนี้ (เกณฑ์สะสมต่อเดือน) · 0 = ไม่มี */
  whtCarriedBaseSatang?: number
  /** staging E-014 — ยอดหักคืนยอดเรียกคืนจากผู้รับจากบรรทัดนี้ (หลังหักคืนเงินทดรอง) · ไม่ระบุ = 0 */
  recoveryOffsetSatang?: number
  netSatang: number
  /** snapshot ณ เวลาสร้างรายการ (`92` §7.1) */
  taxProfileId: string | null
  taxProfileName: string | null
  whtPctSnapshot: number | null
  /** snapshot: อยู่ในฐาน WHT หรือไม่ — `false` = จ่ายเต็มไม่หัก (เช่นค่าที่พัก/เบิกตามใบเสร็จ) */
  whtBaseIncluded: boolean
  /** snapshot ประเภทเงินได้ — `null` = รอบเก่า/เงินทดรองจ่าย */
  whtIncomeCategory: WhtIncomeCategory | null
  /**
   * snapshot เงื่อนไขการหัก (มติ PO U105) — `null` = รอบเก่า/เงินทดรองจ่าย (= หัก ณ ที่จ่าย)
   * ออกให้ตลอดไป/ครั้งเดียว ⇒ `gross` = ค่าตอบแทน + ภาษีที่บริษัทออกให้ · `net` = ค่าตอบแทนเต็ม (`payoutItemTaxSplit()`)
   */
  whtCondition: WhtCondition | null
  /** snapshot ยอดหักคืนเงินทดรองจากบรรทัดนี้ (มติ PO U30) */
  advanceOffsetSatang: number
  /** ยอดโอนจริงของบรรทัด = net − ยอดหัก */
  transferSatang: number
  /** เงินทดรองที่หักจากบรรทัดนี้ (แถว `advance_returns` ที่ยังไม่กลับรายการ) */
  advanceOffsets: readonly PayoutAdvanceOffsetDto[]
  /** เลขที่ใบสำคัญจ่าย (snapshot ตอนสร้างไฟล์โอนครั้งแรก — มติ PO U102) · `null` = ยังไม่สร้างไฟล์ */
  voucherNumber: string | null
  bankName: string | null
  accountNumberMasked: string | null
}

/** 1 บรรทัด "หักคืนเงินทดรอง ADV-xxx" ของรายการในรอบ */
export interface PayoutAdvanceOffsetDto {
  advanceId: string
  /** เลขที่ใบเบิกเงินทดรอง (`advances.advance_number`) */
  advanceRef: string
  amountSatang: number
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
