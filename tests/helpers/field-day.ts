import { toInputDate } from '@/lib/format/datetime'

/**
 * มติ PO 03/10/2569 (UAT Q21) — ค่าน้ำมันเหมาจ่าย/เบี้ยเลี้ยงเกิดจาก job `daily_field_allowance` หลังจบวัน
 * เทสต์ที่เช็คอิน "วันนี้" แล้วต้องการแถวรายวัน/ให้เกตรายได้ผ่าน เรียกตัวนี้แทนการรอข้ามเที่ยงคืน
 * (ทางเดียวกับ dev trigger ที่ส่ง `date` = วันนี้)
 *
 * ⚠️ import service แบบ dynamic — ไฟล์เทสต์ DB ต้องตั้ง `DATABASE_URL` ก่อนโหลด `@/lib/prisma`
 */
export async function settleFieldDaysToday(organizationId: string, now: Date = new Date()) {
  const { runDailyFieldAllowanceJob } = await import('@/lib/field/daily-allowance-job')
  return runDailyFieldAllowanceJob({ organizationId, date: toInputDate(now), now })
}
