import { ORG_ID, as, ctx, rawDb } from './context'
import { stored } from './files'
import { d, ids, need } from './state'

/** ขั้นตอนฝั่งเงิน (รอบจ่าย · ทดรอง · วางบิล · ธนาคาร · ใบกำกับ) — ผ่าน service ของ route เท่านั้น */

const FIN = 'uat.finance'

export async function payout(
  key: string,
  side: 'inhouse' | 'outsource',
  cutoff: string,
  until: 'checking' | 'file_generated' | 'completed',
): Promise<string> {
  const q = await import('@/lib/payout/queries')
  const { batch } = await q.createPayoutBatch(await ctx(FIN), { side, cutoffDate: d(cutoff), name: key })
  ids.payouts[key] = batch.id
  if (until === 'checking') return batch.id
  await q.generatePaymentFile(await ctx(FIN), batch.id, {
    bankAccountId: need('bankAccounts', 'BA-1'),
    bankFileFormatId: need('bankFiles', 'BF-1'),
    confirmDuplicate: false,
    reason: `สร้างไฟล์โอน ${key}`,
  })
  if (until === 'file_generated') return batch.id
  await q.completePayoutBatch(await ctx(FIN), batch.id, { reason: `ยืนยันโอนแล้ว ${key}` })
  return batch.id
}

export async function cancelPayout(key: string, reason: string): Promise<void> {
  const q = await import('@/lib/payout/queries')
  await q.cancelPayoutBatch(await ctx(FIN), ids.payouts[key] ?? '', { reason, confirmFileNotSent: true })
}

export async function advanceRequest(key: string, agent: string, amount: number, due: string): Promise<string> {
  const q = await import('@/lib/advances/queries')
  const created = await q.createAdvance(await ctx(agent), {
    requestedSatang: amount,
    purpose: `เงินทดรองลงพื้นที่ ${key}`,
    dueClearDate: d(due),
    payeeId: null,
  })
  ids.advances[key] = created.id
  return created.id
}

export async function advanceApprove(key: string): Promise<void> {
  const q = await import('@/lib/advances/queries')
  await q.approveAdvance(await ctx(FIN), ids.advances[key] ?? '', { approvedSatang: null, note: null })
}

export async function advanceReject(key: string, reason: string): Promise<void> {
  const q = await import('@/lib/advances/queries')
  await q.rejectAdvance(await ctx(FIN), ids.advances[key] ?? '', { rejectionReason: reason })
}

export async function advanceSettle(
  key: string,
  agent: string,
  used: number,
  returnMethod: 'payout_offset' | 'separate',
  substituteSatang?: number,
): Promise<void> {
  const q = await import('@/lib/advances/queries')
  const user = await as(agent)
  const today = new Date().toISOString().slice(0, 10)
  await q.settleAdvance(await ctx(agent), ids.advances[key] ?? '', {
    usedSatang: used,
    returnMethod,
    receiptFileUrl: substituteSatang === undefined ? await stored(`expenses/${user.id}/receipts/advance-${key}.pdf`) : null,
    note: null,
    substituteReceipt:
      substituteSatang === undefined
        ? null
        : { lines: [{ lineDate: d(today), description: 'ค่าใช้จ่ายย่อยไม่มีใบเสร็จ', amountSatang: substituteSatang, note: null }] },
  })
}

export async function advanceSeparateReturn(key: string, channel: 'cash' | 'bank_transfer', amount: number, date: string): Promise<void> {
  const q = await import('@/lib/advances/queries')
  const { advanceReturnFilePrefix } = await import('@/lib/advances/return-file')
  const id = ids.advances[key] ?? ''
  await q.recordAdvanceSeparateReturn(await ctx(FIN), id, {
    channel,
    amountSatang: amount,
    receivedDate: d(date),
    evidenceFilePath: await stored(`${advanceReturnFilePrefix(id)}return-${channel}.pdf`),
    note: null,
  })
}

// ─── รายรับ ────────────────────────────────────────────────────────────────

