import type { CreditNoteTotals } from '@/lib/credit-notes/types'
import type { CreditNoteType } from '@/lib/generated/prisma/enums'
import { prisma } from '@/lib/prisma'

/**
 * ยอดรวมใบลดหนี้/ใบเพิ่มหนี้ **active** ต่อใบกำกับ — แยกจาก `lib/credit-notes/queries.ts` เพราะยอดค้างตามเอกสาร
 * (`lib/portal/documented-amounts.ts`) ต้องใช้ และ queries.ts ก็ใช้ยอดค้างตามเอกสาร ⇒ ตัด import วน (staging S-008)
 */

export const EMPTY_CREDIT_NOTE_TOTALS: CreditNoteTotals = { amountBeforeVatSatang: 0, vatSatang: 0, totalSatang: 0, count: 0 }

/**
 * ยอดรวมใบลดหนี้ **active** ต่อใบกำกับ (หลายใบในคำสั่งเดียว — กัน N+1) · ใบที่ไม่มีใบลดหนี้ได้ยอด 0
 * `noteType` ไม่ส่ง = ใบลดหนี้ · `'debit'` = รวมใบเพิ่มหนี้ (U19) — **ไม่ปนกันสองชนิดในผลเดียว**
 * ⚠️ ไม่ตรวจสิทธิ์ — ผู้เรียก (portal/route) ต้องกรองใบกำกับตาม scope ของตัวเองมาก่อน
 */
export async function sumCreditNotesByInvoice(
  taxInvoiceIds: readonly string[],
  options: {
    organizationId?: string
    noteType?: CreditNoteType
    /** มติ O75 — อ่านใน transaction เดียวกับการบันทึก/ยกเลิกเอกสาร (ไม่ส่ง = `prisma`) */
    client?: Pick<typeof prisma, 'creditNote'>
  } = {},
): Promise<Map<string, CreditNoteTotals>> {
  const result = new Map<string, CreditNoteTotals>(taxInvoiceIds.map((id) => [id, { ...EMPTY_CREDIT_NOTE_TOTALS }]))
  if (taxInvoiceIds.length === 0) return result
  const groups = await (options.client ?? prisma).creditNote.groupBy({
    by: ['taxInvoiceId'],
    where: {
      taxInvoiceId: { in: [...taxInvoiceIds] },
      status: 'active',
      noteType: options.noteType ?? 'credit',
      ...(options.organizationId === undefined ? {} : { organizationId: options.organizationId }),
    },
    _sum: { amountBeforeVatSatang: true, vatSatang: true, totalSatang: true },
    _count: { _all: true },
  })
  for (const group of groups) {
    result.set(group.taxInvoiceId, {
      amountBeforeVatSatang: group._sum.amountBeforeVatSatang ?? 0,
      vatSatang: group._sum.vatSatang ?? 0,
      totalSatang: group._sum.totalSatang ?? 0,
      count: group._count._all,
    })
  }
  return result
}

/** ยอดรวมใบลดหนี้ (หรือใบเพิ่มหนี้ตาม `noteType`) **active** ของใบกำกับหนึ่งใบ (ไม่มี = 0) — ไม่ตรวจสิทธิ์ */
export async function sumCreditNotesForInvoice(
  taxInvoiceId: string,
  options: { organizationId?: string; noteType?: CreditNoteType } = {},
): Promise<CreditNoteTotals> {
  const totals = await sumCreditNotesByInvoice([taxInvoiceId], options)
  return totals.get(taxInvoiceId) ?? { ...EMPTY_CREDIT_NOTE_TOTALS }
}
