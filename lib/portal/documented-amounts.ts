import { allocateLargestRemainder } from '@/lib/finance/wht-calc'
import { prisma } from '@/lib/prisma'

/**
 * **ยอดตามเอกสารที่ออกให้ลูกค้าจริง** — จุดเดียวที่พอร์ทัลใช้หายอดเงินของรอบวางบิล/ใบกำกับ
 * (มติ PO 05/10/2569 U14 · `97` §6.2 · ม.86/10)
 *
 * ### กติกา
 * - พอร์ทัลแสดง**ยอดตามเอกสาร** (ใบกำกับภาษี/ใบลดหนี้) เท่านั้น — Adjustment ภายในที่ยังไม่มีใบลดหนี้
 *   **ไม่สะท้อน**ในพอร์ทัล (รายงานภายใน F1/F2/F3 ยังใช้ยอดหลัง Adjustment ตามเดิม — ไม่แตะ)
 * - ยอดหน้าใบกำกับ = snapshot ใน `sales_records` (สร้างตอนส่งบิล — ก่อน VAT/VAT/รวม ตัวเดียวกับที่พิมพ์ลงใบ)
 *   · ยังไม่มี `sales_records` (ยังไม่ออกใบ/sync ล้ม) ⇒ ยอดรวม = `billing_batches.total_satang` (ยอดใบวางบิลที่ส่งจริง)
 *     ส่วนก่อน VAT/VAT = ผลรวม snapshot ของ `revenues` ในรอบ (ตัวเดียวกับที่จะลงใบ)
 * - **ไม่มีสูตรเงินใหม่**: `documented = invoiced − creditNotes` (บวก/ลบ satang ล้วน)
 *
 * ### TODO(X2 — บันทึกใบลดหนี้)
 * ตอนนี้ยังไม่มีตารางใบลดหนี้ ⇒ `creditNotes` = 0 เสมอ (`ZERO_AMOUNTS`) · เมื่อเพิ่มตาราง ให้แก้
 * `loadCreditNoteTotals()` ไฟล์นี้ไฟล์เดียว (โหลดผลรวมใบลดหนี้ที่ยังไม่ยกเลิกต่อรอบวางบิล) — ผู้เรียกทุกจุด
 * (dashboard / วางบิล / AR aging / กราฟรายได้) ได้ยอดหักใบลดหนี้อัตโนมัติ
 */

export interface DocumentAmounts {
  beforeVatSatang: number
  vatSatang: number
  totalSatang: number
}

export const ZERO_AMOUNTS: DocumentAmounts = Object.freeze({ beforeVatSatang: 0, vatSatang: 0, totalSatang: 0 })

export interface DocumentedBillingAmounts {
  billingBatchId: string
  /** ใบกำกับภาษีที่ยังใช้งาน (`active`) ของรอบ — ยังไม่ออก/ยกเลิกหมด ⇒ `null` */
  taxInvoice: { id: string; invoiceNumber: string; invoiceDate: Date } | null
  /** ยอดหน้าใบกำกับ (`sales_records` snapshot) */
  invoiced: DocumentAmounts
  /** ผลรวมใบลดหนี้ของรอบ — TODO(X2) ตอนนี้ 0 เสมอ */
  creditNotes: DocumentAmounts
  /** ยอดตามเอกสาร = ใบกำกับ − ใบลดหนี้ (ยอดที่พอร์ทัลแสดง/นับ) */
  documented: DocumentAmounts
}

export type DocumentedBillingRef = { billingBatchId: string } | { taxInvoiceId: string }

/** pure — `invoiced − creditNotes` ทีละช่อง */
export function applyCreditNotes(invoiced: DocumentAmounts, creditNotes: DocumentAmounts): DocumentAmounts {
  return {
    beforeVatSatang: invoiced.beforeVatSatang - creditNotes.beforeVatSatang,
    vatSatang: invoiced.vatSatang - creditNotes.vatSatang,
    totalSatang: invoiced.totalSatang - creditNotes.totalSatang,
  }
}

/**
 * TODO(X2): ผลรวมใบลดหนี้ (ไม่นับใบที่ยกเลิก) ต่อรอบวางบิล — คืน Map ว่าง = ยังไม่มีใบลดหนี้
 * ห้ามคืนค่าติดลบ (ใบลดหนี้เป็นยอดบวกที่นำไปหัก)
 */
async function loadCreditNoteTotals(
  _organizationId: string,
  _billingBatchIds: readonly string[],
): Promise<ReadonlyMap<string, DocumentAmounts>> {
  return new Map()
}

