import { emitAudit } from '@/lib/audit/audit'
import { APPROVE_ADVANCE, REQUEST_ADVANCE } from '@/lib/advances/advance'
import { hasCapability } from '@/lib/auth/permission'
import type { RequestMeta } from '@/lib/auth/request-meta'
import type { SessionUser } from '@/lib/auth/types'
import { nextDocumentNumber } from '@/lib/document-numbering/queries'
import type { ExpenseTxClient } from '@/lib/field/expense-queries'
import { FIELD_CAPABILITY } from '@/lib/field/permissions'
import { EXPENSE_TYPE_LABEL } from '@/lib/field/expense-ui'
import { fmtDate, toBangkokParts } from '@/lib/format/datetime'
import type { Prisma } from '@/lib/generated/prisma/client'
import type { ExpenseStatus } from '@/lib/generated/prisma/enums'
import { captureLetterheadSnapshot } from '@/lib/organization/letterhead'
import { prisma } from '@/lib/prisma'
import { SubstituteReceiptError } from '@/lib/substitute-receipts/errors'
import type {
  SubstituteReceiptCancelInput,
  SubstituteReceiptLineInput,
  SubstituteReceiptSignedInput,
} from '@/lib/substitute-receipts/schemas'
import { assertPeriodOpenAt } from '@/lib/accounting/period-guard'
import {
  assertWithinSubstituteReceiptLimits,
  canCancelSubstituteReceipt,
  canUploadSignedSubstituteReceipt,
  canViewSubstituteReceipt,
  DEFAULT_SUBSTITUTE_RECEIPT_MAX_PER_DOC_SATANG,
  DEFAULT_SUBSTITUTE_RECEIPT_MAX_PER_MONTH_SATANG,
  requireSubstituteReceiptCancelReason,
  substituteReceiptCancelProblem,
  substituteReceiptCancelProblemMessage,
  substituteReceiptMonthRange,
  substituteReceiptReissueTotalProblem,
  substituteReceiptTotalSatang,
  type SubstituteReceiptLinkState,
  type SubstituteReceiptOwnerRef,
  type SubstituteReceiptViewer,
} from '@/lib/substitute-receipts/substitute-receipt'
import type { SubstituteReceiptDocSource } from '@/lib/substitute-receipts/substitute-receipt-doc'
import type { SubstituteReceiptDetailDto, SubstituteReceiptRefDto } from '@/lib/substitute-receipts/types'
import { substituteReceiptFileRule } from '@/lib/uploads/rules'
import { verifyUploadedFile } from '@/lib/uploads/verify'

/**
 * ใบรับรองแทนใบเสร็จรับเงิน — ชั้น DB (มติ PO 06/10/2569 U103)
 *
 * ### กติกาที่ห้ามหลุด
 * - **ออกใบในทรานแซกชันเดียวกับใบเบิก/การเคลียร์ยอด** (`issueSubstituteReceipt()` รับ `tx` ของผู้เรียก) —
 *   เลข CRT จาก `nextDocumentNumber()` ⇒ rollback แล้วไม่มีเลขขาด
 * - **เพดานต่อคนต่อเดือนกันชนกัน**: ล็อกแถว `payee_profiles` (`FOR UPDATE`) ก่อนรวมยอดของเดือน ⇒ คำขอพร้อมกัน
 *   ของผู้จ่ายคนเดียวกันต่อคิว ไม่ทะลุเพดานพร้อมกัน
 * - ใบที่ผูกใบเบิกซึ่งถูก `rejected`/`superseded`/ลบแล้ว **ไม่นับ**ในยอดของเดือน (รายจ่ายนั้นไม่ได้เบิกจริง)
 * - ฉบับเซ็นอัปโหลดผ่าน server (`verifyUploadedFile()` — prefix/magic bytes/ขนาด + SHA-256) ได้ครั้งเดียว
 *   ใบที่ผูกใบเบิก ⇒ ไฟล์ฉบับเซ็นเป็น "ใบเสร็จ" ของใบเบิกนั้น (`expenses.receipt_file_url`) ด้วย
 * - scope: เจ้าของ (ผู้จ่ายเงิน) · การเงิน/ผู้อนุมัติที่เห็นทั้งองค์กร · ผู้จัดการทีม (ใบเบิกของทีมที่ดูแล) — นอกนั้น 404
 */

const TARGET = 'substitute_receipts'

/** capability ที่เข้าถึง endpoint ของใบรับรองแทนใบเสร็จได้ (scope ระดับแถวตรวจต่อที่ชั้นข้อมูล) */
export const SUBSTITUTE_RECEIPT_CAPABILITIES = [
  FIELD_CAPABILITY,
  REQUEST_ADVANCE,
  APPROVE_ADVANCE,
  'approve_expense_manager',
  'approve_expense_finance',
  'approve_expense_executive',
] as const

/** ใบเบิกในสถานะเหล่านี้ไม่ได้เบิกจริงแล้ว ⇒ ใบรับรองของมันไม่นับในเพดานต่อเดือน */
const NOT_COUNTED_EXPENSE_STATUSES: readonly ExpenseStatus[] = ['rejected', 'superseded']

