import { sumSatang } from '@/lib/finance/satang'
import { ROW_KEY, type ReportColumn, type ReportData, type ReportRow } from '@/lib/reports/payload'

/**
 * **A2 — สรุปใบกำกับภาษี** (`96` §6-A2) — ชั้น **pure ล้วน ไม่มี I/O**
 *
 * ### กติกาที่ห้ามหลุด
 * - **ใบที่ `cancelled` ไม่ถูกนับในยอดและใน "จำนวนใบ"** แต่ต้องขึ้นให้เห็นในคอลัมน์ "ยกเลิก" เสมอ
 *   (`31` §8 — ใบที่ยกเลิกห้ามลบห้าม reverse ⇒ ต้องตามรอยได้ว่ารอบไหนมีการยกเลิกกี่ใบ)
 * - ยอดก่อน VAT / VAT / สุทธิ มาจาก **บันทึกขาย** ที่ snapshot ไว้ตอนออกใบ (`19` §6.3 · `31` §7)
 *   — VAT **ห้าม hardcode 7%** และห้ามคำนวณย้อนหลังจากอัตราปัจจุบัน (Rule 01)
 * - 1 บันทึกขายออกใบแทนได้หลายครั้ง (ยกเลิกแล้วออกใหม่) ⇒ ยอดของกลุ่มคือผลรวมของ**ใบที่ยังใช้งาน**
 *   เท่านั้น ใบที่ถูกแทนที่ไปแล้วอยู่ในคอลัมน์ "ยกเลิก"
 */

export const TAX_INVOICE_DIMENSIONS = ['month', 'company'] as const
export type TaxInvoiceDimension = (typeof TAX_INVOICE_DIMENSIONS)[number]

export const TAX_INVOICE_DIMENSION_LABEL: Readonly<Record<TaxInvoiceDimension, string>> = {
  month: 'รายเดือน',
  company: 'รายบริษัทไฟแนนซ์',
}

const GROUP_HEADER: Readonly<Record<TaxInvoiceDimension, string>> = {
  month: 'รอบเดือน',
  company: 'บริษัทไฟแนนซ์',
}

/** 1 แถว = 1 ใบกำกับภาษี (ยอดของบันทึกขายที่ใบนั้นอ้างถึง) */
export interface TaxInvoiceEntry {
  invoiceId: string
  groupKey: string
  groupLabel: string
  /** คีย์เรียงกลุ่ม (เดือน = `YYYY-MM-DD` ของวันแรกของเดือน · บริษัท = ชื่อบริษัท) */
  groupSort: string
  cancelled: boolean
  totalBeforeVatSatang: number
  vatSatang: number
  totalSatang: number
}

function columnsOf(dimension: TaxInvoiceDimension): readonly ReportColumn[] {
  return [
    { key: 'group', header: GROUP_HEADER[dimension], type: 'text', width: 24 },
    { key: 'invoiceCount', header: 'จำนวนใบ', type: 'number' },
    { key: 'beforeVatSatang', header: 'ยอดรวมก่อน VAT', type: 'money' },
    { key: 'vatSatang', header: 'VAT รวม', type: 'money' },
    { key: 'totalSatang', header: 'ยอดรวมสุทธิ', type: 'money' },
    { key: 'cancelledCount', header: 'ยกเลิก (ใบ)', type: 'number', tone: 'warning' },
  ]
}

interface Bucket {
  groupKey: string
  groupLabel: string
  groupSort: string
  invoiceCount: number
  cancelledCount: number
  beforeVatSatang: number
  vatSatang: number
  totalSatang: number
}

