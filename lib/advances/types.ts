import type { AdvanceStatus } from '@/lib/generated/prisma/enums'

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
}
