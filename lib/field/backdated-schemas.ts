import { z } from 'zod'
import { dateOnlySchema, reasonSchema, requiredIdSchema } from '@/lib/api/validation'

/**
 * "สร้างรายการเบิกย้อนหลัง" ของวันลงพื้นที่ที่อยู่ในงวดปิด (มติ PO 05/10/2569 U50 · `41` §6.6)
 * — schema เดียวใช้ร่วม FE/BE (Rule 04) · เหตุผลบังคับ (กระทบเงิน — `90` §13)
 */
export const backdatedFieldDaySchema = z.object({
  agentId: requiredIdSchema('พนักงาน'),
  /** วันลงพื้นที่เดิม (วันไทย `YYYY-MM-DD`) — ไม่ใช่วันที่ลงรายการ */
  fieldDate: dateOnlySchema('วันลงพื้นที่'),
  reason: reasonSchema,
})

export type BackdatedFieldDayInput = z.infer<typeof backdatedFieldDaySchema>

/**
 * "สร้างรายการเบิกย้อนหลัง" ของค่าน้ำมันตามระยะทางที่คำนวณได้หลังงวดของวันปิดงานปิดแล้ว (มติ PO U135)
 * `jobId` = งาน `fuel_distance_retry` ที่เก็บยอดไว้ · เหตุผลบังคับ (กระทบเงิน — `90` §13)
 */
export const backdatedFuelExpenseSchema = z.object({
  jobId: requiredIdSchema('งานคำนวณค่าน้ำมัน'),
  reason: reasonSchema,
})

export type BackdatedFuelExpenseInput = z.infer<typeof backdatedFuelExpenseSchema>
