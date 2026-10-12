import { documentedAmountsForBatches } from '@/lib/portal/documented-amounts'
import { prisma } from '@/lib/prisma'
import {
  evaluateTaxInvoiceCoverage,
  receiptAwaitsTaxInvoice,
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
          totalBeforeVatSatang: true,
          taxInvoices: {
            where: { status: 'active' },
            select: { docKind: true, amountBeforeVatSatang: true, vatSatang: true, totalSatang: true, vatRatePctUsed: true },
          },
        },
      },
      revenues: { where: { deletedAt: null }, select: { vatRatePctUsed: true } },
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
    const invoicedBeforeVat = invoices.reduce((sum, invoice) => sum + invoice.amountBeforeVatSatang, 0)
    // รีวิว mytester3 #4 — ใบที่อัตรา ณ วันรับเงินต่างจากอัตราในใบแจ้งหนี้ (U96 #9)
    const billedRates = batch.revenues.map((revenue) => revenue.vatRatePctUsed.toNumber())
    const vatRateDiffers = invoices.some((invoice) => {
      const rate = invoice.vatRatePctUsed
      return rate !== null && billedRates.some((billed) => Math.round(billed * 100) !== Math.round(rate.toNumber() * 100))
    })
    return [
      {
        batchNumber: batch.batchNumber,
        invoiced: {
          beforeVatSatang: amounts.invoiced.beforeVatSatang,
          vatSatang: amounts.invoiced.vatSatang,
          totalSatang: amounts.invoiced.totalSatang,
        },
        creditNotes: { vatSatang: amounts.creditNotes.vatSatang, totalSatang: amounts.creditNotes.totalSatang },
        debitNotes: { vatSatang: amounts.debitNotes.vatSatang, totalSatang: amounts.debitNotes.totalSatang },
        taxInvoices: {
          beforeVatSatang: invoicedBeforeVat,
          vatSatang: invoices.reduce((sum, invoice) => sum + invoice.vatSatang, 0),
          totalSatang: invoices.reduce((sum, invoice) => sum + invoice.totalSatang, 0),
        },
        receivedSatang: batch.receivedSatang,
        customerWhtSatang: batch.whtWithheldByCustomerSatang,
        bankFeeSatang: batch.bankFeeWrittenOffSatang,
        fullyPaid: batch.status === 'paid',
        hasReceiptsAwaitingInvoice: batch.cashReceipts.some((receipt) =>
          receiptAwaitsTaxInvoice({
            hasActiveInvoice: receipt.taxInvoices.length > 0,
            coveredByLegacyInvoice: legacy,
            batchFullyPaid: batch.status === 'paid',
            invoicedBeforeVatSatang: invoicedBeforeVat,
            billedBeforeVatSatang: batch.salesRecord?.totalBeforeVatSatang ?? null,
            uninvoicedReductionBeforeVatSatang: amounts.uninvoicedReduction.beforeVatSatang,
          }),
        ),
        vatRateDiffers,
        uninvoicedReduction: amounts.uninvoicedReduction,
      },
    ]
  })
  return evaluateTaxInvoiceCoverage(rows)
}

/**
 * มติ PO U95 #6 — เงินรับ (ลงวันที่ก่อน `before`) ที่ยังรอออกใบเสร็จรับเงิน/ใบกำกับภาษี · คำเตือนตรวจความพร้อมปิดงวด
 * · กติกาเดียวกับข้อข้ามของ {@link loadTaxInvoiceCoverage} ({@link receiptAwaitsTaxInvoice} — รีวิว mytester3 #5:
 *   เงินรับหลังใบปิดยอดของรอบที่รับครบ ออกใบไม่ได้โดยออกแบบ ⇒ ไม่นับ) · ⚠️ ไม่ตรวจสิทธิ์ (ผู้เรียกตรวจแล้ว)
 */
export async function loadReceiptsAwaitingTaxInvoice(
  organizationId: string,
  before: Date,
): Promise<{ count: number; amountSatang: number }> {
  const receipts = await prisma.cashReceipt.findMany({
    where: { organizationId, receivedDate: { lt: before }, taxInvoices: { none: { status: 'active' } } },
    select: {
      amountSatang: true,
      whtWithheldByCustomerSatang: true,
      billingBatchId: true,
      billingBatch: {
        select: {
          status: true,
          salesRecord: {
            select: {
              totalBeforeVatSatang: true,
              taxInvoices: { where: { status: 'active' }, select: { docKind: true, amountBeforeVatSatang: true } },
            },
          },
        },
      },
    },
  })
  // มติผู้ใช้ 12/10/2569 (รีวิว R3 #1) — ส่วนที่ลดก่อนออกใบไม่ต้องออกใบ ⇒ รอบที่ออกครบยอดหลังลดแล้วไม่นับ
  const documented = await documentedAmountsForBatches(organizationId, [
    ...new Set(receipts.map((receipt) => receipt.billingBatchId)),
  ])
  const awaiting = receipts.filter((receipt) => {
    const invoices = receipt.billingBatch.salesRecord?.taxInvoices ?? []
    return receiptAwaitsTaxInvoice({
      uninvoicedReductionBeforeVatSatang: documented.get(receipt.billingBatchId)?.uninvoicedReduction.beforeVatSatang ?? 0,
      hasActiveInvoice: false,
      coveredByLegacyInvoice: invoices.some((invoice) => invoice.docKind === 'tax_invoice'),
      batchFullyPaid: receipt.billingBatch.status === 'paid',
      invoicedBeforeVatSatang: invoices.reduce((sum, invoice) => sum + invoice.amountBeforeVatSatang, 0),
      billedBeforeVatSatang: receipt.billingBatch.salesRecord?.totalBeforeVatSatang ?? null,
    })
  })
  return {
    count: awaiting.length,
    amountSatang: awaiting.reduce((sum, receipt) => sum + receipt.amountSatang + receipt.whtWithheldByCustomerSatang, 0),
  }
}