export async function billing(key: string, company: string, cutoff: string, send: boolean): Promise<string> {
  const q = await import('@/lib/revenue/queries')
  const reason = `วางบิล ${key}`
  const batch = await q.createBillingBatch({ ...(await ctx(FIN)), reason }, {
    companyId: ids.companies[company] ?? '',
    cutoffDate: d(cutoff),
    cycleId: null,
    reason,
  })
  ids.billing[key] = batch.id
  if (send) await sendBilling(key)
  return batch.id
}

export async function sendBilling(key: string): Promise<void> {
  const q = await import('@/lib/revenue/queries')
  const reason = `ส่งใบแจ้งหนี้ ${key}`
  await q.sendBillingBatch({ ...(await ctx(FIN)), reason }, ids.billing[key] ?? '', { reason })
}

function beDate(date: string): string {
  const [y, m, day] = date.split('-')
  return `${day}/${m}/${Number(y) + 543}`
}

function baht(satang: number): string {
  return (Math.abs(satang) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** นำเข้า statement 1 แถว (บวก = เงินเข้า · ลบ = เงินออก) — คืน id รายการ */
export async function statementLine(date: string, ref: string, satang: number, account = 'BA-1'): Promise<string> {
  const q = await import('@/lib/bank-recon/queries')
  await q.importStatement(await ctx(FIN), {
    bankAccountId: need('bankAccounts', account),
    fileName: `statement-${ref}.csv`,
    csv: [
      'วันที่,รายละเอียด,เลขที่อ้างอิง,เงินเข้า,เงินออก',
      `${beDate(date)},รายการ ${ref},${ref},${satang > 0 ? `"${baht(satang)}"` : ''},${satang < 0 ? `"${baht(satang)}"` : ''}`,
    ].join('\n'),
  })
  const row = await rawDb().bankTransaction.findFirstOrThrow({
    where: { organizationId: ORG_ID, description: { contains: ref } },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })
  return row.id
}

export async function matchToBilling(transactionId: string, billingKey: string, note: string | null): Promise<void> {
  const q = await import('@/lib/bank-recon/queries')
  await q.matchBankTransaction(await ctx(FIN), transactionId, {
    targetKind: 'billing',
    targetId: ids.billing[billingKey] ?? '',
    matchNote: note,
    confirmRematch: false,
  })
}

export async function receiptOf(billingKey: string): Promise<string> {
  const row = await rawDb().cashReceipt.findFirstOrThrow({
    where: { billingBatchId: ids.billing[billingKey] ?? '' },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })
  return row.id
}

export async function issueInvoice(billingKey: string): Promise<string> {
  const q = await import('@/lib/sales/queries')
  const invoice = await q.issueTaxInvoice(await ctx(FIN), { cashReceiptId: await receiptOf(billingKey) })
  return invoice.id
}

export async function receiveCustomerWht(billingKey: string, certificateNumber: string, date: string): Promise<void> {
  const q = await import('@/lib/customer-wht/queries')
  const { customerWhtFilePrefix } = await import('@/lib/customer-wht/file')
  const row = await rawDb().customerWhtCertificate.findFirstOrThrow({
    where: { billingBatchId: ids.billing[billingKey] ?? '' },
    select: { id: true, withheldSatang: true },
  })
  const batch = await rawDb().billingBatch.findUniqueOrThrow({ where: { id: ids.billing[billingKey] ?? '' }, select: { totalSatang: true } })
  await q.receiveCustomerWht(await ctx(FIN), row.id, {
    certificateNumber,
    certificateDate: d(date),
    whtSatang: row.withheldSatang,
    grossSatang: batch.totalSatang,
    filePath: await stored(`${customerWhtFilePrefix(row.id)}cert.pdf`),
    note: null,
  })
}

export async function periodId(yearBe: number, month: number): Promise<string> {
  const q = await import('@/lib/accounting/queries')
  const period = await q.ensurePeriod(await ctx(FIN), { yearBe, month })
  return period.id
}
