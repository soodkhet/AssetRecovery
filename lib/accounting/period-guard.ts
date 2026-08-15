import { periodKeyOf, type PeriodKey } from '@/lib/accounting/period'
import type { AccountingPeriodStatus } from '@/lib/generated/prisma/enums'
import { prisma } from '@/lib/prisma'
import { parseBillingPeriodLabel } from '@/lib/revenue/revenue'
import { assertPeriodEditable } from '@/lib/settings/period-lock'

/**
 * **Interceptor `PERIOD_LOCKED_DIRECT_EDIT` (cross-cutting)** — `13` §6.11 · `30` · `20`
 *
 * นโยบายอยู่ที่ `lib/settings/period-lock.ts` (pure) ตัวนี้คือ "ชั้นที่ไปถาม DB ว่ารายการนี้อยู่รอบไหน"
 * แล้วส่งต่อให้ `assertPeriodEditable()` ตัดสิน — **ห้ามเขียนกติกา locked/collecting ซ้ำที่นี่**
 *
 * ### กติกาการเลือก "วันที่" ที่ส่งเข้ามา
 * - รายการที่มีวันของตัวเอง (รายได้/ค่าใช้จ่าย/รอบวางบิล) ⇒ ใช้วันของ **รายการนั้น**
 *   (`revenue_date` / `expense_date` / ป้ายงวดของรอบวางบิล) — ไม่ใช่ `now()` เพราะการแก้รายการเก่า
 *   ต้องโดนล็อกของรอบเก่า
 * - รายการที่กำลังจะเกิดใหม่ (สร้างรอบวางบิล/รอบจ่ายจากวันตัดรอบ) ⇒ ใช้วันตัดรอบ/วันที่ทำรายการ
 *
 * `periodStatus = null` (ยังไม่เปิดรอบของเดือนนั้น) = แก้ได้ — นโยบายถือเป็น `collecting` (`13` §6.11)
 */

/**
 * client ที่อ่านรอบบัญชีได้ — `prisma` หรือ tx client จาก `$transaction()`
 * ประกาศแบบ **structural** (เอาเฉพาะเมธอดที่ใช้) เพราะ type ของ extended client กับ tx client
 * ไม่ตรงกันเป๊ะ แล้วทำให้ tsc บานปลาย (แนวเดียวกับ `AuditClient` ใน `lib/audit/audit.ts`)
 */
export interface PeriodQueryClient {
  accountingPeriod: {
    findFirst(args: {
      where: { organizationId: string; yearBe: number; month: number }
      select: { status: true }
    }): Promise<{ status: AccountingPeriodStatus } | null>
  }
}

type QueryClient = PeriodQueryClient

/** สถานะรอบบัญชีของงวด — `null` = ยังไม่มีรอบของเดือนนั้นในระบบ */
export async function periodStatusAt(
  organizationId: string,
  key: PeriodKey,
  client: QueryClient = prisma,
): Promise<AccountingPeriodStatus | null> {
  const row = await client.accountingPeriod.findFirst({
    where: { organizationId, yearBe: key.yearBe, month: key.month },
    select: { status: true },
  })
  return row?.status ?? null
}

export interface PeriodGuardInput {
  organizationId: string
  /** วันที่ที่ใช้หางวดบัญชีของรายการ (ยึดปฏิทินไทยผ่าน `periodKeyOf`) */
  at: Date
  /** ชื่อตารางของรายการที่กำลังจะแก้ — ไปโผล่ใน `detail` ของ error และ audit */
  targetType: string
  targetId?: string | null
  /**
   * การเขียนนี้ขยับยอดที่ส่งสำนักงานบัญชีไปแล้วหรือไม่ (default `true`)
   * `false` = งานจัดหมวดที่ไม่ขยับตัวเลข ⇒ รอบ `sent_to_accountant` ยังทำได้ (`13` §6.11)
   */
  affectsAmount?: boolean
}

/**
 * ยามหลักที่ต้องเรียก **ก่อน** ทุก write ของสายการเงิน/บัญชีที่ผูกกับงวด
 * รอบ `locked` ⇒ โยน `PERIOD_LOCKED_DIRECT_EDIT` (400) ให้ไปใช้ Adjustment แทน (`20`)
 * รอบ `sent_to_accountant` ⇒ โยนเฉพาะการเขียนที่กระทบยอด (`13` §6.11)
 */
export async function assertPeriodOpenAt(input: PeriodGuardInput, client: QueryClient = prisma): Promise<void> {
  const status = await periodStatusAt(input.organizationId, periodKeyOf(input.at), client)
  assertPeriodEditable({
    periodStatus: status,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    affectsAmount: input.affectsAmount,
  })
}

/** เวอร์ชันที่รู้งวดอยู่แล้ว (เช่นรอบวางบิลที่เก็บป้ายงวดไว้เป็นข้อความ) */
export async function assertPeriodOpenForKey(
  input: {
    organizationId: string
    key: PeriodKey
    targetType: string
    targetId?: string | null
    affectsAmount?: boolean
  },
  client: QueryClient = prisma,
): Promise<void> {
  const status = await periodStatusAt(input.organizationId, input.key, client)
  assertPeriodEditable({
    periodStatus: status,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    affectsAmount: input.affectsAmount,
  })
}

/**
 * รอบวางบิลเก็บงวดเป็น**ป้ายข้อความ** ("มิถุนายน 2569") ไม่ใช่วันที่ — `due_date` ข้ามเดือนได้
 * จึงต้องอ่านจากป้าย (`19` §6.2) · ป้ายที่อ่านไม่ออก = ไม่รู้งวด ⇒ ปล่อยผ่าน (ไม่บล็อกมั่ว)
 */
export async function assertPeriodOpenForLabel(
  input: {
    organizationId: string
    periodLabel: string
    targetType: string
    targetId?: string | null
    affectsAmount?: boolean
  },
  client: QueryClient = prisma,
): Promise<void> {
  const key = parseBillingPeriodLabel(input.periodLabel)
  if (key === null) return
  await assertPeriodOpenForKey(
    {
      organizationId: input.organizationId,
      key,
      targetType: input.targetType,
      targetId: input.targetId,
      affectsAmount: input.affectsAmount,
    },
    client,
  )
}
