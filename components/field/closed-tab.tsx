'use client'

import { useEffect, useState } from 'react'
import { FieldCaseDetailModal } from '@/components/field/field-case-detail'
import { IconMap, IconWallet } from '@/components/field/field-icons'
import { EmptyState, ErrorState, LoadingState, Select, StatusBadge } from '@/components/ui'
import { cn } from '@/components/ui/cn'
import { apiPath } from '@/lib/api/contract'
import { callApi, type ApiCallError } from '@/lib/api/types'
import {
  CLOSED_FILTERS,
  CLOSED_FILTER_ACTIVE_CLASS,
  CLOSED_FILTER_LABEL,
  closedCardExpenseStatus,
  closedMonthKeys,
  filterClosedCases,
  reassignReasonText,
  type ClosedFilter,
} from '@/lib/field/closed-ui'
import { expenseStatusBadgeGroup, expenseStatusLabel } from '@/lib/field/expense-ui'
import { fieldStatusBadgeGroup, fieldStatusLabel } from '@/lib/field/field-ui'
import { ALL_MONTHS, monthOptions } from '@/lib/field/month-filter'
import type { FieldCaseListItemDto, FieldCaseListResultDto } from '@/lib/field/types'
import { fmtDateTime } from '@/lib/format/datetime'

/**
 * แท็บ "จบงาน" (`41` §7.11) — โหลดกลุ่ม `closed` แยกจาก store ของ shell (ซึ่งเก็บเฉพาะเคสที่ยังทำงานอยู่)
 *
 * - pill สถานะ 4 ตัว (รวม "ถูกโอนไป") + dropdown เดือน ทำงานร่วมกัน
 * - การ์ด `reassigned_away` = ขอบม่วง **กดไม่ได้** ไม่มีสถานะค่าใช้จ่าย แสดงเวลาที่ถูกโอน/คนใหม่/เหตุผลแทน
 */

function ClosedCard({ item, onOpen }: { item: FieldCaseListItemDto; onOpen: (caseId: string) => void }) {
  const place = [item.district, item.province].filter((part) => part !== null).join(', ') || '—'
  const reassigned = item.reassignedAway

  if (reassigned !== null && item.status === 'reassigned_away') {
    return (
      <div className="rounded-2xl border border-purple-200 bg-white p-3.5 shadow-sm">
        <div className="mb-1.5 flex items-start justify-between gap-2">
          <span className="truncate text-base font-bold text-slate-800">{item.debtorName ?? '—'}</span>
          <StatusBadge status={fieldStatusLabel(item.status)} group={fieldStatusBadgeGroup(item.status)} />
        </div>
        <div className="flex items-center gap-1 text-[13px] text-slate-500">
          <IconMap className="h-4 w-4 shrink-0" />
          {place} · รอบที่ {item.trackingRound}
        </div>
        <div className="mt-2 space-y-0.5 border-t border-slate-100 pt-2 text-xs text-slate-500">
          <div>
            โอนไปให้ <strong className="text-slate-700">{reassigned.toAgentName}</strong> เมื่อ{' '}
            {fmtDateTime(reassigned.reassignedAt)}
          </div>
          <div>เหตุผล: {reassignReasonText(item)}</div>
        </div>
      </div>
    )
  }

  const expenseStatus = closedCardExpenseStatus(item)

  return (
    <button
      type="button"
      onClick={() => onOpen(item.caseId)}
      className="focus-ring w-full rounded-2xl border border-slate-200 bg-white p-3.5 text-left shadow-sm hover:border-slate-300"
    >
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <span className="truncate text-base font-bold text-slate-800">{item.debtorName ?? '—'}</span>
        <StatusBadge status={fieldStatusLabel(item.status)} group={fieldStatusBadgeGroup(item.status)} />
      </div>
      <div className="flex items-center gap-1 text-[13px] text-slate-500">
        <IconMap className="h-4 w-4 shrink-0" />
        {place} · ปิดงานเมื่อ {fmtDateTime(item.closedAt)} · รอบที่ {item.trackingRound}
      </div>
      {expenseStatus !== null && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
          <IconWallet className="h-4 w-4 shrink-0" /> ค่าใช้จ่าย:{' '}
          <StatusBadge status={expenseStatusLabel(expenseStatus)} group={expenseStatusBadgeGroup(expenseStatus)} />
        </div>
      )}
    </button>
  )
}

export function ClosedTab() {
  const [items, setItems] = useState<readonly FieldCaseListItemDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ApiCallError | null>(null)
  const [filter, setFilter] = useState<ClosedFilter>('all')
  const [month, setMonth] = useState<string>(ALL_MONTHS)
  const [detailCaseId, setDetailCaseId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const response = await callApi<FieldCaseListResultDto>(
        apiPath('field.caseList', undefined, { status: 'closed', view: 'own' }),
      )
      if (cancelled) return
      setItems(response.data?.items ?? [])
      setError(response.error ?? null)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const months = monthOptions(closedMonthKeys(items))
  const visible = filterClosedCases(items, filter, month)

  if (loading) return <LoadingState message="กำลังโหลดงานที่จบแล้ว..." />
  if (error !== null) return <ErrorState title={error.title} message={error.message} code={error.code} />

  return (
    <>
      <div className="mb-3 flex gap-2 lg:mb-5 lg:items-center lg:gap-3">
        {CLOSED_FILTERS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setFilter(option)}
            aria-pressed={filter === option}
            className={cn(
              'focus-ring flex-1 rounded-xl py-2.5 text-xs font-extrabold lg:flex-none lg:px-4 lg:text-[13px]',
              filter === option ? CLOSED_FILTER_ACTIVE_CLASS[option] : 'bg-slate-100 text-slate-500',
            )}
          >
            {CLOSED_FILTER_LABEL[option]}
          </button>
        ))}
        <div className="hidden lg:block lg:w-[220px]">
          <Select aria-label="กรองตามเดือน" value={month} onChange={(event) => setMonth(event.target.value)}>
            {months.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="mb-3 lg:hidden">
        <Select aria-label="กรองตามเดือน" value={month} onChange={(event) => setMonth(event.target.value)}>
          {months.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      {visible.length === 0 ? (
        <EmptyState title="ไม่พบเคสตามเงื่อนไขที่กรอง" />
      ) : (
        <div className="space-y-3">
          {visible.map((item) => (
            <ClosedCard key={item.assignmentId} item={item} onOpen={setDetailCaseId} />
          ))}
        </div>
      )}

      <FieldCaseDetailModal
        open={detailCaseId !== null}
        caseId={detailCaseId}
        onClose={() => setDetailCaseId(null)}
      />
    </>
  )
}
