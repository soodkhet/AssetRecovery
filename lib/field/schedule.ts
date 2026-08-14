import { FieldError } from '@/lib/field/errors'

/**
 * ลำดับงานในแต่ละวัน (ไฟล์ 41 §6.1 · §7.5 · §8) — **pure ล้วน**
 *
 * กติกา: จัดวันแล้วได้ลำดับ **ต่อจากเคสสุดท้ายของวันนั้น** (§8 `schedule_case`) ·
 * ลากสลับได้เสมอไม่มีเงื่อนไข lock (§11) และการลาก 1 ครั้ง = **recompute ลำดับใหม่ทั้งวัน** (§8 `reorder_schedule`)
 *
 * หมายเหตุ: "วันที่ผ่านมาแล้วเลือกไม่ได้" เป็นกฎของ Calendar Picker ฝั่งหน้าจอ (§7.4)
 * `41` §12 ไม่มี error code สำหรับกรณีนี้ — BE จึงไม่บล็อกวันย้อนหลัง (เผื่อบันทึกงานที่ทำไปแล้ว)
 */

/** ลำดับถัดไปของวันนั้น = ต่อท้ายเสมอ (`41` §8 · §20 "วันมีเคสอยู่ 2 → ได้ลำดับ 3") */
export function nextScheduleOrder(existingOrders: readonly (number | null)[]): number {
  const highest = existingOrders.reduce<number>((max, order) => (order !== null && order > max ? order : max), 0)
  // เผื่อแถวเก่าที่ยังไม่มีลำดับ (null) — ลำดับใหม่ต้องไม่ชนกับจำนวนเคสที่มีอยู่จริงของวันนั้น
  return Math.max(highest, existingOrders.length) + 1
}

export interface ScheduleOrderUpdate {
  assignmentId: string
  scheduleOrder: number
}

/** recompute ลำดับ 1..n ตามที่ลากมา — คืนเฉพาะแถวที่ **ลำดับเปลี่ยนจริง** เพื่อไม่ให้เขียน DB เปล่า ๆ */
export function recomputeScheduleOrder(
  orderedAssignmentIds: readonly string[],
  currentOrders: ReadonlyMap<string, number | null>,
): ScheduleOrderUpdate[] {
  return orderedAssignmentIds
    .map((assignmentId, index) => ({ assignmentId, scheduleOrder: index + 1 }))
    .filter((row) => currentOrders.get(row.assignmentId) !== row.scheduleOrder)
}

/**
 * รายการที่ลากมาต้องเป็น **เคสของวันนั้นครบทุกใบ ไม่ขาดไม่เกินไม่ซ้ำ**
 * (ไม่งั้น recompute แล้วจะมีเคสตกค้างไม่มีลำดับ — `41` §8 บอกว่าอัปเดต "ทุกเคสในวันนั้น")
 */
export function assertReorderCoversDay(dayAssignmentIds: readonly string[], orderedAssignmentIds: readonly string[]): void {
  const ordered = new Set(orderedAssignmentIds)
  if (ordered.size !== orderedAssignmentIds.length) {
    throw new FieldError('REQUIRED_MISSING', {
      detail: 'รายการลำดับมีเคสซ้ำ',
      context: { reason: 'duplicate' },
    })
  }

  const day = new Set(dayAssignmentIds)
  const missing = dayAssignmentIds.filter((id) => !ordered.has(id))
  const unknown = orderedAssignmentIds.filter((id) => !day.has(id))

  if (missing.length > 0 || unknown.length > 0) {
    throw new FieldError('REQUIRED_MISSING', {
      detail: 'รายการลำดับต้องมีครบทุกเคสของวันนั้นพอดี',
      context: { missing, unknown },
    })
  }
}