export interface SubstituteReceiptMutationContext {
  actor: SessionUser
  meta: RequestMeta
}

// ── DTO ที่ฝังในรายการเบิก/เงินทดรอง ──────────────────────────────────────────

export const substituteReceiptRefSelect = {
  id: true,
  receiptNumber: true,
  status: true,
  totalSatang: true,
  issueDate: true,
  signedAt: true,
  cancelledAt: true,
  cancelReason: true,
  createdAt: true,
  deletedAt: true,
  replacesReceipt: { select: { receiptNumber: true } },
} as const

type RefRow = Prisma.SubstituteReceiptGetPayload<{ select: typeof substituteReceiptRefSelect }>

/**
 * ใบที่แสดงคู่กับใบเบิก/เงินทดรอง — ใบที่ยังมีผล (partial unique: ไม่เกิน 1 ใบ) ก่อน · ไม่มีแล้วจึงเป็นใบที่ยกเลิก
 * **ล่าสุด** (มติ PO U107 — ให้เห็นว่ายกเลิกแล้วและออกใบใหม่แทนได้)
 */
export function substituteReceiptRefOf(rows: readonly RefRow[]): SubstituteReceiptRefDto | null {
  const live = rows.filter((entry) => entry.deletedAt === null)
  const row =
    live.find((entry) => entry.status !== 'cancelled') ??
    [...live].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
  if (row === undefined) return null
  // มติ PO U117 — ใบที่ยกเลิกแล้วยังแสดงบนการ์ด (ขีดฆ่า) คู่กับใบที่ใช้อยู่
  const cancelledHistory = live
    .filter((entry) => entry.status === 'cancelled' && entry.id !== row.id)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((entry) => ({
      id: entry.id,
      receiptNumber: entry.receiptNumber,
      totalSatang: entry.totalSatang,
      cancelledAt: entry.cancelledAt?.toISOString() ?? null,
      cancelReason: entry.cancelReason,
    }))
  return {
    id: row.id,
    receiptNumber: row.receiptNumber,
    status: row.status,
    totalSatang: row.totalSatang,
    issueDate: row.issueDate.toISOString().slice(0, 10),
    signedAt: row.signedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    cancelReason: row.cancelReason,
    replacesReceiptNumber: row.replacesReceipt?.receiptNumber ?? null,
    cancelledHistory,
  }
}

/** select ย่อยสำหรับ include ในแถวใบเบิก/เงินทดรอง (รวมใบที่ยกเลิก — `substituteReceiptRefOf()` เลือกเอง) */
export const substituteReceiptsRelationSelect = {
  select: substituteReceiptRefSelect,
  where: { deletedAt: null },
  orderBy: { createdAt: 'desc' },
} as const

// ── ออกใบ ──────────────────────────────────────────────────────────────────

export type SubstituteReceiptLink = { kind: 'expense'; expenseId: string } | { kind: 'advance'; advanceId: string }

export interface IssueSubstituteReceiptInput {
  organizationId: string
  payeeId: string
  link: SubstituteReceiptLink
  lines: readonly SubstituteReceiptLineInput[]
  /** เวลาออกใบ — วันที่ออก = วันไทยของเวลานี้ (ฐานของเพดานต่อเดือน + ปีของเลข CRT) */
  at: Date
  /** มติ PO U117 — ใบที่ยกเลิกซึ่งใบนี้ออกแทน (ผู้เรียกตรวจว่าเป็นรายการเดียวกันแล้ว) */
  replacesReceiptId?: string
}

export interface IssuedSubstituteReceipt {
  id: string
  receiptNumber: string
  totalSatang: number
}

/** วันไทยของ instant → เที่ยงคืน UTC สำหรับคอลัมน์ `DATE` (Rule 01) */
function bangkokDateOnly(at: Date): Date {
  const parts = toBangkokParts(at)
  if (parts === null) throw new RangeError('เวลาออกใบไม่ถูกต้อง')
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
}

/** ยอดใบที่ออกแล้วของผู้จ่ายในเดือนของ `issueDate` (ไม่รวมใบเบิกที่ไม่ได้เบิกจริงแล้ว) */
async function monthUsedSatang(
  tx: ExpenseTxClient,
  organizationId: string,
  payeeId: string,
  issueDate: Date,
): Promise<number> {
  const { start, end } = substituteReceiptMonthRange(issueDate)
  const result = await tx.substituteReceipt.aggregate({
    where: {
      organizationId,
      payeeId,
      deletedAt: null,
      // มติ PO U107 — ใบที่ยกเลิกแล้วไม่นับเพดานต่อเดือน
      status: { not: 'cancelled' },
      issueDate: { gte: start, lt: end },
      OR: [
        { advanceId: { not: null } },
        { expense: { is: { deletedAt: null, status: { notIn: [...NOT_COUNTED_EXPENSE_STATUSES] } } } },
      ],
    },
    _sum: { totalSatang: true },
  })
  return result._sum.totalSatang ?? 0
}

