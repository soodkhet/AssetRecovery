import { caseRefLabel, groupAuditRefs, type AuditRef, type AuditRefType } from '@/lib/audit/target-refs'
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
