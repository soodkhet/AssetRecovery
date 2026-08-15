import type { Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import {
  buildExceptionSummaryReport,
  type ExceptionPeriodEntry,
} from '@/lib/reports/accounting/exception-summary-report'
import {
  buildExportHistoryReport,
  type ExportHistoryEntry,
} from '@/lib/reports/accounting/export-history-report'
import {
  accountingPeriodWindow,
  type AccountingPeriodWindow,
} from '@/lib/reports/accounting/period-window'
import {
  buildTaxInvoiceReport,
  TAX_INVOICE_DIMENSIONS,
  type TaxInvoiceDimension,
  type TaxInvoiceEntry,
} from '@/lib/reports/accounting/tax-invoice-report'
import {
  buildWhtSummaryReport,
  type WhtFilingSummaryEntry,
} from '@/lib/reports/accounting/wht-summary-report'
import { pickParam } from '@/lib/reports/finance/providers'
import type { ReportData } from '@/lib/reports/payload'
import { resolveReportPeriod, toIsoDateOnly } from '@/lib/reports/period'
import type { ReportContext, ReportProvider } from '@/lib/reports/providers'

/**
 * ตัวคำนวณของ **รายงานหมวด A (A1–A4)** — ชั้น DB ของ `96` §6-A
 *
 * ### กติกาที่ห้ามหลุด (ทั้งไฟล์)
 * - **อ่านอย่างเดียว** (`96` §1/§15) — ไม่มี mutation ⇒ ไม่มี audit
 * - กรอง `organization_id` ทุก query เสมอ (multi-tenant — Rule 02)
 * - **ยอดทุกก้อนมาจากเอกสารที่บันทึกไว้แล้ว** (`33`/`31`/`37`/`34`) ห้ามคำนวณภาษีใหม่ในรายงาน
 *   — สรุป WHT อ่าน `wht_filing_summaries` (ใบที่ยกเลิกถูกตัดออกตั้งแต่ชั้น 4.5 แล้ว) ·
 *   ยอดใบกำกับภาษีอ่าน snapshot ของบันทึกขาย (VAT ห้าม hardcode — Rule 01)
 * - **สูตร/การจัดกลุ่มอยู่ในโมดูล pure** (`lib/reports/accounting/*-report.ts`) ไฟล์นี้ทำแค่
 *   "ดึงข้อมูล → ส่งเข้าโมดูล pure"
 * - หมวด A เป็นรายงาน**ระดับองค์กร** (งวดบัญชี/ภาษี) ไม่มีมิติทีม ⇒ ไม่ใช้ `ctx.teamIds`
 *   (ผู้ที่เห็นได้คือบัญชี/ผู้บริหารซึ่งเป็น scope ระดับองค์กรอยู่แล้ว — ยามอยู่ที่ `lib/reports/access.ts`)
 * - แคช: ทั้งหมวดเป็น **real-time** (`96` §8) — `runReport()` จัดการให้แล้ว provider ห้ามแตะ
 */

// ── ตัวช่วยร่วม ──────────────────────────────────────────────────────────────

/**
 * ตัวกรอง "งวดบัญชีที่อยู่ในช่วงที่เลือก" — เทียบ `(year_be, month)` แบบ lexicographic
 * (ไม่ใช้การไล่แจกแจงทุกเดือน เพราะช่วงแบบกำหนดเองอาจกินหลายปี)
 */
function periodWindowFilter(window: AccountingPeriodWindow): Prisma.AccountingPeriodWhereInput {
  return {
    AND: [
      { OR: [{ yearBe: { gt: window.start.yearBe } }, { yearBe: window.start.yearBe, month: { gte: window.start.month } }] },
      { OR: [{ yearBe: { lt: window.end.yearBe } }, { yearBe: window.end.yearBe, month: { lte: window.end.month } }] },
    ],
  }
}

// ── A1 — สรุป WHT รายเดือน (`96` §6-A1) ─────────────────────────────────────

const whtSummaryProvider: ReportProvider = async (ctx: ReportContext): Promise<ReportData> => {
  const window = accountingPeriodWindow(ctx.range)

  const rows = await prisma.whtFilingSummary.findMany({
    where: { organizationId: ctx.user.organizationId, period: periodWindowFilter(window) },
    select: {
      periodId: true,
      periodLabel: true,
      filingDueDate: true,
      pnd3Satang: true,
      pnd53Satang: true,
      status: true,
      period: { select: { yearBe: true, month: true } },
    },
  })

  const filings: WhtFilingSummaryEntry[] = rows.map((row) => ({
    periodId: row.periodId,
    periodLabel: row.periodLabel,
    yearBe: row.period.yearBe,
    month: row.period.month,
    filingDueDate: row.filingDueDate,
    pnd3Satang: row.pnd3Satang,
    pnd53Satang: row.pnd53Satang,
    status: row.status,
  }))

  return buildWhtSummaryReport({ filings, asOf: ctx.now })
}

// ── A2 — สรุปใบกำกับภาษี (`96` §6-A2) ───────────────────────────────────────

const taxInvoiceProvider: ReportProvider = async (ctx: ReportContext): Promise<ReportData> => {
  const dimension = pickParam<TaxInvoiceDimension>(ctx.params['dimension'], TAX_INVOICE_DIMENSIONS, 'month')

  const rows = await prisma.taxInvoice.findMany({
    where: {
      organizationId: ctx.user.organizationId,
      // `invoice_date` เป็นคอลัมน์ `DATE` (วันตามปฏิทินไทยอยู่แล้ว) ⇒ เทียบกับขอบช่วงตรง ๆ
      invoiceDate: { gte: ctx.range.startDate, lte: ctx.range.endDate },
    },
    select: {
      id: true,
      invoiceDate: true,
      status: true,
      salesRecord: {
        select: {
          totalBeforeVatSatang: true,
          vatSatang: true,
          totalSatang: true,
          companyId: true,
          company: { select: { name: true } },
        },
      },
    },
  })

  const invoices: TaxInvoiceEntry[] = rows.map((row) => {
    const group =
      dimension === 'company'
        ? {
            groupKey: row.salesRecord.companyId,
            groupLabel: row.salesRecord.company.name,
            groupSort: row.salesRecord.company.name,
          }
        : monthGroupOf(row.invoiceDate)

    return {
      ...group,
      invoiceId: row.id,
      cancelled: row.status === 'cancelled',
      totalBeforeVatSatang: row.salesRecord.totalBeforeVatSatang,
      vatSatang: row.salesRecord.vatSatang,
      totalSatang: row.salesRecord.totalSatang,
    }
  })

  return buildTaxInvoiceReport({ dimension, invoices })
}

/** กลุ่มรายเดือนของวันที่บนใบกำกับภาษี — ป้าย พ.ศ. จาก `resolveReportPeriod()` (3.8) */
function monthGroupOf(date: Date): Pick<TaxInvoiceEntry, 'groupKey' | 'groupLabel' | 'groupSort'> {
  const period = resolveReportPeriod('month', date)
  const sort = toIsoDateOnly(period.startDate)
  return { groupKey: sort, groupLabel: period.label, groupSort: sort }
}

// ── A3 — สถานะส่งออกชุดข้อมูลบัญชี (`96` §6-A3) ─────────────────────────────

/** ไฟล์หลักของชุดคือคีย์ `01`–`08` (`37` §6.1) — หน้าปก/ไฟล์ .zip ไม่ใช่ไฟล์ข้อมูล */
function mainFileCountOf(fileUrls: Prisma.JsonValue): number {
  if (fileUrls === null || typeof fileUrls !== 'object' || Array.isArray(fileUrls)) return 0
  return Object.entries(fileUrls).filter(([key, value]) => typeof value === 'string' && /^\d{2}$/.test(key)).length
}

const exportHistoryProvider: ReportProvider = async (ctx: ReportContext): Promise<ReportData> => {
  const window = accountingPeriodWindow(ctx.range)

  const periods = await prisma.accountingPeriod.findMany({
    where: { organizationId: ctx.user.organizationId, ...periodWindowFilter(window) },
    select: {
      id: true,
      periodLabel: true,
      yearBe: true,
      month: true,
      exportRecords: {
        select: {
          id: true,
          version: true,
          status: true,
          fileUrls: true,
          sentAt: true,
          sentByUser: { select: { fullName: true } },
        },
      },
    },
  })

  const entries: ExportHistoryEntry[] = periods.flatMap((period): ExportHistoryEntry[] => {
    const base = { periodId: period.id, periodLabel: period.periodLabel, yearBe: period.yearBe, month: period.month }
    // งวดที่ยังไม่เคย export ต้องมีแถวของตัวเอง (`37` — "ยังไม่ส่งออก" ไม่ใช่ "ไม่มีข้อมูล")
    if (period.exportRecords.length === 0) {
      return [{ ...base, recordId: null, version: null, status: null, sentAt: null, sentByName: null, fileCount: null }]
    }
    return period.exportRecords.map((record) => ({
      ...base,
      recordId: record.id,
      version: record.version,
      status: record.status,
      sentAt: record.sentAt,
      sentByName: record.sentByUser?.fullName ?? null,
      fileCount: mainFileCountOf(record.fileUrls),
    }))
  })

  return buildExportHistoryReport({ entries })
}

// ── A4 — Exception Summary รายงวด (`96` §6-A4) ──────────────────────────────

const exceptionSummaryProvider: ReportProvider = async (ctx: ReportContext): Promise<ReportData> => {
  const window = accountingPeriodWindow(ctx.range)
  const organizationId = ctx.user.organizationId

  const [periods, counts] = await Promise.all([
    prisma.accountingPeriod.findMany({
      where: { organizationId, ...periodWindowFilter(window) },
      select: { id: true, periodLabel: true, yearBe: true, month: true },
    }),
    prisma.exception.groupBy({
      by: ['periodId', 'level', 'status'],
      where: { organizationId, period: periodWindowFilter(window) },
      _count: { _all: true },
    }),
  ])

  const byPeriod = new Map<string, ExceptionPeriodEntry>(
    periods.map((period) => [
      period.id,
      {
        periodId: period.id,
        periodLabel: period.periodLabel,
        yearBe: period.yearBe,
        month: period.month,
        counts: [],
      },
    ]),
  )

  for (const group of counts) {
    const entry = byPeriod.get(group.periodId)
    if (entry === undefined) continue
    entry.counts = [...entry.counts, { level: group.level, status: group.status, count: group._count._all }]
  }

  return buildExceptionSummaryReport({ periods: [...byPeriod.values()] })
}

/** ทะเบียนของหมวด A — `lib/reports/providers.ts` เอาไปต่อเข้า `REPORT_PROVIDERS` */
export const ACCOUNTING_REPORT_PROVIDERS: Readonly<Record<string, ReportProvider>> = {
  'wht-summary': whtSummaryProvider,
  'tax-invoice': taxInvoiceProvider,
  'export-history': exportHistoryProvider,
  'exception-summary': exceptionSummaryProvider,
}