/** เพดานขององค์กร — ยังไม่เคยตั้งค่า = ค่าเริ่มต้น (฿500 / ฿3,000) */
export async function substituteReceiptLimitsOf(
  client: Pick<ExpenseTxClient, 'financePolicySettings'>,
  organizationId: string,
): Promise<{ maxPerDocSatang: number; maxPerMonthSatang: number }> {
  const policy = await client.financePolicySettings.findUnique({
    where: { organizationId },
    select: { substituteReceiptMaxPerDocSatang: true, substituteReceiptMaxPerMonthSatang: true },
  })
  return {
    maxPerDocSatang: policy?.substituteReceiptMaxPerDocSatang ?? DEFAULT_SUBSTITUTE_RECEIPT_MAX_PER_DOC_SATANG,
    maxPerMonthSatang: policy?.substituteReceiptMaxPerMonthSatang ?? DEFAULT_SUBSTITUTE_RECEIPT_MAX_PER_MONTH_SATANG,
  }
}

/**
 * ออกใบรับรองแทนใบเสร็จ + บรรทัด + audit **ภายในทรานแซกชันของผู้เรียก**
 * ผู้เรียกต้องตรวจ scope ของ payee/ใบเบิก/เงินทดรองมาก่อน · เกินเพดาน = `SUBSTITUTE_RECEIPT_EXCEEDS_LIMIT`
 */
export async function issueSubstituteReceipt(
  tx: ExpenseTxClient,
  context: SubstituteReceiptMutationContext,
  input: IssueSubstituteReceiptInput,
): Promise<IssuedSubstituteReceipt> {
  const totalSatang = substituteReceiptTotalSatang(input.lines)
  const issueDate = bangkokDateOnly(input.at)

  // ล็อกผู้จ่ายก่อนรวมยอดของเดือน — คำขอพร้อมกันของคนเดียวกันต่อคิว (เพดานต่อเดือนไม่ทะลุ)
  await tx.$queryRaw`SELECT id FROM payee_profiles WHERE id = ${input.payeeId}::uuid FOR UPDATE`
  const limits = await substituteReceiptLimitsOf(tx, input.organizationId)
  assertWithinSubstituteReceiptLimits({
    totalSatang,
    monthUsedSatang: await monthUsedSatang(tx, input.organizationId, input.payeeId, issueDate),
    ...limits,
  })

  const issued = await nextDocumentNumber(tx, input.organizationId, 'substitute_receipt', input.at)
  const actorId = context.actor.id
  const row = await tx.substituteReceipt.create({
    data: {
      organizationId: input.organizationId,
      receiptNumber: issued.number,
      payeeId: input.payeeId,
      expenseId: input.link.kind === 'expense' ? input.link.expenseId : null,
      advanceId: input.link.kind === 'advance' ? input.link.advanceId : null,
      issueDate,
      totalSatang,
      replacesReceiptId: input.replacesReceiptId ?? null,
      createdBy: actorId,
      // มติ PO U130 — หัวกระดาษใบรับรองแทนใบเสร็จ ณ ตอนออก (พิมพ์ซ้ำ/Export Pack หน้าตาเดิม)
      letterheadSnapshot: await captureLetterheadSnapshot(tx, input.organizationId),
      lines: {
        create: input.lines.map((line, index) => ({
          organizationId: input.organizationId,
          lineNo: index + 1,
          lineDate: line.lineDate,
          description: line.description,
          amountSatang: line.amountSatang,
          note: line.note,
          createdBy: actorId,
        })),
      },
    },
    select: { id: true, receiptNumber: true, totalSatang: true },
  })

  await emitAudit(
    {
      organizationId: input.organizationId,
      actorId,
      actorRole: context.actor.roleName,
      action: 'create',
      targetType: TARGET,
      targetId: row.id,
      after: {
        receipt_number: row.receiptNumber,
        payee_id: input.payeeId,
        expense_id: input.link.kind === 'expense' ? input.link.expenseId : null,
        advance_id: input.link.kind === 'advance' ? input.link.advanceId : null,
        issue_date: issueDate.toISOString().slice(0, 10),
        total_satang: totalSatang,
        replaces_receipt_id: input.replacesReceiptId ?? null,
        max_per_doc_satang: limits.maxPerDocSatang,
        max_per_month_satang: limits.maxPerMonthSatang,
        lines: input.lines.map((line, index) => ({
          line_no: index + 1,
          line_date: line.lineDate.toISOString().slice(0, 10),
          description: line.description,
          amount_satang: line.amountSatang,
          note: line.note,
        })),
        status: 'pending_signature',
        events: ['substitute_receipt.issued'],
      },
      ipAddress: context.meta.ipAddress,
      userAgent: context.meta.userAgent,
      diffOnly: false,
    },
    tx,
  )

  return row
}

// ── scope ──────────────────────────────────────────────────────────────────

export function substituteReceiptViewerOf(user: SessionUser): SubstituteReceiptViewer {
  return {
    userId: user.id,
    isSuperadmin: user.isSuperadmin,
    canSeeAllAdvances: hasCapability(user, 'view', APPROVE_ADVANCE),
    canSeeAllExpenses:
      hasCapability(user, 'view', 'approve_expense_finance') || hasCapability(user, 'view', 'approve_expense_executive'),
    canManageAllAdvances: hasCapability(user, 'manage', APPROVE_ADVANCE),
    canManageAllExpenses:
      hasCapability(user, 'manage', 'approve_expense_finance') ||
      hasCapability(user, 'manage', 'approve_expense_executive'),
    // ผู้อนุมัติขั้นทีมเห็นรายการเบิกของทีมที่ดูแล (กติกาเดียวกับคิวอนุมัติ)
    managedTeamIds: hasCapability(user, 'view', 'approve_expense_manager') ? [...user.scope.teamIds] : [],
  }
}

