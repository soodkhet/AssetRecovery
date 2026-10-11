import { hotelStayDateKeys, isValidHotelNights } from '@/lib/field/hotel-claim'

/**
 * เคสที่จับคู่อัตโนมัติกับใบเบิกค่าที่พัก (`41` §6.6 `matched_case_ids`) — เคสของพนักงานคนเดียวกันที่ `schedule_date`
 * อยู่ในช่วงวันที่พัก (วันเข้าพัก … + จำนวนคืน − 1 ตามมติ PO O50) · **ใช้ตรวจสอบเท่านั้น ไม่มีผลต่อยอดเงิน**
 *
 * mytester DO-08 — ผู้อนุมัติต้องเห็นรายการนี้ในรายละเอียดใบเบิก (เดิมแสดงแค่ "ไม่ผูกเคส")
 */

export interface HotelStay {
  /** id ของรายการเบิก */
  id: string
  /** user ของพนักงานผู้เบิก (เจ้าของ assignment) */
  agentUserId: string
  /** วันที่เข้าพัก `YYYY-MM-DD` */
  checkInDate: string
  nights: number
}

export interface ScheduledAssignment {
  agentId: string
  /** `YYYY-MM-DD` */
  scheduledDate: string
  caseId: string
  caseRef: string
}

export interface MatchedCase {
  caseId: string
  caseRef: string
  /** `YYYY-MM-DD` วันที่จัดลงพื้นที่ */
  scheduledDate: string
}

/** วันที่พักของใบเบิก — จำนวนคืนผิดรูป (ข้อมูลเก่า) ถือเป็น 1 คืน ไม่ทำให้ทั้งรายการพัง */
export function stayDateKeys(stay: HotelStay): string[] {
  return hotelStayDateKeys(stay.checkInDate, isValidHotelNights(stay.nights) ? stay.nights : 1)
}

/** **pure** — จับคู่ใบเบิกกับ assignment ของคนเดียวกันที่อยู่ในช่วงวันพัก · เรียงตามวัน แล้วเลขเคส · ไม่ซ้ำเคส */
export function matchHotelStays(
  stays: readonly HotelStay[],
  assignments: readonly ScheduledAssignment[],
): Map<string, MatchedCase[]> {
  const result = new Map<string, MatchedCase[]>()
  for (const stay of stays) {
    const days = new Set(stayDateKeys(stay))
    const seen = new Set<string>()
    const matched = assignments
      .filter((row) => row.agentId === stay.agentUserId && days.has(row.scheduledDate))
      .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.caseRef.localeCompare(b.caseRef))
      .filter((row) => {
        if (seen.has(row.caseId)) return false
        seen.add(row.caseId)
        return true
      })
      .map((row) => ({ caseId: row.caseId, caseRef: row.caseRef, scheduledDate: row.scheduledDate }))
    result.set(stay.id, matched)
  }
  return result
}
