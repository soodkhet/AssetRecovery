import type { AdvanceReturnState } from '@/lib/advances/advance'
import type { AdvanceReturnChannel, AdvanceReturnMethod, AdvanceStatus } from '@/lib/generated/prisma/enums'

/**
 * DTO ของเงินทดรองจ่าย (ไฟล์ 15 §7.2) — **type-only** เพื่อให้ไฟล์ฝั่ง client import ได้
 * โดยไม่ลาก Prisma เข้า bundle (ดูกับดัก 2026-08-14 ใน REUSE_INDEX)
 */
export interface AdvanceDto {
  id: string
  payeeId: string
  payeeName: string
  teamName: string | null
  requestedSatang: number
  /** `null` = ยังไม่อนุมัติ ⇒ ยังไม่มีเงินออก */
  approvedSatang: number | null
  usedSatang: number
  /** generated column ของ DB — `GREATEST(0, approved − used)` (`02` §5) */
  returnSatang: number
  /** ใช้เกินยอดอนุมัติ ⇒ ต้องเบิกส่วนเกินเป็น Claim ใหม่ (`15` §11) */
  excessSatang: number
  status: AdvanceStatus
  purpose: string
  /** `YYYY-MM-DD` (คอลัมน์ `DATE`) — display แปลงเป็น พ.ศ. ที่ layer บนสุด (Rule 01) */
  dueClearDate: string
  /**
   * เลยกำหนดเคลียร์ยอดแล้วจริงตามปฏิทินไทย — `true` ได้ทั้งสถานะ `overdue` (job มาร์คแล้ว)
   * และ `approved` ที่เพิ่งเลยกำหนดแต่ job ยังไม่ทำงาน ⇒ หน้าจอเตือนได้ทันที (`15` §8)
   */
  isPastDue: boolean
  approvedByName: string | null
  approvedAt: string | null
  clearedAt: string | null
  rejectionReason: string | null
  createdAt: string
  /** ผู้ขอเบิก (`15` §7.2 requester) */
  requesterName: string
  /** เลขอ้างอิงที่ผู้ใช้เห็น (`ADV-xxxxxxxx`) */
  ref: string
  /** วิธีคืนยอดที่เหลือ (มติ PO U30) — `null` = ไม่มียอดคืน */
  returnMethod: AdvanceReturnMethod | null
  /** ยอดที่ได้คืนแล้ว (หักกลบในรอบจ่ายที่สร้างแล้ว + รับคืนแยก — ไม่นับแถวที่กลับรายการ) */
  returnCollectedSatang: number
  /** ยอดคืนค้าง = `returnSatang − returnCollectedSatang` (`22` §6.14) */
  returnOutstandingSatang: number
  returnState: AdvanceReturnState
  /** ประวัติการคืนยอด (ใหม่สุดก่อน) */
  returns: AdvanceReturnDto[]
}

/** 1 แถวของสมุดย่อย `advance_returns` (มติ PO U30) */
export interface AdvanceReturnDto {
  id: string
  channel: AdvanceReturnChannel
  amountSatang: number
  payoutBatchId: string | null
  payoutBatchName: string | null
  /** `YYYY-MM-DD` (คอลัมน์ `DATE`) — เฉพาะรับคืนแยก */
  receivedDate: string | null
  evidenceFilePath: string | null
  note: string | null
  /** กลับรายการแล้ว (รอบจ่ายถูกยกเลิก/รายการถูกตัดออก) — ไม่นับเป็นยอดที่ได้คืน */
  reversedAt: string | null
  reversalReason: string | null
  createdAt: string
  createdByName: string
}

/** ผลของการเคลียร์ยอด — `excessClaimId` = คำขอเบิกส่วนเกินที่ระบบสร้างให้ (มติ PO 03/10/2569 UAT Q3) · `null` = ไม่ได้ใช้เกิน */
export interface AdvanceSettleResult extends AdvanceDto {
  excessClaimId: string | null
}