const docSourceSelect = {
  id: true,
  organizationId: true,
  // มติ PO U130 — หัวกระดาษ ณ ตอนออกใบ
  letterheadSnapshot: true,
  receiptNumber: true,
  status: true,
  issueDate: true,
  totalSatang: true,
  signedFilePath: true,
  signedAt: true,
  cancelledAt: true,
  cancelReason: true,
  expenseId: true,
  advanceId: true,
  createdAt: true,
  replacesReceipt: { select: { receiptNumber: true } },
  lines: {
    select: { lineNo: true, lineDate: true, description: true, amountSatang: true, note: true },
    orderBy: { lineNo: 'asc' },
  },
  payee: {
    select: {
      id: true,
      userId: true,
      nationalId: true,
      nameTitle: true,
      addressDetail: true,
      addressSubdistrict: true,
      addressDistrict: true,
      addressProvince: true,
      addressPostalCode: true,
      user: { select: { fullName: true, phone: true, teamId: true, team: { select: { name: true } } } },
    },
  },
  advance: { select: { advanceNumber: true, usedSatang: true } },
  expense: {
    select: {
      id: true,
      expenseType: true,
      expenseDate: true,
      status: true,
      grossSatang: true,
      // รอบจ่ายที่จ่ายสำเร็จแล้ว (เงินออกจริง) — มีได้ไม่เกิน 1 (รอบที่ยกเลิก/ยังไม่จ่ายไม่นับ)
      payoutItems: { where: { payoutBatch: { is: { status: 'completed' } } }, select: { id: true }, take: 1 },
    },
  },
} as const

export type SubstituteReceiptSourceRow = Prisma.SubstituteReceiptGetPayload<{ select: typeof docSourceSelect }>

function ownerOf(row: SubstituteReceiptSourceRow): SubstituteReceiptOwnerRef {
  return {
    payeeUserId: row.payee.userId,
    payeeTeamId: row.payee.user.teamId,
    link: row.advanceId !== null ? 'advance' : 'expense',
  }
}

/** สถานะของรายการที่ใบผูกอยู่ (input ของกติกา pure การยกเลิก/ออกใหม่) */
function linkStateOf(row: SubstituteReceiptSourceRow): SubstituteReceiptLinkState {
  if (row.expense !== null) {
    return {
      kind: 'expense',
      expenseStatus: row.expense.status,
      expenseType: row.expense.expenseType,
      expenseGrossSatang: row.expense.grossSatang,
      inCompletedPayout: row.expense.payoutItems.length > 0,
    }
  }
  return { kind: 'advance', usedSatang: row.advance?.usedSatang ?? null }
}

async function findForViewer(
  user: SessionUser,
  id: string,
  can: (viewer: SubstituteReceiptViewer, owner: SubstituteReceiptOwnerRef) => boolean,
): Promise<SubstituteReceiptSourceRow> {
  const row = await prisma.substituteReceipt.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    select: docSourceSelect,
  })
  if (row === null || !can(substituteReceiptViewerOf(user), ownerOf(row))) {
    throw new SubstituteReceiptError('SUBSTITUTE_RECEIPT_NOT_FOUND', { detail: `substitute_receipt=${id} user=${user.id}` })
  }
  return row
}

/** แหล่งข้อมูลของ PDF/ไฟล์ฉบับเซ็น — นอก scope = `SUBSTITUTE_RECEIPT_NOT_FOUND` (404 ไม่ leak) */
export async function getSubstituteReceiptSource(user: SessionUser, id: string): Promise<SubstituteReceiptSourceRow> {
  return findForViewer(user, id, canViewSubstituteReceipt)
}

/**
 * `GET /api/substitute-receipts/:id` (มติ PO U117 ข้อ 1) — รายละเอียด + บรรทัดของใบ ให้ฟอร์ม "ออกใบใหม่แทน"
 * ดึงรายการ/ยอดของใบที่ยกเลิกมาตั้งต้น · scope เดียวกับการดู PDF (นอก scope 404)
 */
export async function getSubstituteReceiptDetail(user: SessionUser, id: string): Promise<SubstituteReceiptDetailDto> {
  const row = await findForViewer(user, id, canViewSubstituteReceipt)
  return {
    id: row.id,
    receiptNumber: row.receiptNumber,
    status: row.status,
    totalSatang: row.totalSatang,
    lines: row.lines.map((line) => ({
      lineDate: line.lineDate.toISOString().slice(0, 10),
      description: line.description,
      amountSatang: line.amountSatang,
      note: line.note,
    })),
  }
}

