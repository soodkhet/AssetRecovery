'use client'

import { useMemo, useState } from 'react'
import { PortalKpiTile } from '@/components/portal/portal-kpi-card'
import { usePortalApiUrl } from '@/components/portal/portal-scope'
import { usePortalData } from '@/components/portal/use-portal-data'
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  FilterGroup,
  InlineAlert,
  LoadingState,
  PageHeader,
  RefText,
  StatusBadge,
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tr,
  cn,
} from '@/components/ui'
import { fmtDate, fmtDateTime } from '@/lib/format/datetime'
import { fmtCount, fmtSatangSymbol } from '@/lib/format/money'
import {
  bangkokToday,
  filterPortalBillingRows,
  isPortalBillingOverdue,
  PORTAL_CUSTOMER_WHT_NOTICE,
  portalAlertTone,
  portalBillingFilterOptions,
  portalHasCustomerWht,
  portalBillingSummary,
  type PortalBillingFilter,
} from '@/lib/portal/finance-ui'
import type { PortalBillingBatchDto } from '@/lib/portal/serializers'
import { DEBIT_NOTE_OUTSTANDING_LABEL } from '@/lib/revenue/revenue-ui'

const FILTER_OPTIONS = portalBillingFilterOptions()

/**
 * หน้า "รอบวางบิล / ยอดค้างชำระ" ของพอร์ทัล — `GET /api/portal/billing-batches` (`97` §6.2 · mockup `renderBilling()`
 * desktop / `renderFinance()` มือถือ) · อ่านอย่างเดียว · API ส่งเฉพาะรอบที่ส่งบิลแล้วขึ้นไป (draft ไม่มีทางมาถึง)
 *
 * ยอดค้างต่อรอบมาจาก API (สูตรกลางฝั่ง server) — หน้านี้แค่รวมยอดค้างของรอบที่แสดงเพื่อทำการ์ดสรุป
 * · ยอดรวม = ยอดตามใบกำกับที่ออกจริง (มติ U14) · รวม = ชำระแล้ว + ภาษีที่ลูกค้าหัก + ค้างชำระ (มติ U11)
 * · เลขที่รอบวางบิล + จำนวนเคส ตาม mockup (มติ U62)
 */
/**
 * มติ PO U95 — `canDownload` = มี `portal_download` ⇒ แสดงลิงก์ "ใบแจ้งหนี้ PDF" ต่อรอบ (ไม่ใช่เอกสารภาษี)
 * ชั้น UX เท่านั้น — API ตรวจสิทธิ์/บริษัทซ้ำเสมอ (DEC-002)
 */
