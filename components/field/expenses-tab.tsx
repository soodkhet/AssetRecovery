'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSession } from '@/components/auth/permission-provider'
import { FileViewerModal } from '@/components/cases/file-viewer-modal'
import { HotelClaimModal } from '@/components/field/hotel-claim-modal'
import { hotelNightsCapText, receiptInCompanyNameText } from '@/lib/field/hotel-claim'
import { IconAlert, IconChevronRight, IconFile, IconPlus } from '@/components/field/field-icons'
import { ResubmitExpenseModal } from '@/components/field/resubmit-expense-modal'
import { PAYMENT_INFO_INCOMPLETE_LABEL } from '@/components/payees/payment-info-incomplete-badge'
import { Button, EmptyState, ErrorState, InlineAlert, LoadingState, Select, StatusBadge } from '@/components/ui'
import { cn } from '@/components/ui/cn'
import { apiPath } from '@/lib/api/contract'
import { callApi, type ApiCallError } from '@/lib/api/types'
import {
  CASE_BOUND_STATUS_FILTERS,
  EXPENSE_STATUS_FILTER_LABEL,
  EXPENSE_TYPE_ICON,
  expenseReceiptFile,
  SEPARATE_STATUS_FILTERS,
  expenseStatusBadgeGroup,
  expenseStatusLabel,
  expenseTypeLabel,
  filterCaseGroups,
  filterSeparateExpenses,
  groupExpensesByCase,
  splitExpensesNeedingRevision,
  type ExpenseCaseGroup,
  type ExpenseReceiptFile,
  type ExpenseStatusFilter,
} from '@/lib/field/expense-ui'
import { ALL_MONTHS, monthKeyOfDateOnly, monthOptions } from '@/lib/field/month-filter'
import type { ExpenseViewType } from '@/lib/field/schemas'
import type { FieldExpenseDto, FieldExpenseListDto } from '@/lib/field/types'
import { fmtDate } from '@/lib/format/datetime'
import { fmtSatangSymbol } from '@/lib/format/money'
import { SubstituteReceiptPanel } from '@/components/substitute-receipts/substitute-receipt-panel'

/**
 * แท็บ "เบิกค่าใช้จ่าย" (`41` §7.9) — 2 ขอบแท็บที่โหลดคนละชุดจาก `GET /api/field/expenses?type=`
 *
 * - **ผูกกับเคส**: ระบบสร้างให้อัตโนมัติตอนปิดงาน ⇒ **ไม่มีปุ่มยืนยัน/สร้างของพนักงาน** (`41` §11)
 *   1 เคส = 1 แถวสรุป กดขยายดูรายละเอียด · รายการรอบก่อนที่ถูกแทนที่แยกบล็อกล่าง (§10.1)
 * - **เบิกแยก**: ฟอร์มเบิกที่พัก + filter สถานะ **และเดือน** (สะสมข้ามเวลาได้)
 * - รายการที่ถูกตีกลับ (`needs_revision`) ยกขึ้นบล็อกส้มบนสุดทั้ง 2 แท็บ — เจ้าของรายการเท่านั้นที่แก้ได้
 * - ยอดสรุปหัวจอมาจาก BE (ยอดของทั้งชุด ไม่ใช่ยอดหลังกรอง) ตาม §7.9
 */

function SummaryBox({ label, amountSatang, tone }: { label: string; amountSatang: number; tone: 'pending' | 'approved' }) {
  return (
    <div className={cn('rounded-xl p-3 text-center', tone === 'pending' ? 'bg-amber-50' : 'bg-emerald-50')}>
      <div className={cn('text-lg font-extrabold', tone === 'pending' ? 'text-amber-700' : 'text-emerald-700')}>
        {fmtSatangSymbol(amountSatang)}
      </div>
      <div className={cn('text-[11px] font-bold', tone === 'pending' ? 'text-amber-600' : 'text-emerald-600')}>
        {label}
      </div>
    </div>
  )
}

function StatusFilterSelect({
  value,
  options,
  onChange,
}: {
  value: ExpenseStatusFilter
  options: readonly ExpenseStatusFilter[]
  onChange: (next: ExpenseStatusFilter) => void
}) {
  return (
    <Select
      aria-label="กรองตามสถานะ"
      value={value}
      onChange={(event) => onChange(event.target.value as ExpenseStatusFilter)}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {EXPENSE_STATUS_FILTER_LABEL[option]}
        </option>
      ))}
    </Select>
  )
}

