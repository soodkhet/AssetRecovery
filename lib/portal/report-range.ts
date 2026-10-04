import type { PortalRevenueSummaryMonth } from '@/lib/portal/serializers'
import { resolveReportPeriod, toIsoDateOnly } from '@/lib/reports/period'
import type { ReportRange } from '@/lib/reports/range'

const MS_PER_DAY = 86_400_000

/**
 * ช่วงของรายงานสรุปยอดเรียกเก็บในพอร์ทัล (`97` §6.5 "แนวโน้ม 6 เดือน") — pure
 *
 * เดือนปฏิทิน**ไทย**ย้อนหลัง `count` เดือน (รวมเดือนปัจจุบัน) เรียงเก่า → ใหม่ · ใช้
 * `resolveReportPeriod()` ตัวเดียวกับรายงานภายใน ⇒ คีย์เดือน (`YYYY-MM-DD` วันแรก) ตรงกับคีย์แถวของ F2
 * และป้ายเป็น พ.ศ. · ช่วงเป็น preset `custom` ⇒ `previousReportRange()` ได้ช่วงก่อนหน้ายาวเท่ากัน (ฐาน MoM)
 */
export function portalRevenueMonths(
  count: number,
  now: Date,
): { months: PortalRevenueSummaryMonth[]; range: ReportRange } {
  if (!Number.isInteger(count) || count < 1) throw new RangeError('portalRevenueMonths: จำนวนเดือนต้องเป็นจำนวนเต็มบวก')
  const current = resolveReportPeriod('month', now)
  const periods = [current]
  for (let index = 1; index < count; index += 1) {
    const earliest = periods[0] ?? current
    // วันสุดท้ายของเดือนก่อนหน้า (เที่ยงคืน UTC = 07:00 ไทย วันเดียวกัน) → เดือนก่อนหน้า
    periods.unshift(resolveReportPeriod('month', new Date(earliest.startDate.getTime() - MS_PER_DAY)))
  }
  const first = periods[0] ?? current
  return {
    months: periods.map((period) => ({ key: toIsoDateOnly(period.startDate), label: period.label })),
    range: {
      preset: 'custom',
      startDate: first.startDate,
      endDate: current.endDate,
      label: first === current ? current.label : `${first.label} – ${current.label}`,
    },
  }
}
