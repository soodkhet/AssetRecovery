import type { ArAgingRow } from '@/lib/finance/ar-calc'
import { endOfBangkokDay } from '@/lib/format/datetime'
import { withDocumentedArTotals } from '@/lib/portal/documented-amounts'
import { prisma } from '@/lib/prisma'
import type { ArAgingCompanyEntry } from '@/lib/reports/finance/ar-aging-report'

/**
 * รอบวางบิลที่ยังไม่ปิดยอด แยกตามบริษัทไฟแนนซ์ — ฐานของ **F3 (อายุหนี้)** และของ **หมวด E**
 * (`96` §6-E1 การ์ด "AR ค้างรับ" · §6-E2 คอลัมน์ "AR ค้าง") ⇒ ยอดลูกหนี้ของทุกเมนูมาจาก query
 * ชุดเดียวกัน ตัวเลขขัดกันไม่ได้
 *
 * ยอดที่คืนเป็น**ยอดตามเอกสาร** (มติ PO U96 #11 — ใบแจ้งหนี้ − ใบลดหนี้ + ใบเพิ่มหนี้ · helper เดียวกับพอร์ทัล)
 * ส่วนการหักเงินรับ/WHT ที่ลูกค้าหักไว้อยู่ในสูตร `arOutstandingSatang()` (`22` §6.11) ซึ่งผู้เรียกเป็นคนเรียกเอง
 */
export async function loadArAgingCompanies(
  organizationId: string,
  filter: {
    companyId?: string
    /**
     * mytester J-01 — ยอดลูกหนี้ **ณ วันนั้น** (วันตามปฏิทินไทย แบบ date-only UTC) สำหรับรายงานย้อนหลัง:
     * เฉพาะรอบที่ส่งไม่เกินวันนั้น · เงินรับ/ภาษีที่ลูกค้าหักตามวันรับเงิน · ใบลด/เพิ่มหนี้ตามวันออก ·
     * ค่าธรรมเนียมที่ตัดตามวันตัด · ไม่ส่ง = ยอดปัจจุบัน (พฤติกรรมเดิม — แดชบอร์ด/หมวด E)
     */
    asOf?: Date
  } = {},
): Promise<ArAgingCompanyEntry[]> {
  const asOf = filter.asOf
  const fetched = await prisma.billingBatch.findMany({
    where: {
      organizationId,
      deletedAt: null,
      // บิลที่ยัง `draft` ยังไม่ได้ส่งให้ลูกค้า ⇒ ยังไม่ใช่ลูกหนี้การค้า (`19` §9.1)
      status: { in: ['sent', 'partially_paid', 'paid'] },
      ...(filter.companyId === undefined ? {} : { companyId: filter.companyId }),
      ...(asOf === undefined ? {} : { sentAt: { lte: endOfBangkokDay(asOf) } }),
    },
    select: {
      id: true,
      companyId: true,
      dueDate: true,
      totalSatang: true,
      receivedSatang: true,
      whtWithheldByCustomerSatang: true,
      bankFeeWrittenOffSatang: true,
      bankFeeWrittenOffDate: true,
      company: { select: { name: true } },
    },
  })
  const rows = asOf === undefined ? fetched : await asOfSettlement(organizationId, fetched, asOf)

  // มติ PO U96 #11 — ยอดบิลของลูกหนี้ = **ยอดตามเอกสาร** (ใบแจ้งหนี้ − ใบลดหนี้ + ใบเพิ่มหนี้) นิยามเดียวกับพอร์ทัล
  const documented = await withDocumentedArTotals(organizationId, rows, prisma, asOf)

  const byCompany = new Map<string, { companyId: string; companyName: string; batches: ArAgingRow[] }>()
  for (const row of documented) {
    let entry = byCompany.get(row.companyId)
    if (entry === undefined) {
      entry = { companyId: row.companyId, companyName: row.company.name, batches: [] }
      byCompany.set(row.companyId, entry)
    }
    entry.batches.push({
      dueDate: row.dueDate,
      totalSatang: row.totalSatang,
      receivedSatang: row.receivedSatang,
      whtWithheldByCustomerSatang: row.whtWithheldByCustomerSatang,
      bankFeeWrittenOffSatang: row.bankFeeWrittenOffSatang,
    })
  }

  return [...byCompany.values()]
}

/**
 * ยอดรับชำระ ณ วันนั้น — คิดใหม่จากใบเงินรับ (`cash_receipts.received_date` ≤ วันนั้น) แทนยอดสะสมปัจจุบันบนรอบ ·
 * ค่าธรรมเนียมธนาคารที่ตัด (U144) นับเมื่อวันตัดไม่เกินวันนั้น
 */
async function asOfSettlement<
  T extends { id: string; receivedSatang: number; whtWithheldByCustomerSatang: number; bankFeeWrittenOffSatang: number; bankFeeWrittenOffDate: Date | null },
>(organizationId: string, rows: readonly T[], asOf: Date): Promise<T[]> {
  if (rows.length === 0) return []
  const receipts = await prisma.cashReceipt.groupBy({
    by: ['billingBatchId'],
    where: { organizationId, billingBatchId: { in: rows.map((row) => row.id) }, receivedDate: { lte: asOf } },
    _sum: { amountSatang: true, whtWithheldByCustomerSatang: true },
  })
  const byBatch = new Map(receipts.map((group) => [group.billingBatchId, group._sum]))
  return rows.map((row) => ({
    ...row,
    receivedSatang: byBatch.get(row.id)?.amountSatang ?? 0,
    whtWithheldByCustomerSatang: byBatch.get(row.id)?.whtWithheldByCustomerSatang ?? 0,
    bankFeeWrittenOffSatang:
      row.bankFeeWrittenOffDate !== null && row.bankFeeWrittenOffDate.getTime() <= asOf.getTime()
        ? row.bankFeeWrittenOffSatang
        : 0,
  }))
}
