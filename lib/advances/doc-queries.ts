import type { AdvanceDocSource, AdvanceReturnDocSource } from '@/lib/advances/advance-doc'
import { AdvanceError } from '@/lib/advances/errors'
import { assertAdvanceInScope } from '@/lib/advances/queries'
import type { SessionUser } from '@/lib/auth/types'
import { prisma } from '@/lib/prisma'

/**
 * แหล่งข้อมูลของใบเบิก/ใบรับคืนเงินทดรอง (มติ PO U100) — ชั้น DB
 * scope เดียวกับหน้าเงินทดรอง: การเงิน (`approve_advance`) เห็นทุกราย · เจ้าของเห็นของตัวเอง · นอกนั้น `ADVANCE_NOT_FOUND` (404)
 */

const docSelect = {
  id: true,
  advanceNumber: true,
  status: true,
  requestedSatang: true,
  approvedSatang: true,
  usedSatang: true,
  returnSatang: true,
  purpose: true,
  dueClearDate: true,
  createdAt: true,
  approvedAt: true,
  clearedAt: true,
  approvedByUser: { select: { fullName: true } },
  payee: {
    select: {
      nameTitle: true,
      nationalId: true,
      bankName: true,
      accountNumber: true,
      addressDetail: true,
      addressSubdistrict: true,
      addressDistrict: true,
      addressProvince: true,
      addressPostalCode: true,
      user: { select: { fullName: true, phone: true, team: { select: { name: true } } } },
    },
  },
  payoutItems: {
    select: { payoutBatch: { select: { name: true, status: true, createdAt: true } } },
  },
  substituteReceipts: { where: { deletedAt: null }, select: { receiptNumber: true } },
  returns: {
    select: {
      id: true,
      returnNumber: true,
      channel: true,
      amountSatang: true,
      receivedDate: true,
      reversedAt: true,
      reversalReason: true,
      createdAt: true,
      payoutBatch: { select: { name: true, paymentFileGeneratedAt: true, updatedAt: true } },
      payoutBatchItem: { select: { voucherNumber: true } },
    },
    orderBy: { createdAt: 'asc' },
  },
} as const

async function loadAdvance(user: SessionUser, advanceId: string) {
  await assertAdvanceInScope(user, advanceId)
  const row = await prisma.advance.findFirst({
    where: { id: advanceId, organizationId: user.organizationId, deletedAt: null },
    select: docSelect,
  })
  if (row === null) throw new AdvanceError('ADVANCE_NOT_FOUND', { detail: `advance=${advanceId}` })
  return row
}

type AdvanceDocRow = Awaited<ReturnType<typeof loadAdvance>>

function toAdvanceDocSource(row: AdvanceDocRow): AdvanceDocSource {
  // รอบจ่ายที่จ่ายจริง (completed) ก่อน — ไม่มีก็ใช้รอบล่าสุดที่ไม่ถูกยกเลิก
  const batches = row.payoutItems
    .map((item) => item.payoutBatch)
    .filter((batch) => batch.status !== 'cancelled')
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  const paidBatch = batches.find((batch) => batch.status === 'completed') ?? batches[0] ?? null
  return {
    advanceNumber: row.advanceNumber,
    status: row.status,
    requestedSatang: row.requestedSatang,
    approvedSatang: row.approvedSatang,
    usedSatang: row.usedSatang,
    returnSatang: row.returnSatang,
    purpose: row.purpose,
    dueClearDate: row.dueClearDate,
    createdAt: row.createdAt,
    approvedAt: row.approvedAt,
    clearedAt: row.clearedAt,
    approverName: row.approvedByUser?.fullName ?? null,
    teamName: row.payee.user.team?.name ?? null,
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
      bankName: row.payee.bankName,
      accountNumber: row.payee.accountNumber,
    },
    payoutBatchName: paidBatch?.name ?? null,
    substituteReceiptNumber: row.substituteReceipts[0]?.receiptNumber ?? null,
  }
}

export async function getAdvanceRequestDocSource(user: SessionUser, advanceId: string): Promise<AdvanceDocSource> {
  return toAdvanceDocSource(await loadAdvance(user, advanceId))
}

/** ใบรับคืน 1 แถวของ `advance_returns` — แถวของเงินทดรองอื่น/ไม่มี = `ADVANCE_NOT_FOUND` */
export async function getAdvanceReturnDocSource(
  user: SessionUser,
  advanceId: string,
  returnId: string,
): Promise<AdvanceReturnDocSource> {
  const row = await loadAdvance(user, advanceId)
  const index = row.returns.findIndex((entry) => entry.id === returnId)
  const entry = row.returns[index]
  if (entry === undefined) {
    throw new AdvanceError('ADVANCE_NOT_FOUND', { detail: `advance=${advanceId} return=${returnId}` })
  }
  // ยอดที่รับคืนแล้วก่อนแถวนี้ (แถวที่ยังมีผลเท่านั้น)
  const collectedBefore = row.returns
    .slice(0, index)
    .filter((previous) => previous.reversedAt === null)
    .reduce((sum, previous) => sum + previous.amountSatang, 0)
  const returnDate =
    entry.channel === 'payout_offset' && entry.payoutBatch !== null
      ? (entry.payoutBatch.paymentFileGeneratedAt ?? entry.payoutBatch.updatedAt)
      : (entry.receivedDate ?? entry.createdAt)

  return {
    returnNumber: entry.returnNumber,
    channel: entry.channel,
    amountSatang: entry.amountSatang,
    returnDate,
    payoutBatchName: entry.payoutBatch?.name ?? null,
    voucherNumber: entry.payoutBatchItem?.voucherNumber ?? null,
    reversedAt: entry.reversedAt,
    reversalReason: entry.reversalReason,
    collectedBeforeSatang: collectedBefore,
    advance: toAdvanceDocSource(row),
  }
}