/** ปุ่มเปิดดูใบเสร็จที่แนบไว้ (UAT BUG-144) — ไม่มีใบเสร็จ = ไม่แสดง · เปิดผ่าน signed URL ของ API (สิทธิ์ตรวจที่ server) */
function ReceiptButton({ item, onView }: { item: FieldExpenseDto; onView: (file: ExpenseReceiptFile) => void }) {
  const receipt = expenseReceiptFile(item)
  if (receipt === null) return null
  return (
    <button
      type="button"
      onClick={() => onView(receipt)}
      className="focus-ring mt-1 inline-flex items-center gap-1 text-xs font-bold text-blue-600"
    >
      <IconFile className="h-3.5 w-3.5" /> ดูใบเสร็จ
    </button>
  )
}

function ExpenseLine({ item, muted = false }: { item: FieldExpenseDto; muted?: boolean }) {
  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-lg px-3 py-2 text-[13px]',
        muted ? 'bg-slate-100 text-slate-500 opacity-60' : 'bg-white text-slate-700',
      )}
    >
      <span className={cn('truncate', muted && 'line-through')}>
        {EXPENSE_TYPE_ICON[item.expenseType]} {expenseTypeLabel(item.expenseType)} · {fmtDate(item.expenseDate)}
        {item.distanceKm === null ? '' : ` · ${item.distanceKm} กม.`}
      </span>
      <span className={cn('font-bold', muted && 'line-through')}>{fmtSatangSymbol(item.grossSatang)}</span>
    </div>
  )
}