export function buildTaxInvoiceReport(input: {
  dimension: TaxInvoiceDimension
  invoices: readonly TaxInvoiceEntry[]
}): ReportData {
  const { dimension, invoices } = input

  const buckets = new Map<string, Bucket>()
  for (const invoice of invoices) {
    const bucket = buckets.get(invoice.groupKey) ?? {
      groupKey: invoice.groupKey,
      groupLabel: invoice.groupLabel,
      groupSort: invoice.groupSort,
      invoiceCount: 0,
      cancelledCount: 0,
      beforeVatSatang: 0,
      vatSatang: 0,
      totalSatang: 0,
    }
    if (invoice.cancelled) {
      bucket.cancelledCount += 1
    } else {
      bucket.invoiceCount += 1
      bucket.beforeVatSatang += invoice.totalBeforeVatSatang
      bucket.vatSatang += invoice.vatSatang
      bucket.totalSatang += invoice.totalSatang
    }
    buckets.set(invoice.groupKey, bucket)
  }

  const sorted = [...buckets.values()].sort(
    (a, b) => a.groupSort.localeCompare(b.groupSort, 'th') || a.groupLabel.localeCompare(b.groupLabel, 'th'),
  )

  const rows: ReportRow[] = sorted.map((bucket) => ({
    [ROW_KEY]: bucket.groupKey,
    group: bucket.groupLabel,
    invoiceCount: bucket.invoiceCount,
    beforeVatSatang: bucket.beforeVatSatang,
    vatSatang: bucket.vatSatang,
    totalSatang: bucket.totalSatang,
    // ไม่มีใบยกเลิกเลย ⇒ `null` (แสดง "—") ไม่ใช่ 0 — ตรงกับ mockup และอ่านง่ายกว่า
    cancelledCount: bucket.cancelledCount === 0 ? null : bucket.cancelledCount,
  }))

  const beforeVatTotal = sumSatang(sorted.map((bucket) => bucket.beforeVatSatang), 'ยอดก่อน VAT รวม')
  const vatTotal = sumSatang(sorted.map((bucket) => bucket.vatSatang), 'VAT รวม')
  const netTotal = sumSatang(sorted.map((bucket) => bucket.totalSatang), 'ยอดสุทธิรวม')
  const invoiceCount = sorted.reduce((total, bucket) => total + bucket.invoiceCount, 0)
  const cancelledCount = sorted.reduce((total, bucket) => total + bucket.cancelledCount, 0)

  return {
    columns: columnsOf(dimension),
    rows,
    kpis: [
      {
        key: 'invoiceCount',
        label: 'ใบกำกับภาษีที่ใช้งาน',
        value: invoiceCount,
        type: 'number',
        hint: cancelledCount === 0 ? 'ไม่มีใบที่ถูกยกเลิก' : `ยกเลิก ${cancelledCount.toLocaleString('th-TH')} ใบ`,
      },
      { key: 'beforeVat', label: 'ยอดรวมก่อน VAT', value: beforeVatTotal, type: 'money' },
      { key: 'vat', label: 'VAT รวม', value: vatTotal, type: 'money' },
      { key: 'net', label: 'ยอดรวมสุทธิ', value: netTotal, type: 'money' },
    ],
    totalRow:
      rows.length === 0
        ? null
        : {
            group: 'รวมทั้งหมด',
            invoiceCount,
            beforeVatSatang: beforeVatTotal,
            vatSatang: vatTotal,
            totalSatang: netTotal,
            cancelledCount: cancelledCount === 0 ? null : cancelledCount,
          },
    note:
      'ใบกำกับภาษีที่ถูกยกเลิกไม่ถูกนับในยอดและในจำนวนใบ แต่ยังแสดงจำนวนไว้ในคอลัมน์สุดท้าย (ห้ามลบใบที่ยกเลิก — ไฟล์ 31) · ' +
      'ยอด VAT เป็นค่าที่บันทึกไว้ตอนออกใบตามอัตราที่มีผลในวันนั้น ไม่ได้คำนวณย้อนหลังจากอัตราปัจจุบัน · ' +
      'จัดกลุ่มตามวันที่บนใบกำกับภาษี (ปฏิทินไทย)',
  }
}