/** ยอดตามเอกสารของหลายรอบวางบิลในครั้งเดียว (ไม่พบ/ถูกลบ ⇒ ไม่มีคีย์ใน Map) */
export async function documentedAmountsForBatches(
  organizationId: string,
  billingBatchIds: readonly string[],
): Promise<Map<string, DocumentedBillingAmounts>> {
  const result = new Map<string, DocumentedBillingAmounts>()
  if (billingBatchIds.length === 0) return result
  const ids = [...new Set(billingBatchIds)]
  const [batches, creditNotes] = await Promise.all([
    prisma.billingBatch.findMany({
      where: { organizationId, id: { in: ids }, deletedAt: null },
      select: {
        id: true,
        totalSatang: true,
        salesRecord: {
          select: {
            totalBeforeVatSatang: true,
            vatSatang: true,
            totalSatang: true,
            taxInvoices: {
              where: { status: 'active' },
              select: { id: true, invoiceNumber: true, invoiceDate: true },
              orderBy: [{ invoiceDate: 'desc' }, { createdAt: 'desc' }],
              take: 1,
            },
          },
        },
        revenues: { where: { deletedAt: null }, select: { grossSatang: true, vatSatang: true } },
      },
    }),
    loadCreditNoteTotals(organizationId, ids),
  ])

  for (const batch of batches) {
    const sales = batch.salesRecord
    const invoiced: DocumentAmounts =
      sales !== null
        ? { beforeVatSatang: sales.totalBeforeVatSatang, vatSatang: sales.vatSatang, totalSatang: sales.totalSatang }
        : {
            beforeVatSatang: batch.revenues.reduce((sum, row) => sum + row.grossSatang, 0),
            vatSatang: batch.revenues.reduce((sum, row) => sum + row.vatSatang, 0),
            totalSatang: batch.totalSatang,
          }
    const credit = creditNotes.get(batch.id) ?? ZERO_AMOUNTS
    result.set(batch.id, {
      billingBatchId: batch.id,
      taxInvoice: sales?.taxInvoices[0] ?? null,
      invoiced,
      creditNotes: credit,
      documented: applyCreditNotes(invoiced, credit),
    })
  }
  return result
}

/**
 * `documentedBillingAmounts(billingBatchId | taxInvoiceId)` — ยอดตามเอกสารของรอบวางบิลเดียว
 * (อ้างด้วยใบกำกับ ⇒ หารอบวางบิลของใบนั้น) · ไม่พบ ⇒ `null`
 * ⚠️ ไม่ตรวจบริษัท — ผู้เรียกต้อง scope `company_id` เอง
 */
export async function documentedBillingAmounts(
  organizationId: string,
  ref: DocumentedBillingRef,
): Promise<DocumentedBillingAmounts | null> {
  let billingBatchId: string
  if ('billingBatchId' in ref) {
    billingBatchId = ref.billingBatchId
  } else {
    const invoice = await prisma.taxInvoice.findFirst({
      where: { id: ref.taxInvoiceId, organizationId },
      select: { salesRecord: { select: { billingBatchId: true } } },
    })
    if (invoice === null) return null
    billingBatchId = invoice.salesRecord.billingBatchId
  }
  const map = await documentedAmountsForBatches(organizationId, [billingBatchId])
  return map.get(billingBatchId) ?? null
}

/**
 * pure — กระจายยอด**ก่อน VAT ตามเอกสาร**ของรอบวางบิลลงรายได้แต่ละใบในรอบ ตามสัดส่วน `grossSatang`
 * (largest remainder ตัวกลาง — ผลรวมเท่ายอดเอกสารเสมอ) · ใช้ทำกราฟรายได้รายเดือนของพอร์ทัล
 * ⇒ ไม่มีใบลดหนี้ ยอดที่ได้ = `grossSatang` เดิมทุกใบ (ยอดหน้าใบกำกับ) · มีใบลดหนี้ ยอดลดตามสัดส่วน
 * TODO(X2): ถ้าใบลดหนี้ผูกกับรายได้รายใบได้ ให้หักตรงใบนั้นแทนการกระจายตามสัดส่วน
 */
export function allocateDocumentedRevenue(
  documentedBeforeVatSatang: number,
  revenues: readonly { id: string; grossSatang: number }[],
): Map<string, number> {
  const shares = allocateLargestRemainder(
    documentedBeforeVatSatang,
    revenues.map((revenue) => Math.max(0, revenue.grossSatang)),
  )
  return new Map(revenues.map((revenue, index) => [revenue.id, shares[index] ?? 0]))
}

/**
 * ยอดรายได้ (ก่อน VAT) ตามเอกสารต่อ `revenue.id` ของรายได้ในรอบวางบิลที่กำหนด — ฐานของกราฟรายได้พอร์ทัล
 * · กระจายจากยอดเอกสารของ**ทั้งรอบ** (รายได้ทุกใบในรอบ ไม่ใช่เฉพาะช่วงเดือนที่ขอ) เพื่อให้สัดส่วนถูก
 */
export async function documentedRevenueAmounts(
  organizationId: string,
  billingBatchIds: readonly string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  const ids = [...new Set(billingBatchIds)]
  if (ids.length === 0) return result
  const [documented, revenues] = await Promise.all([
    documentedAmountsForBatches(organizationId, ids),
    prisma.revenue.findMany({
      where: { organizationId, billingBatchId: { in: ids }, deletedAt: null },
      select: { id: true, billingBatchId: true, grossSatang: true },
      orderBy: [{ revenueDate: 'asc' }, { id: 'asc' }],
    }),
  ])
  const byBatch = new Map<string, { id: string; grossSatang: number }[]>()
  for (const revenue of revenues) {
    if (revenue.billingBatchId === null) continue
    const list = byBatch.get(revenue.billingBatchId) ?? []
    list.push(revenue)
    byBatch.set(revenue.billingBatchId, list)
  }
  for (const [batchId, list] of byBatch) {
    const amounts = documented.get(batchId)
    if (amounts === undefined) continue
    for (const [id, satang] of allocateDocumentedRevenue(amounts.documented.beforeVatSatang, list)) result.set(id, satang)
  }
  return result
}
