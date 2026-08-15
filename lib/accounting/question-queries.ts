import { AccountingError } from '@/lib/accounting/errors'
import { periodKeyOf } from '@/lib/accounting/period'
import {
  assertAnswerable,
  MANAGE_ACCOUNTANT_QUESTIONS,
  questionStatusLabel,
  questionStatusOf,
  summarizeQuestions,
} from '@/lib/accounting/question'
import { ensurePeriod, findPeriodById, type AccountingMutationContext } from '@/lib/accounting/queries'
import type { QuestionAnswerInput, QuestionCreateInput, QuestionListQuery } from '@/lib/accounting/schemas'
import type { AccountantQuestionDto, AccountantQuestionListDto } from '@/lib/accounting/types'
import { emitAudit } from '@/lib/audit/audit'
import type { SessionUser } from '@/lib/auth/types'
import { Prisma } from '@/lib/generated/prisma/client'
import { dispatchNotification, usersWithCapability } from '@/lib/notifications/dispatch'
import { accountantQuestionMessage } from '@/lib/notifications/messages'
import { prisma } from '@/lib/prisma'

/**
 * ข้อซักถามจากสำนักงานบัญชี (ไฟล์ 36) — ชั้น DB (`36` §13)
 *
 * ### กติกาที่ห้ามหลุด
 * - สถานะคือ `is_resolved BOOLEAN` (`02` §9) — ไม่มี enum ใหม่ (`36` §6.1)
 * - **ตอบได้ครั้งเดียว** — ตอบซ้ำ ⇒ `ACCOUNTANT_QUESTION_ALREADY_ANSWERED` (`36` §8)
 * - ไม่ใช่รายการเงิน ⇒ **ไม่บังคับ `reason`** (`36` §12) แต่ยังลง audit ทุก mutation (Rule 03)
 * - รอบบัญชีของคำถามที่ไม่ระบุ = รอบของเดือนปัจจุบัน (เปิดให้อัตโนมัติแบบเดียวกับ exception)
 */

const TARGET = 'accountant_questions'

const QUESTION_SELECT = {
  id: true,
  periodId: true,
  questionText: true,
  answerText: true,
  isResolved: true,
  answeredAt: true,
  createdAt: true,
  period: { select: { periodLabel: true } },
  answeredByUser: { select: { fullName: true } },
  createdByUser: { select: { fullName: true } },
} satisfies Prisma.AccountantQuestionSelect

type QuestionRow = Prisma.AccountantQuestionGetPayload<{ select: typeof QUESTION_SELECT }>

function toDto(row: QuestionRow): AccountantQuestionDto {
  return {
    id: row.id,
    periodId: row.periodId,
    periodLabel: row.period.periodLabel,
    questionText: row.questionText,
    answerText: row.answerText,
    isResolved: row.isResolved,
    status: questionStatusOf(row.isResolved),
    statusLabel: questionStatusLabel(row.isResolved),
    answeredByName: row.answeredByUser?.fullName ?? null,
    answeredAt: row.answeredAt?.toISOString() ?? null,
    createdByName: row.createdByUser.fullName,
    createdAt: row.createdAt.toISOString(),
  }
}

// ── GET /api/accounting/questions ───────────────────────────────────────────

export async function listAccountantQuestions(
  user: SessionUser,
  query: QuestionListQuery,
): Promise<AccountantQuestionListDto> {
  const rows = await prisma.accountantQuestion.findMany({
    where: {
      organizationId: user.organizationId,
      ...(query.periodId === undefined ? {} : { periodId: query.periodId }),
      ...(query.status === undefined ? {} : { isResolved: query.status === 'answered' }),
    },
    // ค้างตอบขึ้นก่อนเสมอ แล้วเรียงใหม่ → เก่า
    orderBy: [{ isResolved: 'asc' }, { createdAt: 'desc' }],
    select: QUESTION_SELECT,
  })
  return { items: rows.map(toDto), summary: summarizeQuestions(rows) }
}

// ── POST /api/accounting/questions ──────────────────────────────────────────

export async function createAccountantQuestion(
  ctx: AccountingMutationContext,
  input: QuestionCreateInput,
  now: Date = new Date(),
): Promise<AccountantQuestionDto> {
  const period =
    input.periodId === undefined
      ? await ensurePeriod(ctx, periodKeyOf(now))
      : await findPeriodById(ctx.actor, input.periodId)

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.accountantQuestion.create({
      data: {
        organizationId: ctx.actor.organizationId,
        periodId: period.id,
        questionText: input.questionText,
        createdBy: ctx.actor.id,
      },
      select: QUESTION_SELECT,
    })
    await emitAudit(
      {
        organizationId: ctx.actor.organizationId,
        actorId: ctx.actor.id,
        actorRole: ctx.actor.roleName,
        action: 'create',
        targetType: TARGET,
        targetId: row.id,
        after: { period_id: period.id, period_label: period.periodLabel, question_text: row.questionText },
        ipAddress: ctx.meta.ipAddress,
        userAgent: ctx.meta.userAgent,
      },
      tx,
    )
    return row
  })

  // `90` §6.3 (mockup `notifications.html` · `36` §13) — ข้อซักถามใหม่ต้องมีคนตอบ
  void usersWithCapability(ctx.actor.organizationId, MANAGE_ACCOUNTANT_QUESTIONS).then((userIds) => {
    dispatchNotification(
      { organizationId: ctx.actor.organizationId, userIds },
      accountantQuestionMessage({ periodLabel: period.periodLabel, questionText: created.questionText }),
    )
  })

  return toDto(created)
}

// ── PATCH /api/accounting/questions/:id/answer ──────────────────────────────

/** ตอบคำถาม (`36` §13/§15) — `is_resolved` → true + บันทึกเวลาและผู้ตอบ */
export async function answerAccountantQuestion(
  ctx: AccountingMutationContext,
  questionId: string,
  input: QuestionAnswerInput,
  now: Date = new Date(),
): Promise<AccountantQuestionDto> {
  const existing = await prisma.accountantQuestion.findFirst({
    where: { id: questionId, organizationId: ctx.actor.organizationId },
    select: QUESTION_SELECT,
  })
  if (existing === null) {
    throw new AccountingError('ACCOUNTANT_QUESTION_NOT_FOUND', { detail: `question=${questionId}` })
  }
  assertAnswerable(existing.isResolved, questionId)

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.accountantQuestion.update({
      where: { id: questionId },
      data: {
        answerText: input.answerText,
        answeredBy: ctx.actor.id,
        answeredAt: now,
        isResolved: true,
      },
      select: QUESTION_SELECT,
    })
    await emitAudit(
      {
        organizationId: ctx.actor.organizationId,
        actorId: ctx.actor.id,
        actorRole: ctx.actor.roleName,
        action: 'update',
        targetType: TARGET,
        targetId: questionId,
        before: { is_resolved: false, answer_text: null },
        after: { is_resolved: true, answer_text: row.answerText, answered_at: row.answeredAt?.toISOString() },
        ipAddress: ctx.meta.ipAddress,
        userAgent: ctx.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )
    return row
  })

  return toDto(updated)
}
