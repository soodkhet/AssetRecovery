import { sumCreditNotesByInvoice } from '@/lib/credit-notes/queries'
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
 * ### ใบลดหนี้ (fixer X2/X3)
 * `loadCreditNoteTotals()` รวมใบลดหนี้ **active** ของใบกำกับทุกใบของรอบ (รวมใบกำกับที่ยกเลิกแล้ว — ใบลดหนี้
 * ที่ออกไปแล้วยังเป็นเอกสารจริง ตรงกับ `creditNotesForBillingBatch`) ⇒ ผู้เรียกทุกจุด
 * (dashboard / วางบิล / AR aging / กราฟรายได้) ได้ยอดหักใบลดหนี้อัตโนมัติ · รายการใบกำกับ/"ใบกำกับล่าสุด"
 * ยังแสดงยอดหน้าใบ (ใบลดหนี้เป็นเอกสารแยก)
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
  /** ผลรวมใบลดหนี้ active ของรอบ (ไม่มี ⇒ 0) */
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
 * ผลรวมใบลดหนี้ **active** ต่อรอบวางบิล (กรององค์กร · 2 query ไม่ว่ากี่รอบ — กัน N+1) · รอบที่ไม่มีใบลดหนี้ไม่มีคีย์
 * ⚠️ ไม่ตรวจสิทธิ์/บริษัท — ผู้เรียกกรองรอบตาม scope มาแล้ว
 */
