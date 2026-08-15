import { assertPeriodOpenForKey } from '@/lib/accounting/period-guard'
import { prisma } from '@/lib/prisma'
import { refreshFilingSummary } from '@/lib/wht/queries'

/**
 * Job `wht_summary` (`91` §6.1 · `33` §9) — คำนวณสรุปยื่น ภ.ง.ด.3/53 ของงวดใหม่จากใบที่ยังมีผล
 *
 * เป็น **ตัวห่อบาง ๆ** ของ `refreshFilingSummary()` ที่ Phase 4.5 เขียนไว้แล้ว (ห้ามเขียนสูตรซ้ำ) —
 * ปกติสรุปถูกคำนวณใหม่ทุกครั้งที่ใบ 50 ทวิ เกิดหรือถูกยกเลิกอยู่แล้ว · job นี้เป็นตาข่ายกันพลาด
 * รายวัน (เช่นแถวที่แก้ผ่าน adjustment หรือรอบที่ยังไม่เคยมีสรุป)
 *
 * ### ทำไม idempotent (`91` §17)
 * - `refreshFilingSummary()` คำนวณ **ทั้งก้อนใหม่แล้วเขียนทับ** ไม่ได้บวกเพิ่ม ⇒ รันกี่รอบก็ได้ค่าเดิม
 * - ไม่สร้างเอกสารภาษีใด ๆ (ใบ 50 ทวิ ออกจากรอบจ่ายเท่านั้น — `33` §9)
 * - งวดที่ยื่นแล้ว (`filed`) ยังคำนวณยอดใหม่ได้ แต่สถานะไม่ถูกแตะ (`33` §9 — `pending → filed` ทางเดียว)
 */

export const WHT_SUMMARY_JOB_TYPE = 'wht_summary'

export interface WhtSummaryJobOptions {
  organizationId?: string
  /** ระบุงวดเดียว — ไม่ระบุ = ทุกงวดที่ยังไม่ปิดการแก้ไข */
  periodId?: string
  jobId?: string
  now?: Date
  limit?: number
}

export interface WhtSummaryJobResult {
  /** งวดที่คำนวณใหม่ในรอบนี้ */
  refreshed: number
  periodIds: string[]
}

/** งวดยังเปิดให้เขียนอยู่ไหม ณ วินาทีที่จะเขียนจริง (กัน TOCTOU ของ job ที่รันคร่อมช่วงปิดงวด) */
async function isPeriodStillEditable(period: { organizationId: string; yearBe: number; month: number }): Promise<boolean> {
  try {
    await assertPeriodOpenForKey({
      organizationId: period.organizationId,
      key: { yearBe: period.yearBe, month: period.month },
      targetType: 'wht_filing_summaries',
      affectsAmount: true,
    })
    return true
  } catch {
    return false
  }
}

export async function runWhtSummaryJob(options: WhtSummaryJobOptions = {}): Promise<WhtSummaryJobResult> {
  const periods = await prisma.accountingPeriod.findMany({
    where: {
      ...(options.organizationId === undefined ? {} : { organizationId: options.organizationId }),
      ...(options.periodId === undefined ? {} : { id: options.periodId }),
      // งวดที่ปิดแล้วไม่ต้องคำนวณซ้ำ (ยอดนิ่งแล้ว — แก้ได้เฉพาะผ่าน Adjustment ตาม `30`)
      // ⚠️ ตัวกรองนี้ต้องมี **เสมอ** ไม่ว่าจะสั่งงวดเดียวหรือทั้งหมด (Final Test ด่าน 6):
      // เดิมถ้าใครส่ง `periodId` มาใน payload ของ job ตัวกรองหายไปทั้งดุ้น ⇒ job เขียนทับยอด
      // ภ.ง.ด. ของงวดที่ล็อกแล้วโดยไม่ผ่าน `PERIOD_LOCKED_DIRECT_EDIT` และไม่มี Adjustment
      // `sent_to_accountant` ก็แก้ไม่ได้เช่นกัน (`lib/settings/period-lock.ts`)
      status: { notIn: ['locked', 'sent_to_accountant'] },
    },
    orderBy: [{ yearBe: 'desc' }, { month: 'desc' }],
    take: options.limit ?? 24,
    select: { id: true, organizationId: true, periodLabel: true, yearBe: true, month: true },
  })

  const result: WhtSummaryJobResult = { refreshed: 0, periodIds: [] }
  for (const period of periods) {
    // อ่านรายการงวดครั้งเดียวแล้ววนเขียน ⇒ งวดที่ถูกล็อก **ระหว่างทาง** จะมองไม่เห็น (TOCTOU)
    // เช็คซ้ำก่อนเขียนแต่ละงวด — งวดที่เพิ่งถูกล็อกให้ข้ามไปเงียบ ๆ ไม่ทำให้ทั้ง job ล้ม
    if (!(await isPeriodStillEditable(period))) continue

    await refreshFilingSummary(prisma, {
      organizationId: period.organizationId,
      periodId: period.id,
      periodLabel: period.periodLabel,
      yearBe: period.yearBe,
      month: period.month,
    })
    result.refreshed += 1
    result.periodIds.push(period.id)
  }
  return result
}