/** ยามของการออกโทเคนอัปโหลดฉบับเซ็น (`/api/storage/upload-url`) — สิทธิ์เดียวกับ endpoint ผูกไฟล์ */
export async function assertCanUploadSignedSubstituteReceipt(user: SessionUser, id: string): Promise<void> {
  await findForViewer(user, id, canUploadSignedSubstituteReceipt)
}

/** ยามของการเปิดไฟล์ฉบับเซ็น (signed download) */
export async function assertSubstituteReceiptInScope(user: SessionUser, id: string): Promise<void> {
  await findForViewer(user, id, canViewSubstituteReceipt)
}

// ── อัปโหลดฉบับเซ็น ──────────────────────────────────────────────────────────

/**
 * `POST /api/substitute-receipts/:id/signed` — ผูกไฟล์ฉบับเซ็นแล้ว (ครั้งเดียว) · ใบที่ผูกใบเบิก ⇒ ไฟล์นี้เป็น
 * ใบเสร็จของใบเบิกด้วย (ช่องใบเสร็จเดิมบังคับ → ยอมรับใบรับรองแทนใบเสร็จได้) · ตรวจไฟล์ก่อนเข้าทรานแซกชัน
 */
export async function attachSignedSubstituteReceipt(
  context: SubstituteReceiptMutationContext,
  id: string,
  input: SubstituteReceiptSignedInput,
): Promise<SubstituteReceiptRefDto> {
  const user = context.actor
  const current = await findForViewer(user, id, canUploadSignedSubstituteReceipt)
  if (current.status === 'signed') {
    throw new SubstituteReceiptError('SUBSTITUTE_RECEIPT_ALREADY_SIGNED', { detail: `substitute_receipt=${id}` })
  }
  if (current.status === 'cancelled') {
    // มติ PO U107 — ใบที่ยกเลิกแล้ว (terminal) แนบฉบับเซ็นไม่ได้ ต้องออกใบใหม่แทน
    throw new SubstituteReceiptError('SUBSTITUTE_RECEIPT_ALREADY_SIGNED', {
      message: `ใบรับรองแทนใบเสร็จ ${current.receiptNumber} ถูกยกเลิกแล้ว — อัปโหลดฉบับเซ็นไม่ได้ ให้ออกใบใหม่แทน`,
      detail: `substitute_receipt=${id} cancelled`,
    })
  }
  const verified = await verifyUploadedFile(input.signedFilePath, substituteReceiptFileRule(id))
  const at = new Date()

  const updated = await prisma.$transaction(async (tx) => {
    // ผูกสถานะเดิม — สองคำขอพร้อมกันได้ผลแค่คำขอเดียว
    const claimed = await tx.substituteReceipt.updateMany({
      where: { id, organizationId: user.organizationId, status: 'pending_signature', deletedAt: null },
      data: {
        status: 'signed',
        signedFilePath: input.signedFilePath,
        signedFileSha256: verified.sha256,
        signedAt: at,
        signedBy: user.id,
        updatedBy: user.id,
      },
    })
    if (claimed.count !== 1) {
      throw new SubstituteReceiptError('SUBSTITUTE_RECEIPT_ALREADY_SIGNED', {
        detail: `substitute_receipt=${id} changed concurrently`,
      })
    }

    await emitAudit(
      {
        organizationId: user.organizationId,
        actorId: user.id,
        actorRole: user.roleName,
        action: 'status_change',
        targetType: TARGET,
        targetId: id,
        before: { status: 'pending_signature', signed_file_path: null },
        after: {
          status: 'signed',
          signed_file_path: input.signedFilePath,
          signed_file_sha256: verified.sha256,
          events: ['substitute_receipt.signed'],
        },
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )

    if (current.expenseId !== null) {
      const before = await tx.expense.findUniqueOrThrow({
        where: { id: current.expenseId },
        select: { receiptFileUrl: true, receiptFileHash: true },
      })
      await tx.expense.update({
        where: { id: current.expenseId },
        data: {
          receiptFileUrl: input.signedFilePath,
          receiptFileHash: verified.sha256,
          receiptFileUnverified: false,
          updatedBy: user.id,
        },
      })
      await emitAudit(
        {
          organizationId: user.organizationId,
          actorId: user.id,
          actorRole: user.roleName,
          action: 'update',
          targetType: 'expenses',
          targetId: current.expenseId,
          before: { receipt_file_url: before.receiptFileUrl, receipt_file_hash: before.receiptFileHash },
          after: {
            receipt_file_url: input.signedFilePath,
            receipt_file_hash: verified.sha256,
            substitute_receipt_number: current.receiptNumber,
          },
          reason: `แนบใบรับรองแทนใบเสร็จ ${current.receiptNumber} ฉบับเซ็นแล้วเป็นหลักฐานรายจ่าย`,
          ipAddress: context.meta.ipAddress,
          userAgent: context.meta.userAgent,
          diffOnly: false,
        },
        tx,
      )
    }

    return tx.substituteReceipt.findUniqueOrThrow({ where: { id }, select: substituteReceiptRefSelect })
  })

  const ref = substituteReceiptRefOf([updated])
  if (ref === null) throw new SubstituteReceiptError('SUBSTITUTE_RECEIPT_NOT_FOUND', { detail: `substitute_receipt=${id}` })
  return ref
}

// ── ยามของการอนุมัติใบเบิก ────────────────────────────────────────────────────

/**
 * ใบเบิกที่ใช้ใบรับรองแทนใบเสร็จต้องมีฉบับเซ็นก่อนอนุมัติ — ไม่ผ่าน = `SUBSTITUTE_RECEIPT_NOT_SIGNED`
 * (ผู้เบิกแนบใบเสร็จจริงตอนส่งใหม่แทนแล้ว — `receipt_file_url` มีค่า — ถือว่ามีหลักฐานแล้ว ไม่บล็อก)
 */
export async function assertExpenseSubstituteReceiptSigned(
  client: Pick<ExpenseTxClient, 'substituteReceipt'>,
  expenseId: string,
): Promise<void> {
  const pending = await client.substituteReceipt.findFirst({
    where: { expenseId, deletedAt: null, status: 'pending_signature', expense: { is: { receiptFileUrl: null } } },
    select: { receiptNumber: true },
  })
  if (pending !== null) {
    throw new SubstituteReceiptError('SUBSTITUTE_RECEIPT_NOT_SIGNED', {
      message: `รายการนี้ใช้ใบรับรองแทนใบเสร็จ ${pending.receiptNumber} — ผู้เบิกต้องอัปโหลดฉบับที่เซ็นแล้วก่อนจึงอนุมัติได้`,
      detail: `expense=${expenseId}`,
    })
  }
  // มติ PO U107 — ใบถูกยกเลิกและยังไม่มีใบใหม่/ใบเสร็จจริงแทน ⇒ รายการไม่มีหลักฐาน อนุมัติไม่ได้
  const cancelledOnly = await client.substituteReceipt.findFirst({
    where: {
      expenseId,
      deletedAt: null,
      status: 'cancelled',
      expense: {
        is: { receiptFileUrl: null, substituteReceipts: { none: { deletedAt: null, status: { not: 'cancelled' } } } },
      },
    },
    orderBy: { createdAt: 'desc' },
    select: { receiptNumber: true },
  })
  if (cancelledOnly !== null) {
    throw new SubstituteReceiptError('SUBSTITUTE_RECEIPT_NOT_SIGNED', {
      message: `ใบรับรองแทนใบเสร็จ ${cancelledOnly.receiptNumber} ของรายการนี้ถูกยกเลิกแล้ว — ต้องออกใบใหม่แทน (และอัปโหลดฉบับเซ็น) หรือแนบใบเสร็จจริงก่อนจึงอนุมัติได้`,
      detail: `expense=${expenseId} substitute_receipt_cancelled`,
    })
  }
}

// ── แหล่งข้อมูลของ PDF ─────────────────────────────────────────────────────────

/** แถว → แหล่งข้อมูลของ builder PDF (pure) */
export function toSubstituteReceiptDocSource(row: SubstituteReceiptSourceRow): SubstituteReceiptDocSource {
  const reference =
    row.advance !== null
      ? { label: 'อ้างอิงเงินทดรอง', value: row.advance.advanceNumber }
      : {
          label: 'อ้างอิงใบเบิก',
          value:
            row.expense === null
              ? '-'
              : `${EXPENSE_TYPE_LABEL[row.expense.expenseType]} วันที่ ${fmtDate(row.expense.expenseDate)}`,
        }
  return {
    receiptNumber: row.receiptNumber,
    issueDate: row.issueDate,
    totalSatang: row.totalSatang,
    lines: row.lines.map((line) => ({
      lineDate: line.lineDate,
      description: line.description,
      amountSatang: line.amountSatang,
      note: line.note,
    })),
    payee: {
      fullName: row.payee.user.fullName,
      nameTitle: row.payee.nameTitle,
      phone: row.payee.user.phone,
      nationalId: row.payee.nationalId,
      addressDetail: row.payee.addressDetail,
      addressSubdistrict: row.payee.addressSubdistrict,
      addressDistrict: row.payee.addressDistrict,
      addressProvince: row.payee.addressProvince,
      addressPostalCode: row.payee.addressPostalCode,
    },
    teamName: row.payee.user.team?.name ?? null,
    reference,
    replacesReceiptNumber: row.replacesReceipt?.receiptNumber ?? null,
    cancellation:
      row.status === 'cancelled' && row.cancelledAt !== null
        ? { cancelledAt: row.cancelledAt, reason: row.cancelReason ?? '' }
        : null,
  }
}

// ── ยกเลิก / ออกใบใหม่แทน (มติ PO 06/10/2569 U107 · `23` §6.17) ─────────────────────

/**
 * `POST /api/substitute-receipts/:id/cancel` — ยกเลิกใบ (terminal · ครั้งเดียว) พร้อมเหตุผลบังคับ + audit
 *
 * - สิทธิ์: เจ้าของ (ใบเบิกที่ยังไม่อนุมัติ) · การเงินที่เห็นทั้งองค์กรของสายนั้น · Superadmin — นอกนั้น 404 (ไม่ leak)
 * - ใบเบิกที่อนุมัติจ่ายแล้ว/อยู่ในรอบจ่ายที่จ่ายแล้ว ⇒ `SUBSTITUTE_RECEIPT_NOT_CANCELLABLE` · งวดของวันที่ออกใบปิดแล้ว ⇒ Period Lock
 * - ใบเดิมไม่ถูกลบ (DB trigger กัน) · ไม่นับเพดานต่อเดือนอีก · PDF พิมพ์ป้าย "ยกเลิก"
 * - ใบเบิกที่ใช้ไฟล์ฉบับเซ็นของใบนี้เป็นใบเสร็จ ⇒ ล้างช่องใบเสร็จ (ไม่มีหลักฐานแล้ว — ยามอนุมัติปัดจนกว่าจะออกใบใหม่/แนบใบเสร็จ)
 */
export async function cancelSubstituteReceipt(
  context: SubstituteReceiptMutationContext,
  id: string,
  input: SubstituteReceiptCancelInput,
): Promise<SubstituteReceiptRefDto> {
  const user = context.actor
  const current = await findForViewer(user, id, canCancelSubstituteReceipt)
  const reason = requireSubstituteReceiptCancelReason(input.reason)
  const problem = substituteReceiptCancelProblem(current.status, linkStateOf(current))
  if (problem !== null) {
    throw new SubstituteReceiptError('SUBSTITUTE_RECEIPT_NOT_CANCELLABLE', {
      message: substituteReceiptCancelProblemMessage(problem, current.receiptNumber),
      detail: `substitute_receipt=${id} problem=${problem}`,
      context: { problem },
    })
  }
  await assertPeriodOpenAt({ organizationId: user.organizationId, at: current.issueDate, targetType: TARGET, targetId: id })
  const at = new Date()

  const updated = await prisma.$transaction(async (tx) => {
    // ผูกสถานะเดิม — ยกเลิกพร้อมกัน/แข่งกับการอัปโหลดฉบับเซ็นได้ผลแค่คำขอเดียว
    const claimed = await tx.substituteReceipt.updateMany({
      where: { id, organizationId: user.organizationId, status: current.status, deletedAt: null },
      data: { status: 'cancelled', cancelledAt: at, cancelledBy: user.id, cancelReason: reason, updatedBy: user.id },
    })
    if (claimed.count !== 1) {
      throw new SubstituteReceiptError('SUBSTITUTE_RECEIPT_NOT_CANCELLABLE', {
        message: substituteReceiptCancelProblemMessage('already_cancelled', current.receiptNumber),
        detail: `substitute_receipt=${id} changed concurrently`,
      })
    }
    if (current.expenseId !== null) {
      // ล็อกใบเบิกแล้วตรวจซ้ำ — กันแข่งกับการอนุมัติที่เกิดหลังอ่านครั้งแรก
      await tx.$queryRaw`SELECT id FROM expenses WHERE id = ${current.expenseId}::uuid FOR UPDATE`
      const expense = await tx.expense.findUniqueOrThrow({
        where: { id: current.expenseId },
        select: { status: true, receiptFileUrl: true, receiptFileHash: true },
      })
      if (expense.status === 'approved') {
        throw new SubstituteReceiptError('SUBSTITUTE_RECEIPT_NOT_CANCELLABLE', {
          message: substituteReceiptCancelProblemMessage('linked_paid', current.receiptNumber),
          detail: `substitute_receipt=${id} expense approved concurrently`,
        })
      }
      if (current.signedFilePath !== null && expense.receiptFileUrl === current.signedFilePath) {
        await tx.expense.update({
          where: { id: current.expenseId },
          data: { receiptFileUrl: null, receiptFileHash: null, receiptFileUnverified: false, updatedBy: user.id },
        })
        await emitAudit(
          {
            organizationId: user.organizationId,
            actorId: user.id,
            actorRole: user.roleName,
            action: 'update',
            targetType: 'expenses',
            targetId: current.expenseId,
            before: { receipt_file_url: expense.receiptFileUrl, receipt_file_hash: expense.receiptFileHash },
            after: { receipt_file_url: null, receipt_file_hash: null, substitute_receipt_number: current.receiptNumber },
            reason: `ยกเลิกใบรับรองแทนใบเสร็จ ${current.receiptNumber} — ${reason}`,
            ipAddress: context.meta.ipAddress,
            userAgent: context.meta.userAgent,
            diffOnly: false,
          },
          tx,
        )
      }
    }

    await emitAudit(
      {
        organizationId: user.organizationId,
        actorId: user.id,
        actorRole: user.roleName,
        action: 'status_change',
        targetType: TARGET,
        targetId: id,
        before: { status: current.status },
        after: {
          status: 'cancelled',
          receipt_number: current.receiptNumber,
          cancelled_at: at.toISOString(),
          expense_id: current.expenseId,
          advance_id: current.advanceId,
          total_satang: current.totalSatang,
          events: ['substitute_receipt.cancelled'],
        },
        reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )

    return tx.substituteReceipt.findUniqueOrThrow({ where: { id }, select: substituteReceiptRefSelect })
  })

  const ref = substituteReceiptRefOf([updated])
  if (ref === null) throw new SubstituteReceiptError('SUBSTITUTE_RECEIPT_NOT_FOUND', { detail: `substitute_receipt=${id}` })
  return ref
}

/**
 * `POST /api/substitute-receipts/:id/reissue` — ออกใบใหม่ (เลข CRT ใหม่) แทนใบที่ยกเลิก ผูกใบเบิก/เงินทดรองเดิม
 * สิทธิ์เดียวกับการยกเลิก · ใบเดิมต้อง `cancelled` · รายการนั้นต้องยังไม่มีใบที่ใช้งานอยู่ (partial unique กันชั้นสุดท้าย)
 * · ใบเบิกต้องยังไม่อนุมัติ · ยอดรวมตามกติกาตอนออกครั้งแรก · เพดานต่อใบ/ต่อเดือนตรวจใหม่ (ใบที่ยกเลิกไม่นับแล้ว)
 */
export async function reissueSubstituteReceipt(
  context: SubstituteReceiptMutationContext,
  id: string,
  lines: readonly SubstituteReceiptLineInput[],
): Promise<SubstituteReceiptRefDto> {
  const user = context.actor
  const current = await findForViewer(user, id, canCancelSubstituteReceipt)
  const notAllowed = (message: string, detail: string): SubstituteReceiptError =>
    new SubstituteReceiptError('SUBSTITUTE_RECEIPT_REISSUE_NOT_ALLOWED', {
      message,
      detail: `substitute_receipt=${id} ${detail}`,
    })
  if (current.status !== 'cancelled') {
    throw notAllowed(`ใบ ${current.receiptNumber} ยังไม่ถูกยกเลิก — ยกเลิกใบเดิมก่อนจึงออกใบใหม่แทนได้`, 'not_cancelled')
  }
  const link = linkStateOf(current)
  if (link.kind === 'expense' && (link.expenseStatus === 'approved' || link.inCompletedPayout)) {
    throw notAllowed('รายการเบิกนี้อนุมัติจ่ายแล้ว — ออกใบรับรองแทนใบเสร็จใหม่ไม่ได้', 'linked_paid')
  }
  const totalProblem = substituteReceiptReissueTotalProblem(link, substituteReceiptTotalSatang(lines))
  if (totalProblem !== null) throw notAllowed(totalProblem, 'total')
  const linkWhere = current.expenseId !== null ? { expenseId: current.expenseId } : { advanceId: current.advanceId }
  const active = await prisma.substituteReceipt.findFirst({
    where: { organizationId: user.organizationId, deletedAt: null, status: { not: 'cancelled' }, ...linkWhere },
    select: { receiptNumber: true },
  })
  if (active !== null) {
    throw notAllowed(`รายการนี้มีใบรับรองแทนใบเสร็จ ${active.receiptNumber} ที่ใช้งานอยู่แล้ว`, 'active_exists')
  }
  // U117 — 1 ใบที่ยกเลิกถูกแทนได้ครั้งเดียว (partial unique `uniq_substitute_receipts_replaces` กันชั้นสุดท้าย)
  const replacement = await prisma.substituteReceipt.findFirst({
    where: { organizationId: user.organizationId, replacesReceiptId: current.id },
    select: { receiptNumber: true },
  })
  if (replacement !== null) {
    throw notAllowed(`ใบ ${current.receiptNumber} ออกใบใหม่แทนไปแล้ว (${replacement.receiptNumber})`, 'already_replaced')
  }
  const at = new Date()
  await assertPeriodOpenAt({ organizationId: user.organizationId, at, targetType: TARGET, targetId: id })
  const newLink: SubstituteReceiptLink =
    current.expenseId !== null
      ? { kind: 'expense', expenseId: current.expenseId }
      : { kind: 'advance', advanceId: current.advanceId ?? '' }

  const issued = await prisma.$transaction(async (tx) => {
    const created = await issueSubstituteReceipt(tx as ExpenseTxClient, context, {
      organizationId: user.organizationId,
      payeeId: current.payee.id,
      link: newLink,
      lines,
      at,
      replacesReceiptId: current.id,
    })
    await emitAudit(
      {
        organizationId: user.organizationId,
        actorId: user.id,
        actorRole: user.roleName,
        action: 'update',
        targetType: TARGET,
        targetId: created.id,
        after: {
          receipt_number: created.receiptNumber,
          replaces_receipt_number: current.receiptNumber,
          replaces_substitute_receipt_id: current.id,
          events: ['substitute_receipt.reissued'],
        },
        reason: `ออกใบรับรองแทนใบเสร็จ ${created.receiptNumber} แทนใบ ${current.receiptNumber} ที่ยกเลิก`,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx as ExpenseTxClient,
    )
    // U117 — คืนทุกใบของรายการเดียวกัน ⇒ การ์ดเห็นใบใหม่คู่กับใบที่ยกเลิก
    return tx.substituteReceipt.findMany({
      where: { organizationId: user.organizationId, deletedAt: null, ...linkWhere },
      select: substituteReceiptRefSelect,
    })
  })

  const ref = substituteReceiptRefOf(issued)
  if (ref === null) throw new SubstituteReceiptError('SUBSTITUTE_RECEIPT_NOT_FOUND', { detail: `substitute_receipt=${id}` })
  return ref
}