async function loadCreditNoteTotals(
  organizationId: string,
  billingBatchIds: readonly string[],
): Promise<ReadonlyMap<string, DocumentAmounts>> {
  const result = new Map<string, DocumentAmounts>()
  if (billingBatchIds.length === 0) return result
  const invoices = await prisma.taxInvoice.findMany({
    where: { organizationId, salesRecord: { billingBatchId: { in: [...billingBatchIds] } } },
    select: { id: true, salesRecord: { select: { billingBatchId: true } } },
  })
  if (invoices.length === 0) return result
  const totals = await sumCreditNotesByInvoice(
    invoices.map((invoice) => invoice.id),
    { organizationId },
  )
  for (const invoice of invoices) {
    const sum = totals.get(invoice.id)
    if (sum === undefined || sum.count === 0) continue
    const batchId = invoice.salesRecord.billingBatchId
    const current = result.get(batchId) ?? ZERO_AMOUNTS
    result.set(batchId, {
      beforeVatSatang: current.beforeVatSatang + sum.amountBeforeVatSatang,
      vatSatang: current.vatSatang + sum.vatSatang,
      totalSatang: current.totalSatang + sum.totalSatang,
    })
  }
  return result
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
 * pure — กระจายยอด**ก่อน VAT**ของรอบวางบิลลงรายได้แต่ละใบในรอบ ตามสัดส่วน `grossSatang`
 * (largest remainder ตัวกลาง — ผลรวมเท่ายอดที่ส่งเข้าเสมอ) · ไม่มีใบลดหนี้ ยอดที่ได้ = `grossSatang` เดิมทุกใบ
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

/** ใบลดหนี้ active หนึ่งใบสำหรับกราฟรายได้ — `revenueId` = รายได้ที่ Adjustment ต้นเหตุชี้ (ไม่มี ⇒ `null`) */
export interface RevenueCreditNote {
  amountBeforeVatSatang: number
  revenueId: string | null
}

/**
 * pure — ยอดรายได้ (ก่อน VAT) ตามเอกสารต่อรายได้ในรอบ = ยอดหน้าใบกำกับที่กระจายแล้ว − ใบลดหนี้ (มติ U14)
 *
 * 1. กระจายยอดก่อน VAT **หน้าใบกำกับ** ตามสัดส่วน `grossSatang` (`allocateDocumentedRevenue`)
 * 2. ใบลดหนี้ที่ผูก Adjustment → รายได้ในรอบนี้ ⇒ **หักตรงรายได้ใบนั้น** (ไม่เกินยอดคงเหลือของใบ —
 *    ส่วนเกินไปข้อ 3) · ทำตามลำดับที่ส่งเข้า (ผู้เรียกเรียงตามวันที่ออก)
 * 3. ใบลดหนี้ที่เหลือ (ไม่ผูก/ผูกรอบหรือค่าใช้จ่าย/ส่วนเกิน) รวมเป็นก้อนเดียว ⇒ กระจายตามสัดส่วน**ยอดคงเหลือ**
 *    หลังข้อ 2 (largest remainder — deterministic · ไม่มีใบไหนติดลบเมื่อก้อนไม่เกินยอดคงเหลือรวม ซึ่ง DB
 *    บังคับไว้แล้วว่าใบลดหนี้รวมต้องไม่เกินใบกำกับ)
 * ⇒ ผลรวมทุกใบ = ยอดก่อน VAT ใบกำกับ − ใบลดหนี้ก่อน VAT = `documented.beforeVatSatang`
 */
export function allocateRevenueAfterCreditNotes(
  invoicedBeforeVatSatang: number,
  revenues: readonly { id: string; grossSatang: number }[],
  creditNotes: readonly RevenueCreditNote[],
): Map<string, number> {
  const amounts = allocateDocumentedRevenue(invoicedBeforeVatSatang, revenues)
  let pool = 0
  for (const note of creditNotes) {
    const current = note.revenueId === null ? undefined : amounts.get(note.revenueId)
    if (note.revenueId === null || current === undefined) {
      pool += note.amountBeforeVatSatang
      continue
    }
    const direct = Math.min(note.amountBeforeVatSatang, Math.max(0, current))
    amounts.set(note.revenueId, current - direct)
    pool += note.amountBeforeVatSatang - direct
  }
  if (pool > 0) {
    const ids = [...amounts.keys()]
    const shares = allocateLargestRemainder(
      pool,
      ids.map((id) => Math.max(0, amounts.get(id) ?? 0)),
    )
    ids.forEach((id, index) => amounts.set(id, (amounts.get(id) ?? 0) - (shares[index] ?? 0)))
  }
  return amounts
}

/**
 * ยอดรายได้ (ก่อน VAT) ตามเอกสารต่อ `revenue.id` ของรายได้ในรอบวางบิลที่กำหนด — ฐานของกราฟรายได้พอร์ทัล
 * · กระจายจากยอดเอกสารของ**ทั้งรอบ** (รายได้ทุกใบในรอบ ไม่ใช่เฉพาะช่วงเดือนที่ขอ) เพื่อให้สัดส่วนถูก
 * · ใบลดหนี้หักตามกติกาของ `allocateRevenueAfterCreditNotes` (ผูกรายได้ ⇒ ตรงใบ · ไม่งั้นตามสัดส่วน)
 */
export async function documentedRevenueAmounts(
  organizationId: string,
  billingBatchIds: readonly string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  const ids = [...new Set(billingBatchIds)]
  if (ids.length === 0) return result
  const [documented, revenues, creditNotes] = await Promise.all([
    documentedAmountsForBatches(organizationId, ids),
    prisma.revenue.findMany({
      where: { organizationId, billingBatchId: { in: ids }, deletedAt: null },
      select: { id: true, billingBatchId: true, grossSatang: true },
      orderBy: [{ revenueDate: 'asc' }, { id: 'asc' }],
    }),
    prisma.creditNote.findMany({
      where: { organizationId, status: 'active', taxInvoice: { salesRecord: { billingBatchId: { in: ids } } } },
      select: {
        amountBeforeVatSatang: true,
        adjustment: { select: { revenueId: true } },
        taxInvoice: { select: { salesRecord: { select: { billingBatchId: true } } } },
      },
      orderBy: [{ issueDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    }),
  ])
  const byBatch = new Map<string, { id: string; grossSatang: number }[]>()
  for (const revenue of revenues) {
    if (revenue.billingBatchId === null) continue
    const list = byBatch.get(revenue.billingBatchId) ?? []
    list.push(revenue)
    byBatch.set(revenue.billingBatchId, list)
  }
  const notesByBatch = new Map<string, RevenueCreditNote[]>()
  for (const note of creditNotes) {
    const batchId = note.taxInvoice.salesRecord.billingBatchId
    const list = notesByBatch.get(batchId) ?? []
    list.push({ amountBeforeVatSatang: note.amountBeforeVatSatang, revenueId: note.adjustment?.revenueId ?? null })
    notesByBatch.set(batchId, list)
  }
  for (const [batchId, list] of byBatch) {
    const amounts = documented.get(batchId)
    if (amounts === undefined) continue
    const allocated = allocateRevenueAfterCreditNotes(amounts.invoiced.beforeVatSatang, list, notesByBatch.get(batchId) ?? [])
    for (const [id, satang] of allocated) result.set(id, satang)
  }
  return result
}