function CaseGroupCard({ group }: { group: ExpenseCaseGroup }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="overflow-hidden rounded-xl bg-slate-50">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        className="focus-ring flex w-full items-center justify-between px-3 py-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-extrabold text-slate-700">{group.debtorName ?? '—'}</span>
          <span className="mt-0.5 block truncate text-xs text-slate-400">
            {group.caseRef ?? '—'} · {group.items.length} รายการ
            {group.supersededItems.length > 0 && ` · ${group.supersededItems.length} รายการถูกแทนที่`}
          </span>
        </span>
        <span className="ml-2 flex shrink-0 items-center gap-2">
          <span className="text-base font-extrabold text-slate-800">{fmtSatangSymbol(group.totalSatang)}</span>
          <StatusBadge status={expenseStatusLabel(group.status)} group={expenseStatusBadgeGroup(group.status)} />
          <IconChevronRight className={cn('h-4 w-4 text-slate-400 transition-transform', expanded && 'rotate-90')} />
        </span>
      </button>

      {expanded && (
        <div className="space-y-1.5 border-t border-slate-200 px-3 pt-2 pb-3">
          {group.items.map((item) => (
            <ExpenseLine key={item.id} item={item} />
          ))}

          {group.supersededItems.length > 0 && (
            <div className="space-y-1.5 border-t border-dashed border-slate-200 pt-2">
              <div className="text-[11px] font-bold text-slate-400">
                รายการรอบก่อนหน้า (ถูกแทนที่แล้วหลังแก้ไขหลักฐาน)
              </div>
              {group.supersededItems.map((item) => (
                <ExpenseLine key={item.id} item={item} muted />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function NeedsRevisionBlock({
  items,
  onFix,
  onViewReceipt,
}: {
  items: readonly FieldExpenseDto[]
  onFix: (item: FieldExpenseDto) => void
  onViewReceipt: (file: ExpenseReceiptFile) => void
}) {
  if (items.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-bold text-orange-600">
        <IconAlert className="h-4 w-4" /> ถูกตีกลับ ต้องแก้ไขแล้วส่งใหม่ ({items.length})
      </div>
      {items.map((item) => (
        <div key={item.id} className="rounded-2xl border-2 border-orange-300 bg-orange-50 p-3.5">
          <div className="flex items-center justify-between gap-2.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-slate-800">
                {EXPENSE_TYPE_ICON[item.expenseType]} {expenseTypeLabel(item.expenseType)} ·{' '}
                {fmtSatangSymbol(item.grossSatang)}
              </div>
              <div className="mt-0.5 truncate text-xs text-slate-500">
                {item.caseRef ?? fmtDate(item.expenseDate)}
                {item.expenseType === 'hotel'
                  ? ` · ${hotelNightsCapText(item.hotelNights, item.hotelMaxPerNightSatang)}`
                  : ''}
                {item.rejectReason === null ? '' : ` · เหตุผล: ${item.rejectReason}`}
              </div>
              {item.note !== null && <div className="mt-0.5 truncate text-xs text-slate-500">หมายเหตุ: {item.note}</div>}
              {item.resubmitNote !== null && (
                <div className="mt-0.5 truncate text-xs text-slate-500">ชี้แจงครั้งก่อน: {item.resubmitNote}</div>
              )}
              <ReceiptButton item={item} onView={onViewReceipt} />
            </div>
            <Button onClick={() => onFix(item)}>แก้ไขและส่งใหม่</Button>
          </div>
        </div>
      ))}
    </div>
  )
}

export function ExpensesTab({ initialView = 'caseBound' }: { initialView?: ExpenseViewType }) {
  const session = useSession()
  const [view, setView] = useState<ExpenseViewType>(initialView)
  const [data, setData] = useState<FieldExpenseListDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ApiCallError | null>(null)
  const [statusFilter, setStatusFilter] = useState<ExpenseStatusFilter>('all')
  const [month, setMonth] = useState<string>(ALL_MONTHS)
  const [hotelFormOpen, setHotelFormOpen] = useState(false)
  const [fixing, setFixing] = useState<FieldExpenseDto | null>(null)
  const [viewingReceipt, setViewingReceipt] = useState<ExpenseReceiptFile | null>(null)

  const load = useCallback(async (type: ExpenseViewType) => {
    const response = await callApi<FieldExpenseListDto>(apiPath('field.expenseList', undefined, { type }))
    setData(response.data ?? null)
    setError(response.error ?? null)
    setLoading(false)
  }, [])

  useEffect(() => {
    void (async () => {
      await load(view)
    })()
  }, [load, view])

  /** สลับขอบแท็บ = ล้างตัวกรองของแท็บเดิมเสมอ (ชุดตัวเลือกคนละชุดกัน) */
  function switchView(next: ExpenseViewType): void {
    setLoading(true)
    setView(next)
    setStatusFilter('all')
    setMonth(ALL_MONTHS)
  }

  const items = data?.items ?? []
  const { needsRevision, rest } = splitExpensesNeedingRevision(items)
  const groups = filterCaseGroups(groupExpensesByCase(rest), statusFilter)
  const separateItems = filterSeparateExpenses(rest, statusFilter, month)
  const months = monthOptions(items.map((item) => monthKeyOfDateOnly(item.expenseDate)))

  return (
    <>
      {data?.paymentInfoIncomplete === true && (
        <div className="mb-2.5 lg:max-w-[480px]" data-testid="expense-payment-info-incomplete">
          <InlineAlert tone="warning" title={PAYMENT_INFO_INCOMPLETE_LABEL}>
            ข้อมูลรับเงินของคุณ (เลขผู้เสียภาษี ที่อยู่ หรือบัญชีธนาคาร) ยังไม่ครบ — ติดต่อการเงิน/ผู้ดูแลให้เติมข้อมูล
            ไม่งั้นรายการที่อนุมัติแล้วจะยังจ่ายเงินไม่ได้
          </InlineAlert>
        </div>
      )}
      <div
        className="mb-2.5 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-sm lg:max-w-[480px]"
        data-testid="expense-pending-all-tabs"
      >
        <span className="text-xs font-semibold text-slate-600">รอดำเนินการรวมทุกแท็บ</span>
        <span className="text-base font-extrabold text-amber-700">
          {fmtSatangSymbol(data?.pendingAllTabsSatang ?? 0)}
        </span>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-2.5 lg:max-w-[480px]">
        <SummaryBox label="รอดำเนินการในแท็บนี้" amountSatang={data?.pendingSatang ?? 0} tone="pending" />
        <SummaryBox label="อนุมัติแล้ว" amountSatang={data?.approvedSatang ?? 0} tone="approved" />
      </div>

      <div className="mb-4 flex rounded-xl bg-slate-100 p-1 lg:max-w-[320px]">
        {(
          [
            { id: 'caseBound', label: 'ผูกกับเคส' },
            { id: 'separate', label: 'เบิกแยก' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => switchView(tab.id)}
            className={cn(
              'focus-ring flex-1 rounded-lg py-2.5 text-[13px] font-extrabold',
              view === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingState message="กำลังโหลดรายการเบิก..." />
      ) : error !== null ? (
        <ErrorState title={error.title} message={error.message} code={error.code} />
      ) : (
        <div className="space-y-3">
          <NeedsRevisionBlock items={needsRevision} onFix={setFixing} onViewReceipt={setViewingReceipt} />

          {view === 'caseBound' ? (
            <>
              <StatusFilterSelect value={statusFilter} options={CASE_BOUND_STATUS_FILTERS} onChange={setStatusFilter} />
              <p className="text-xs text-slate-400">
                ระบบสร้างให้อัตโนมัติ ไม่ต้องทำเรื่องเบิกเอง — ค่าคอมมิชชั่น/เบี้ยเสี่ยง/ค่าน้ำมันตามระยะทางเกิดตอนปิดงาน ·
                ค่าน้ำมันเหมาจ่ายและเบี้ยเลี้ยงคิดวันละครั้งหลังจบวัน แล้วเฉลี่ยทุกเคสที่ลงพื้นที่วันนั้น
              </p>
              <PendingFieldDaysNotice dates={data?.pendingFieldDates ?? []} />
              {groups.length === 0 ? (
                <EmptyState title="ไม่พบรายการตามเงื่อนไขที่กรอง" />
              ) : (
                <div className="space-y-3">
                  {groups.map((group) => (
                    <CaseGroupCard key={group.caseId} group={group} />
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-slate-400">ค่าใช้จ่ายที่ไม่ผูกกับเคสเดียว ต้องทำเรื่องเบิกเอง</p>
                <button
                  type="button"
                  onClick={() => setHotelFormOpen(true)}
                  className="focus-ring flex shrink-0 items-center gap-1 text-xs font-extrabold text-blue-600"
                >
                  <IconPlus className="h-4 w-4" /> เบิกที่พัก
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <StatusFilterSelect value={statusFilter} options={SEPARATE_STATUS_FILTERS} onChange={setStatusFilter} />
                <Select aria-label="กรองตามเดือน" value={month} onChange={(event) => setMonth(event.target.value)}>
                  {months.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>

              {separateItems.length === 0 ? (
                <EmptyState title="ไม่พบรายการตามเงื่อนไขที่กรอง" description='กดปุ่ม "เบิกที่พัก" เพื่อสร้างคำขอใหม่' />
              ) : (
                <div className="space-y-1.5">
                  {separateItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-700">
                          {EXPENSE_TYPE_ICON[item.expenseType]} {item.note ?? expenseTypeLabel(item.expenseType)}
                        </div>
                        <div className="truncate text-xs text-slate-400">
                          วันที่ {fmtDate(item.expenseDate)}
                          {item.expenseType === 'hotel'
                            ? ` · ${hotelNightsCapText(item.hotelNights, item.hotelMaxPerNightSatang)} · ${receiptInCompanyNameText(item.receiptInCompanyName)}`
                            : ''}
                          {item.sharedWithName === null ? '' : ` · พักร่วมกับ ${item.sharedWithName}`}
                        </div>
                        {item.resubmitNote !== null && (
                          <div className="truncate text-xs text-slate-500">ชี้แจงตอนส่งใหม่: {item.resubmitNote}</div>
                        )}
                        <ReceiptButton item={item} onView={setViewingReceipt} />
                        {/* มติ PO U103 — ใบรับรองแทนใบเสร็จ: ดาวน์โหลดไปเซ็น → อัปโหลดฉบับเซ็น (ต้องมีก่อนอนุมัติ) */}
                        {item.substituteReceipt !== null && (
                          <SubstituteReceiptPanel
                            receipt={item.substituteReceipt}
                            canUpload
                            // มติ PO U107 — เจ้าของยกเลิก/ออกใบใหม่แทนได้ก่อนอนุมัติ
                            canCancel={item.status !== 'approved'}
                            onSigned={() => void load(view)}
                            onChanged={() => void load(view)}
                          />
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-base font-bold text-slate-800">{fmtSatangSymbol(item.grossSatang)}</div>
                        <StatusBadge
                          status={expenseStatusLabel(item.status)}
                          group={expenseStatusBadgeGroup(item.status)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {hotelFormOpen && session !== null && (
        <HotelClaimModal
          onClose={() => setHotelFormOpen(false)}
          onCreated={() => {
            void load(view)
          }}
        />
      )}

      <FileViewerModal
        open={viewingReceipt !== null}
        document={viewingReceipt}
        onClose={() => setViewingReceipt(null)}
      />

      {fixing !== null && session !== null && (
        <ResubmitExpenseModal
          key={fixing.id}
          expense={fixing}
          onClose={() => setFixing(null)}
          onDone={() => {
            setFixing(null)
            void load(view)
          }}
        />
      )}
    </>
  )
}

/** วันลงพื้นที่ที่ยังไม่ถูกคำนวณรายวัน (มติ PO UAT Q21) — แจ้งสถานะ ไม่แสดงยอดประมาณ */
function PendingFieldDaysNotice({ dates }: { dates: readonly string[] }) {
  if (dates.length === 0) return null
  return (
    <InlineAlert tone="info" title="ค่าน้ำมันเหมาจ่าย/เบี้ยเลี้ยง — รอคำนวณหลังจบวัน">
      วันที่ลงพื้นที่: {dates.map((date) => fmtDate(`${date}T00:00:00.000Z`)).join(', ')}
    </InlineAlert>
  )
}
