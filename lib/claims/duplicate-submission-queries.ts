import {
  ClaimDuplicateError,
  ClaimReceiptReusedError,
  DUPLICATE_CLAIM_IGNORED_STATUSES,
  DUPLICATE_CLAIM_WINDOW_MS,
  findReceiptReuse,
  isDuplicateClaimSubmission,
  type ClaimSubmissionKey,
} from '@/lib/claims/duplicate-submission'
import type { ExpenseTxClient } from '@/lib/field/expense-queries'
import type { ExpenseType } from '@/lib/generated/prisma/enums'

/**
 * ปฏิเสธใบเบิกที่ส่งซ้ำ (`duplicate-submission.ts`) — เรียก**ภายในทรานแซกชันที่สร้างใบเบิก ก่อน insert**
 * ล็อก advisory ต่อผู้รับเงินก่อนค้น ⇒ request ที่ส่งพร้อมกัน 2 ตัว (กดรัว/retry ซ้อน) ตัวหลังรอจนตัวแรก
 * commit แล้วจึงเห็นแถวนั้น (ล็อกปล่อยเองตอนจบทรานแซกชัน)
 */
export async function assertNoDuplicateClaimSubmission(
  tx: ExpenseTxClient,
  input: ClaimSubmissionKey & { organizationId: string; expenseType: ExpenseType; now?: Date },
): Promise<void> {
  const now = input.now ?? new Date()
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`claim_submission:${input.organizationId}:${input.payeeId}`}))`

  const recent = await tx.expense.findMany({
    where: {
      organizationId: input.organizationId,
      payeeId: input.payeeId,
      caseId: null,
      expenseType: input.expenseType,
      grossSatang: input.grossSatang,
      expenseDate: input.expenseDate,
      status: { notIn: [...DUPLICATE_CLAIM_IGNORED_STATUSES] },
      createdAt: { gte: new Date(now.getTime() - DUPLICATE_CLAIM_WINDOW_MS) },
      deletedAt: null,
    },
    select: {
      id: true,
      payeeId: true,
      expenseType: true,
      grossSatang: true,
      expenseDate: true,
      receiptFileHash: true,
      revisionNote: true,
      hotelNights: true,
      sharedWithUserId: true,
      receiptInCompanyName: true,
      status: true,
      createdAt: true,
    },
  })

  const duplicate = recent.find((row) => isDuplicateClaimSubmission(input, row, now))
  if (duplicate !== undefined) throw new ClaimDuplicateError(duplicate.id)

  // preship R3-004 — ไม่ใช่ retry แต่ใช้ใบเสร็จไฟล์เดิมกับใบเบิกอื่น (เปลี่ยนหมายเหตุ/ยอด ฯลฯ) ⇒ ปฏิเสธเช่นกัน
  await assertReceiptNotReused(tx, {
    organizationId: input.organizationId,
    payeeId: input.payeeId,
    receiptFileHash: input.receiptFileHash,
  })
}

/**
 * ใบเสร็จไฟล์เดียวกัน (SHA-256) ใช้กับใบเบิกที่ยังไม่ถูกตีกลับ/แทนที่ได้ใบเดียวทั้งองค์กร — ไม่จำกัดเวลา/ผู้รับเงิน
 * (preship R3-004) · เรียก**ภายในทรานแซกชันที่เขียนใบเบิก ก่อน insert/update** ทั้งตอนเบิกใหม่และตอนส่งใหม่
 * ล็อก advisory ต่อ (องค์กร, hash) ⇒ คนละผู้รับเงินส่งใบเสร็จเดียวกันพร้อมกันได้ผ่านแค่ตัวแรก
 * (ล็อกนี้ต้องเป็นล็อกสุดท้ายที่ทรานแซกชันขอ — ลำดับ ผู้รับเงิน → hash เสมอ จึงไม่ deadlock)
 */
export async function assertReceiptNotReused(
  tx: ExpenseTxClient,
  input: {
    organizationId: string
    payeeId: string
    receiptFileHash: string | null
    selfExpenseId?: string
    /** เคลียร์เงินทดรองก้อนนี้อยู่ — ไม่นับ audit ของตัวเอง */
    selfAdvanceId?: string
  },
): Promise<void> {
  const hash = input.receiptFileHash
  if (hash === null || hash === '') return
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`claim_receipt:${input.organizationId}:${hash}`}))`

  const holders = await tx.expense.findMany({
    where: {
      organizationId: input.organizationId,
      receiptFileHash: hash,
      status: { notIn: [...DUPLICATE_CLAIM_IGNORED_STATUSES] },
      deletedAt: null,
      ...(input.selfExpenseId !== undefined ? { id: { not: input.selfExpenseId } } : {}),
    },
    select: { id: true, status: true, receiptFileHash: true, payeeId: true },
    orderBy: { createdAt: 'asc' },
  })
  const reused = findReceiptReuse(hash, holders, input.selfExpenseId ?? null)
  if (reused !== undefined) throw new ClaimReceiptReusedError(reused.id, reused.payeeId === input.payeeId)

  // preship R5-001 — ใบเสร็จที่ใช้เคลียร์เงินทดรองแล้ว (ตาราง `advances` ไม่มีคอลัมน์ไฟล์ — เก็บใน audit การเคลียร์ตาม `15` §13)
  // นับเป็นการใช้ใบเสร็จนั้นแล้วเช่นกัน ⇒ เบิกค่าที่พัก/เบิกมือ/เคลียร์เงินทดรองก้อนอื่นด้วยใบเดิมไม่ได้
  const settledAdvance = await tx.auditLog.findFirst({
    where: {
      organizationId: input.organizationId,
      targetType: 'advances',
      action: 'status_change',
      afterData: { path: ['receipt_file_hash'], equals: hash },
      ...(input.selfAdvanceId !== undefined ? { NOT: { targetId: input.selfAdvanceId } } : {}),
    },
    select: { targetId: true, actorId: true },
    orderBy: { createdAt: 'asc' },
  })
  if (settledAdvance !== null) {
    throw new ClaimReceiptReusedError(`advance:${settledAdvance.targetId ?? '-'}`, false)
  }
}
