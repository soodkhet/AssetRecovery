import type { AccountingMutationContext } from '@/lib/accounting/queries'
import { syncExpenseRecordsFromPayout, type PayoutSyncOptions } from '@/lib/expenses/queries'
import { usersWithCapability } from '@/lib/notifications/dispatch'
import { payoutBatchCompletedMessage, payoutPaidToPayeeMessage } from '@/lib/notifications/messages'
import { payoutTransferSatang } from '@/lib/finance/advance-offset-calc'
import { enqueueNotificationOutbox, type OutboxWriter } from '@/lib/notifications/outbox'
import { outboxMessageEntries } from '@/lib/notifications/outbox-core'
import { prisma } from '@/lib/prisma'

/**
 * ขั้นหลังรอบจ่าย `completed` (มติ PO 07/10/2569 U134 · Final Test ด่าน 6 ND-1)
 *
 * รอบจ่ายเปลี่ยนเป็น `completed` ใน `$transaction` ของมันเอง แล้วจึงทำ "ขั้นหลัง commit" สองอย่าง:
 *  1. บันทึกบัญชีค่าใช้จ่าย (`32` §6.1) → ออกใบ 50 ทวิ (`33` §9) — `syncExpenseRecordsFromPayout()`
 *  2. แจ้งผู้ดูแลรอบจ่าย (`90` §6.3 แถว 7)
 *
 * ถ้าขั้นหลัง commit ล้ม เดิมรอบจะค้างเป็น `completed` โดยไม่มีบันทึกจ่าย/50 ทวิ และไม่มีทางซ่อม ⇒ ตอนนี้:
 *  - แจ้งเตือน **เข้าคิว outbox ใน tx เดียวกับการเปลี่ยนสถานะ** (`enqueuePayoutCompletedNotice()` — DEC-015)
 *    ⇒ ตัวส่งคิวท้ายคำขอ + ทุกรอบ cron ส่งให้จนสำเร็จ (กุญแจกันซ้ำผูกกับรอบจ่าย)
 *  - บันทึกจ่าย/50 ทวิ ทำเสร็จแล้วมาร์ค `payout_batches.post_completion_synced_at`
 *    (`finishPayoutPostCompletion()`) · รอบ `completed` ที่ยังไม่มีเครื่องหมาย = ค้าง ⇒ ตัวกวาด
 *    `runPayoutCompletionSweep()` (เรียกจาก `runSweeperJobs()`) ตั้งงาน `payout_completion_repair` ทำต่อ
 *
 * กันซ้ำด้วยกุญแจเดิมทั้งหมด: `expense_records.payout_batch_item_id` UNIQUE + `uniq_wht_cert_active_per_expense`
 * (ฝั่ง sync จับ P2002 แล้วอ่านของเดิมกลับ) ⇒ ตัวกวาดกับคำขอเดิมวิ่งชนกันได้ ไม่สร้างซ้ำ
 */

/**
 * เข้าคิวแจ้งเตือน "รอบจ่ายโอนเงินสำเร็จ" ใน `$transaction` ของผู้เรียก — rollback = ไม่มีแถว
 * ผู้รับต้อง resolve **ก่อน** เปิด tx (`usersWithCapability()` อ่านนอก tx) ⇒ แยกเป็นสองจังหวะ
 */
export async function payoutCompletedNoticeRecipients(organizationId: string): Promise<string[]> {
  return usersWithCapability(organizationId, 'manage_payout_batch')
}

export interface PayoutPayeeNotice {
  userId: string
  /** ยอดโอนจริงของผู้รับคนนี้ในรอบ (หลังหักภาษีและหักคืนเงินทดรอง) */
  transferSatang: number
}

/**
 * ผู้รับเงินในรอบ + ยอดโอนของแต่ละคน (staging E-011) — อ่านก่อนเปิด tx แบบเดียวกับ `payoutCompletedNoticeRecipients()`
 * · ผู้รับที่ยอดโอนเป็น 0 (หักคืนเงินทดรองหมด) ไม่ได้รับ "โอนแล้ว"
 */
export async function payoutPayeeNotices(organizationId: string, batchId: string): Promise<PayoutPayeeNotice[]> {
  const items = await prisma.payoutBatchItem.findMany({
    where: { organizationId, payoutBatchId: batchId },
    select: { netSatang: true, advanceOffsetSatang: true, recoveryOffsetSatang: true, payee: { select: { userId: true } } },
  })
  return groupPayeeTransfers(
    items.map((item) => ({
      userId: item.payee.userId,
      transferSatang: payoutTransferSatang(item.netSatang, item.advanceOffsetSatang, item.recoveryOffsetSatang),
    })),
  )
}

