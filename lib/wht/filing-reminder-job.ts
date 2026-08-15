import { bangkokBusinessDate } from '@/lib/field/expense-queries'
import { dispatchNotificationAwaited, usersWithCapability } from '@/lib/notifications/dispatch'
import { whtFilingDueMessage } from '@/lib/notifications/messages'
import { prisma } from '@/lib/prisma'
import { MANAGE_WHT } from '@/lib/wht/wht'

/**
 * Job `wht_filing_reminder` (`33` §6.2/§8 · `90` §6.3 แถว 8 · `91` §17 — ทุก job ต้อง idempotent)
 *
 * เตือนทีมบัญชีก่อนถึงกำหนดนำส่ง ภ.ง.ด.3/53 ของงวดที่ยังเป็น `pending`
 * — พลาดกำหนดมี **โทษปรับจริง** (`33` §6.2) จึงเตือนต่อไปแม้เลยกำหนดแล้ว (ข้อความเปลี่ยนเป็น "เลยกำหนด")
 *
 * ### ทำไม idempotent
 * - เลือกอ่านอย่างเดียว ไม่เขียนสถานะอะไรเลย — งานทั้งหมดคือการแจ้งเตือน
 * - ทุกข้อความพก `dedupeKey = wht-filing-<summaryId>` ⇒ รันวันละกี่รอบก็ได้แถวเดียวต่อผู้รับหนึ่งคน
 *   (กันที่ PRIMARY KEY ของ `notifications` ไม่ใช่ที่แอป — `lib/notifications/dedupe.ts`)
 * - ยื่นแล้ว (`filed`) จะไม่ถูกเลือกอีก
 *
 * ตัว scheduler (Vercel Cron/QStash) + ตาราง `jobs` เป็นงานของ Phase 5.3 — ที่นี่คือ handler ล้วน ๆ
 */

export const WHT_FILING_REMINDER_JOB_TYPE = 'wht_filing_reminder'

/**
 * เตือนล่วงหน้ากี่วัน — ค่าเริ่มต้น 5 วันตามตัวอย่างของ `33` §8
 * ("เหลือ 5 วันก่อนกำหนดนำส่ง ภ.ง.ด.3/53 ของเดือนนี้") · เอกสารไม่ได้ล็อกตัวเลขไว้ จึงเปิดให้ job ส่งค่าอื่นได้
 */
export const WHT_FILING_REMINDER_DAYS_BEFORE = 5

const MS_PER_DAY = 24 * 60 * 60 * 1000

export interface WhtFilingReminderOptions {
  organizationId?: string
  daysBefore?: number
  /** เวลาอ้างอิง (เทสต์ส่งเวลาปลอมเข้ามาได้) */
  now?: Date
  limit?: number
}

export interface WhtFilingReminderResult {
  /** งวดที่เข้าเกณฑ์เตือนในรอบนี้ */
  due: number
  /** แถวแจ้งเตือนที่สร้างใหม่จริง (รันซ้ำรอบสอง = 0) */
  notified: number
}

/** จำนวนวันที่เหลือถึงกำหนด — คิดบนปฏิทินไทย (เที่ยงคืนถึงเที่ยงคืน) ไม่ใช่ชั่วโมงดิบ (Rule 01) */
export function daysUntilFilingDue(filingDueDate: Date, now: Date): number {
  const today = bangkokBusinessDate(now).getTime()
  const due = Date.UTC(
    filingDueDate.getUTCFullYear(),
    filingDueDate.getUTCMonth(),
    filingDueDate.getUTCDate(),
  )
  return Math.round((due - today) / MS_PER_DAY)
}

export async function runWhtFilingReminderJob(
  options: WhtFilingReminderOptions = {},
): Promise<WhtFilingReminderResult> {
  const now = options.now ?? new Date()
  const daysBefore = options.daysBefore ?? WHT_FILING_REMINDER_DAYS_BEFORE
  // เที่ยงคืนไทยของวันที่ "เตือนได้แล้ว" — งวดที่ครบกำหนดหลังจากนี้ยังไม่ต้องรบกวนใคร
  const threshold = new Date(bangkokBusinessDate(now).getTime() + daysBefore * MS_PER_DAY)

  const rows = await prisma.whtFilingSummary.findMany({
    where: {
      status: 'pending',
      filingDueDate: { lte: threshold },
      ...(options.organizationId === undefined ? {} : { organizationId: options.organizationId }),
    },
    orderBy: { filingDueDate: 'asc' },
    take: options.limit ?? 100,
    select: { id: true, organizationId: true, periodLabel: true, filingDueDate: true },
  })

  const result: WhtFilingReminderResult = { due: rows.length, notified: 0 }
  // หลายงวดมักอยู่องค์กรเดียวกัน — หาผู้รับครั้งเดียวต่อองค์กร
  const recipients = new Map<string, string[]>()

  for (const row of rows) {
    let userIds = recipients.get(row.organizationId)
    if (userIds === undefined) {
      userIds = await usersWithCapability(row.organizationId, MANAGE_WHT)
      recipients.set(row.organizationId, userIds)
    }

    result.notified += await dispatchNotificationAwaited(
      { organizationId: row.organizationId, userIds },
      whtFilingDueMessage({
        summaryId: row.id,
        periodLabel: row.periodLabel,
        filingDueDate: row.filingDueDate,
        daysLeft: daysUntilFilingDue(row.filingDueDate, now),
      }),
    )
  }

  return result
}