export function PortalBillingBatches({ canDownload = false }: { canDownload?: boolean }) {
  const state = usePortalData<PortalBillingBatchDto[]>('/api/portal/billing-batches')
  const [filter, setFilter] = useState<PortalBillingFilter>('all')
  const today = bangkokToday()

  const rows = useMemo(() => state.data ?? [], [state.data])
  const summary = useMemo(() => portalBillingSummary(rows, today), [rows, today])
  const filtered = useMemo(() => filterPortalBillingRows(rows, filter), [rows, filter])
  const ready = !state.loading && state.error === null && state.data !== null

  return (
    <div>
      <PageHeader
        title="รอบวางบิล / ยอดค้างชำระ"
        description="แสดงเฉพาะรอบที่ส่งบิลถึงบริษัทของท่านแล้ว (รอบที่ยังจัดทำอยู่จะไม่ปรากฏที่นี่)"
      />

      {ready && rows.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
          <div className="col-span-2 md:col-span-1">
            <PortalKpiTile
              label="ยอดค้างชำระรวม"
              value={fmtSatangSymbol(summary.outstandingSatang)}
              hint={
                summary.overdueCount > 0
                  ? `เลยกำหนด ${fmtCount(summary.overdueCount)} รอบ · ${fmtSatangSymbol(summary.overdueSatang)}`
                  : 'ทุกรอบที่ยังชำระไม่ครบ'
              }
              tone={portalAlertTone(summary.outstandingSatang)}
            />
          </div>
          <PortalKpiTile label="รอบที่ยังค้างชำระ" value={fmtCount(summary.openCount)} hint="รอบ" tone="amber" />
          <PortalKpiTile label="รอบวางบิลทั้งหมด" value={fmtCount(summary.batchCount)} hint="ที่ส่งบิลแล้ว" tone="slate" />
        </div>
      )}

      <Card padded={ready}>
        {state.loading ? (
          <LoadingState />
        ) : state.error !== null ? (
          <ErrorState
            title={state.error.title}
            message={state.error.message}
            {...(state.error.code === undefined ? {} : { code: state.error.code })}
            action={
              <Button variant="secondary" onClick={state.reload}>
                ลองใหม่
              </Button>
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState title="ยังไม่มีรอบวางบิล" description="เมื่อมีการส่งบิลถึงบริษัทของท่าน รายการจะแสดงที่นี่" />
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <FilterGroup options={FILTER_OPTIONS} value={filter} onChange={setFilter} />
              <div className="ml-auto text-xs text-slate-400">ทั้งหมด {fmtCount(filtered.length)} รายการ</div>
            </div>
            {filtered.length === 0 ? (
              <EmptyState title="ไม่พบรอบวางบิลที่ตรงกับเงื่อนไข" />
            ) : (
              <>
                <BillingTable rows={filtered} today={today} canDownload={canDownload} />
                <BillingCards rows={filtered} today={today} canDownload={canDownload} />
                {portalHasCustomerWht(filtered) && (
                  <InlineAlert tone="info" className="mt-4" title="ภาษีหัก ณ ที่จ่ายที่บริษัทของท่านหักไว้">
                    {PORTAL_CUSTOMER_WHT_NOTICE} · ยอดรวม = ชำระแล้ว + ภาษีหัก ณ ที่จ่าย + ค้างชำระ
                  </InlineAlert>
                )}
              </>
            )}
          </>
        )}
      </Card>
    </div>
  )
}

function OutstandingText({ satang, className }: { satang: number; className?: string }) {
  return satang > 0 ? (
    <span className={cn('font-bold text-red-600', className)}>{fmtSatangSymbol(satang)}</span>
  ) : (
    <span className={cn('text-slate-300', className)}>—</span>
  )
}

function BatchNumber({ value }: { value: string }) {
  return <RefText className="text-xs font-semibold">{value}</RefText>
}

/** ลิงก์ใบแจ้งหนี้/ใบวางบิล PDF (มติ U95 — ไม่ใช่ใบกำกับภาษี) · โหมดดูแทนแนบ `as` ผ่าน `usePortalApiUrl` */
function BillingInvoiceLink({ row }: { row: PortalBillingBatchDto }) {
  const apiUrl = usePortalApiUrl()
  return (
    <a
      className="text-[11px] font-semibold text-blue-700 hover:underline"
      href={apiUrl(`/api/portal/billing-batches/${encodeURIComponent(row.id)}/invoice-pdf`)}
      target="_blank"
      rel="noreferrer"
    >
      ใบแจ้งหนี้ PDF
    </a>
  )
}

function CustomerWhtText({ satang, className }: { satang: number; className?: string }) {
  return satang > 0 ? (
    <span className={cn('font-semibold text-slate-700', className)}>{fmtSatangSymbol(satang)}</span>
  ) : (
    <span className={cn('text-slate-300', className)}>—</span>
  )
}

function DueDate({ row, today }: { row: PortalBillingBatchDto; today: string }) {
  const overdue = isPortalBillingOverdue(row, today)
  return (
    <span className={overdue ? 'font-semibold text-red-600' : 'text-slate-500'}>
      {fmtDate(row.dueDate)}
      {overdue && <span className="ml-1 text-[11px]">(เลยกำหนด)</span>}
    </span>
  )
}

