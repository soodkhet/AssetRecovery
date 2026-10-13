import {
  bankTransactionRefLabel,
  caseRefLabel,
  cashReceiptRefLabel,
  exportRecordRefLabel,
  groupAuditRefs,
  type AuditRef,
  type AuditRefType,
} from '@/lib/audit/target-refs'
import { exportVersionLabel } from '@/lib/exports/pack'
import { fmtDate } from '@/lib/format/datetime'
import { fmtSatangSymbol } from '@/lib/format/money'
import { prisma } from '@/lib/prisma'

/**
 * known H-06 — ค้นชื่อ/เลขเอกสารของ id ในบันทึกการใช้งานแบบ **batch**: 1 query ต่อชนิดเป้าหมาย (ไม่ใช่ต่อแถว)
 * กรอง `organization_id` ของผู้เรียกทุก query (Rule 02) · แถวที่ถูกลบแบบ soft delete ยังแสดงชื่อได้ (ประวัติย้อนหลัง)
 * ผลลัพธ์ = Map ของ id (ตัวพิมพ์เล็ก) → ป้าย · id ที่หาไม่พบไม่อยู่ใน Map (หน้าจอแสดง id ย่อแทน)
 */

type Labeled = { id: string; label: string }
type Resolver = (organizationId: string, ids: string[]) => Promise<Labeled[]>

const RESOLVERS: Readonly<Record<AuditRefType, Resolver>> = {
  cases: async (organizationId, ids) =>
    (
      await prisma.case.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, caseRef: true, trackingRound: true },
      })
    ).map((row) => ({ id: row.id, label: caseRefLabel(row.caseRef, row.trackingRound) })),
  assets: async (organizationId, ids) =>
    (
      await prisma.asset.findMany({ where: { organizationId, id: { in: ids } }, select: { id: true, caseRef: true } })
    ).map((row) => ({ id: row.id, label: `เครื่องของเคส ${row.caseRef}` })),
  handover_lots: async (organizationId, ids) =>
    (
      await prisma.handoverLot.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, lotNumber: true },
      })
    ).map((row) => ({ id: row.id, label: row.lotNumber })),
  billing_batches: async (organizationId, ids) =>
    (
      await prisma.billingBatch.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, batchNumber: true },
      })
    ).map((row) => ({ id: row.id, label: row.batchNumber })),
  accounting_periods: async (organizationId, ids) =>
    (
      await prisma.accountingPeriod.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, periodLabel: true },
      })
    ).map((row) => ({ id: row.id, label: row.periodLabel })),
  exceptions: async (organizationId, ids) =>
    (
      await prisma.exception.findMany({ where: { organizationId, id: { in: ids } }, select: { id: true, title: true } })
    ).map((row) => ({ id: row.id, label: row.title })),
  payout_batches: async (organizationId, ids) =>
    (
      await prisma.payoutBatch.findMany({ where: { organizationId, id: { in: ids } }, select: { id: true, name: true } })
    ).map((row) => ({ id: row.id, label: row.name })),
  tax_invoices: async (organizationId, ids) =>
    (
      await prisma.taxInvoice.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, invoiceNumber: true },
      })
    ).map((row) => ({ id: row.id, label: row.invoiceNumber })),
  credit_notes: async (organizationId, ids) =>
    (
      await prisma.creditNote.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, creditNoteNumber: true },
      })
    ).map((row) => ({ id: row.id, label: row.creditNoteNumber })),
  wht_certificates: async (organizationId, ids) =>
    (
      await prisma.whtCertificate.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, certificateNumber: true },
      })
    ).map((row) => ({ id: row.id, label: row.certificateNumber })),
  advances: async (organizationId, ids) =>
    (
      await prisma.advance.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, advanceNumber: true },
      })
    ).map((row) => ({ id: row.id, label: row.advanceNumber })),
  substitute_receipts: async (organizationId, ids) =>
    (
      await prisma.substituteReceipt.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, receiptNumber: true },
      })
    ).map((row) => ({ id: row.id, label: row.receiptNumber })),
  users: async (organizationId, ids) =>
    (
      await prisma.user.findMany({ where: { organizationId, id: { in: ids } }, select: { id: true, fullName: true } })
    ).map((row) => ({ id: row.id, label: row.fullName })),
  teams: async (organizationId, ids) =>
    (
      await prisma.team.findMany({ where: { organizationId, id: { in: ids } }, select: { id: true, name: true } })
    ).map((row) => ({ id: row.id, label: row.name })),
  finance_companies: async (organizationId, ids) =>
    (
      await prisma.financeCompany.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, name: true },
      })
    ).map((row) => ({ id: row.id, label: row.name })),
  compensation_plans: async (organizationId, ids) =>
    (
      await prisma.compensationPlan.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, name: true, version: true },
      })
    ).map((row) => ({ id: row.id, label: `${row.name} (ฉบับที่ ${row.version})` })),
  export_records: async (organizationId, ids) =>
    (
      await prisma.exportRecord.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, version: true, period: { select: { periodLabel: true } } },
      })
    ).map((row) => ({ id: row.id, label: exportRecordRefLabel(row.period.periodLabel, exportVersionLabel(row.version)) })),
  device_brands: async (organizationId, ids) =>
    (
      await prisma.deviceBrand.findMany({ where: { organizationId, id: { in: ids } }, select: { id: true, name: true } })
    ).map((row) => ({ id: row.id, label: row.name })),
  bank_transactions: async (organizationId, ids) =>
    (
      await prisma.bankTransaction.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, transactionDate: true, amountSatang: true, bankAccount: { select: { bankName: true } } },
      })
    ).map((row) => ({
      id: row.id,
      label: bankTransactionRefLabel(
        fmtDate(row.transactionDate),
        fmtSatangSymbol(row.amountSatang),
        row.bankAccount.bankName,
      ),
    })),
  cash_receipts: async (organizationId, ids) =>
    (
      await prisma.cashReceipt.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, amountSatang: true, billingBatch: { select: { batchNumber: true } } },
      })
    ).map((row) => ({ id: row.id, label: cashReceiptRefLabel(row.billingBatch.batchNumber, fmtSatangSymbol(row.amountSatang)) })),
}

export async function resolveAuditRefLabels(organizationId: string, refs: readonly AuditRef[]): Promise<Map<string, string>> {
  const grouped = groupAuditRefs(refs)
  const results = await Promise.all(
    [...grouped].map(([type, ids]) => (ids.length === 0 ? Promise.resolve([]) : RESOLVERS[type](organizationId, ids))),
  )
  const labels = new Map<string, string>()
  for (const rows of results) {
    for (const row of rows) labels.set(row.id.toLowerCase(), row.label)
  }
  return labels
}