/** รวมยอดโอนต่อผู้ใช้ (ผู้รับหนึ่งคนมีหลายรายการในรอบ) · ตัดคนที่ยอดรวมไม่เกิน 0 — pure */
export function groupPayeeTransfers(rows: readonly PayoutPayeeNotice[]): PayoutPayeeNotice[] {
  const totals = new Map<string, number>()
  for (const row of rows) totals.set(row.userId, (totals.get(row.userId) ?? 0) + row.transferSatang)
  return [...totals]
    .filter(([, transferSatang]) => transferSatang > 0)
    .map(([userId, transferSatang]) => ({ userId, transferSatang }))
}

export async function enqueuePayoutCompletedNotice(
  tx: OutboxWriter,
  input: {
    organizationId: string
    userIds: readonly string[]
    batch: { id: string; name: string; netSatang: number }
    source: 'manual' | 'bank_reconciliation'
    /** ผู้รับเงินแต่ละคน — แจ้ง "โอนแล้ว" พร้อมยอดของตัวเอง (staging E-011) */
    payees?: readonly PayoutPayeeNotice[]
  },
): Promise<number> {
  const message = payoutBatchCompletedMessage({
    batchId: input.batch.id,
    batchName: input.batch.name,
    netSatang: input.batch.netSatang,
    source: input.source,
  })
  const payeeEntries = (input.payees ?? []).flatMap((payee) =>
    outboxMessageEntries(
      input.organizationId,
      [payee.userId],
      payoutPaidToPayeeMessage({ batchId: input.batch.id, userId: payee.userId, transferSatang: payee.transferSatang }),
    ),
  )
  return enqueueNotificationOutbox(
    tx,
    [...outboxMessageEntries(input.organizationId, input.userIds, message), ...payeeEntries],
    { jobType: 'payout_batch_completed', jobRef: input.batch.id },
  )
}

export interface PayoutPostCompletionResult {
  expenseRecordCount: number
  /** `true` = มาร์คครบรอบนี้ (คนอื่นมาร์คไปก่อนแล้ว = `false` — ไม่ใช่ error) */
  marked: boolean
}

/**
 * ทำขั้นหลังรอบจ่ายสำเร็จ (บันทึกจ่าย + 50 ทวิ) แล้วมาร์คว่าครบ — **idempotent** เรียกซ้ำ/ชนกันได้
 *
 * เครื่องหมายเขียนด้วย raw SQL (ไม่ให้ `updated_at` ขยับ — วันที่จ่ายของรอบที่ไม่มีไฟล์โอนอ้าง `updated_at`)
 * และเขียนเฉพาะรอบที่ยัง `completed` + ยังไม่ถูกมาร์ค
 */
export async function finishPayoutPostCompletion(
  ctx: AccountingMutationContext,
  batchId: string,
  options: PayoutSyncOptions = {},
): Promise<PayoutPostCompletionResult> {
  const records = await syncExpenseRecordsFromPayout(ctx, batchId, options)
  const marked = await prisma.$executeRaw`
    UPDATE payout_batches
       SET post_completion_synced_at = now()
     WHERE id = ${batchId}::uuid
       AND organization_id = ${ctx.actor.organizationId}::uuid
       AND status = 'completed'
       AND post_completion_synced_at IS NULL
  `
  return { expenseRecordCount: records.length, marked: marked === 1 }
}

/**
 * ทางเดินปกติหลัง commit (กดยืนยันเอง / จับคู่ธนาคาร) — ล้มแล้ว **ไม่โยนต่อ**: รอบจ่ายสำเร็จจริงแล้ว
 * ผู้ใช้ไม่ควรเห็น error แล้วกดซ้ำ (จะเจอสถานะไม่ถูกต้อง) · ตัวกวาดรอบ cron ถัดไปทำต่อให้ครบ
 */
export async function finishPayoutPostCompletionSafely(
  ctx: AccountingMutationContext,
  batchId: string,
): Promise<PayoutPostCompletionResult | null> {
  try {
    return await finishPayoutPostCompletion(ctx, batchId)
  } catch (error) {
    console.error('[payout] ขั้นหลังรอบจ่ายสำเร็จล้ม — ตัวกวาดรอบถัดไปจะทำต่อให้ครบ', { batchId, error })
    return null
  }
}
