import type { ArAgingRow } from '@/lib/finance/ar-calc'
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
  filter: { companyId?: string } = {},
): Promise<ArAgingCompanyEntry[]> {
  const rows = await prisma.billingBatch.findMany({
    where: {
      organizationId,
      deletedAt: null,
      // บิลที่ยัง `draft` ยังไม่ได้ส่งให้ลูกค้า ⇒ ยังไม่ใช่ลูกหนี้การค้า (`19` §9.1)
      status: { in: ['sent', 'partially_paid', 'paid'] },
      ...(filter.companyId === undefined ? {} : { companyId: filter.companyId }),
    },
    select: {
      id: true,
      companyId: true,
      dueDate: true,
      totalSatang: true,
      receivedSatang: true,
      whtWithheldByCustomerSatang: true,
      bankFeeWrittenOffSatang: true,
      company: { select: { name: true } },
    },
  })

  // มติ PO U96 #11 — ยอดบิลของลูกหนี้ = **ยอดตามเอกสาร** (ใบแจ้งหนี้ − ใบลดหนี้ + ใบเพิ่มหนี้) นิยามเดียวกับพอร์ทัล
  const documented = await withDocumentedArTotals(organizationId, rows)

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
