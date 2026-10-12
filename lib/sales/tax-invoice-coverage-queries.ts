import { documentedAmountsForBatches } from '@/lib/portal/documented-amounts'
import { prisma } from '@/lib/prisma'
import {
  evaluateTaxInvoiceCoverage,
  type TaxInvoiceCoverageBatch,
  type TaxInvoiceCoverageResult,
} from '@/lib/sales/tax-invoice-coverage'

/**
 * mytester3 H3-02 — โหลดยอดต่อรอบวางบิลสำหรับ `evaluateTaxInvoiceCoverage()` (ใช้ทั้งหน้าต่างตรวจความพร้อม
 * และ `00_Control_Totals.csv`) · รอบที่ตรวจ = รอบวางบิลที่มีเงินรับลงวันที่ในงวด (`[start, end)` date-only UTC)
 * — จุดความรับผิด VAT ของใบเสร็จรับเงิน/ใบกำกับภาษีคือวันรับเงิน · ⚠️ ไม่ตรวจสิทธิ์ (ผู้เรียกตรวจระดับองค์กรแล้ว)
 */
export async function loadTaxInvoiceCoverage(
  organizationId: string,
  period: { start: Date; end: Date },
): Promise<TaxInvoiceCoverageResult> {
  const batches = await prisma.billingBatch.findMany({
    where: {
      organizationId,
      deletedAt: null,
      cashReceipts: { some: { receivedDate: { gte: period.start, lt: period.end } } },
    },
    orderBy: [{ batchNumber: 'asc' }],
    select: {
      id: true,
      batchNumber: true,
      status: true,
      receivedSatang: true,
      whtWithheldByCustomerSatang: true,
      bankFeeWrittenOffSatang: true,
      salesRecord: {
        select: {
          taxInvoices: { where: { status: 'active' }, select: { docKind: true, vatSatang: true, totalSatang: true } },
        },
      },
      cashReceipts: { select: { taxInvoices: { where: { status: 'active' }, select: { id: true } } } },
    },
  })
  if (batches.length === 0) return evaluateTaxInvoiceCoverage([])
  const documented = await documentedAmountsForBatches(
    organizationId,
    batches.map((batch) => batch.id),
  )

  const rows: TaxInvoiceCoverageBatch[] = batches.flatMap((batch) => {
    const amounts = documented.get(batch.id)
    if (amounts === undefined) return []
    const invoices = batch.salesRecord?.taxInvoices ?? []
    // ใบกำกับแบบเดิม (ออกตอนวางบิล) ครอบทั้งรอบแล้ว ⇒ เงินรับไม่ต้องมีใบของตัวเอง (กติกาเดียวกับคำเตือน U95)
    const legacy = invoices.some((invoice) => invoice.docKind === 'tax_invoice')
    return [
      {
        batchNumber: batch.batchNumber,
        invoiced: { vatSatang: amounts.invoiced.vatSatang, totalSatang: amounts.invoiced.totalSatang },
        creditNotes: { vatSatang: amounts.creditNotes.vatSatang, totalSatang: amounts.creditNotes.totalSatang },
        debitNotes: { vatSatang: amounts.debitNotes.vatSatang, totalSatang: amounts.debitNotes.totalSatang },
        taxInvoices: {
          vatSatang: invoices.reduce((sum, invoice) => sum + invoice.vatSatang, 0),
          totalSatang: invoices.reduce((sum, invoice) => sum + invoice.totalSatang, 0),
        },
        receivedSatang: batch.receivedSatang,
        customerWhtSatang: batch.whtWithheldByCustomerSatang,
        bankFeeSatang: batch.bankFeeWrittenOffSatang,
        fullyPaid: batch.status === 'paid',
        hasReceiptsAwaitingInvoice: !legacy && batch.cashReceipts.some((receipt) => receipt.taxInvoices.length === 0),
      },
    ]
  })
  return evaluateTaxInvoiceCoverage(rows)
}