/** desktop — ตาราง (md+) */
function BillingTable({
  rows,
  today,
  canDownload,
}: {
  rows: readonly PortalBillingBatchDto[]
  today: string
  canDownload: boolean
}) {
  return (
    <Table className="hidden md:block">
      <THead>
        <tr>
          <Th>เลขที่รอบวางบิล</Th>
          <Th>รอบเดือน</Th>
          <Th numeric>จำนวนเคส</Th>
          <Th numeric>ยอดรวม</Th>
          <Th numeric>ชำระแล้ว</Th>
          <Th numeric>ภาษีหัก ณ ที่จ่าย (ลูกค้าหัก)</Th>
          <Th numeric>ค้างชำระ</Th>
          <Th>ครบกำหนด</Th>
          <Th>ส่งบิลเมื่อ</Th>
          <Th>สถานะ</Th>
        </tr>
      </THead>
      <TBody>
        {rows.map((row) => (
          <Tr key={row.id} className={row.outstandingSatang > 0 ? 'bg-red-50/20' : undefined}>
            <Td className="whitespace-nowrap">
              <BatchNumber value={row.batchNumber} />
              {canDownload && (
                <div>
                  <BillingInvoiceLink row={row} />
                </div>
              )}
            </Td>
            <Td className="font-semibold whitespace-nowrap">{row.period}</Td>
            <Td numeric>{fmtCount(row.caseCount)}</Td>
            <Td numeric className="font-semibold">
              {fmtSatangSymbol(row.totalSatang)}
            </Td>
            <Td numeric className="text-emerald-600">
              {fmtSatangSymbol(row.receivedSatang)}
            </Td>
            <Td numeric>
              <CustomerWhtText satang={row.customerWhtSatang} />
            </Td>
            <Td numeric>
              <OutstandingText satang={row.outstandingSatang} />
            </Td>
            <Td className="text-xs whitespace-nowrap">
              <DueDate row={row} today={today} />
            </Td>
            <Td className="text-xs whitespace-nowrap text-slate-500">{fmtDateTime(row.sentAt)}</Td>
            <Td>
              <BillingStatus row={row} />
            </Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  )
}

/**
 * ป้ายสถานะรอบ — มติ O74: รอบที่รับชำระครบแล้วแต่ยังค้างจากใบเพิ่มหนี้ ⇒ API ส่งป้าย "รับชำระบางส่วน"
 * มาแล้ว + ป้ายเสริม "มีใบเพิ่มหนี้ค้าง" (ป้ายเดียวกับหน้าภายใน)
 */
function BillingStatus({ row }: { row: PortalBillingBatchDto }) {
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1">
      <StatusBadge group={row.statusDisplay.tone} label={row.statusDisplay.label} />
      {row.debitNoteOutstanding && <StatusBadge group="pending" label={DEBIT_NOTE_OUTSTANDING_LABEL} />}
    </span>
  )
}

/** มือถือ — การ์ดต่อรอบ (mockup มือถือ `renderFinance()`) */
function BillingCards({
  rows,
  today,
  canDownload,
}: {
  rows: readonly PortalBillingBatchDto[]
  today: string
  canDownload: boolean
}) {
  return (
    <ul className="space-y-2 md:hidden">
      {rows.map((row) => (
        <li key={row.id} className="rounded-xl border border-slate-200 bg-white p-3.5">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-800">รอบ {row.period}</div>
              <div className="text-[12px] text-slate-400">
                <BatchNumber value={row.batchNumber} /> · {fmtCount(row.caseCount)} เคส
              </div>
            </div>
            <BillingStatus row={row} />
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-2 text-center">
            <div>
              <div className="text-[12px] text-slate-400">ยอดรวม</div>
              <div className="text-xs font-bold">{fmtSatangSymbol(row.totalSatang)}</div>
            </div>
            <div>
              <div className="text-[12px] text-slate-400">ชำระแล้ว</div>
              <div className="text-xs font-bold text-emerald-600">{fmtSatangSymbol(row.receivedSatang)}</div>
            </div>
            <div>
              <div className="text-[12px] text-slate-400">ภาษีหัก ณ ที่จ่าย (ลูกค้าหัก)</div>
              <CustomerWhtText satang={row.customerWhtSatang} className="text-xs" />
            </div>
            <div>
              <div className="text-[12px] text-slate-400">ค้างชำระ</div>
              <OutstandingText satang={row.outstandingSatang} className="text-xs" />
            </div>
          </div>
          <div className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 text-[13px] text-slate-400">
            <span>
              ครบกำหนด <DueDate row={row} today={today} />
            </span>
            <span>ส่งเมื่อ {fmtDateTime(row.sentAt)}</span>
            {canDownload && <BillingInvoiceLink row={row} />}
          </div>
        </li>
      ))}
    </ul>
  )
}
