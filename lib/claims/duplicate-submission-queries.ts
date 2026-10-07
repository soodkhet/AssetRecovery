import {
  ClaimDuplicateError,
  DUPLICATE_CLAIM_IGNORED_STATUSES,
  DUPLICATE_CLAIM_WINDOW_MS,
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
}
