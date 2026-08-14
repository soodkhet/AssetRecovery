'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useSession } from '@/components/auth/permission-provider'
import { FieldCaseDetailModal } from '@/components/field/field-case-detail'
import { useFieldCases } from '@/components/field/field-cases-provider'
import { IconAlert, IconCheck, IconChevronRight, IconCompass, IconWallet } from '@/components/field/field-icons'
import { ErrorState, LoadingState } from '@/components/ui'
import { apiPath } from '@/lib/api/contract'
import { callApi } from '@/lib/api/types'
import { buildFieldDashboard, buildSevenDayTrend, successRatePct } from '@/lib/field/dashboard'
import type { FieldCaseListItemDto, FieldCaseListResultDto, FieldIncomeSummaryDto } from '@/lib/field/types'
import { toInputDate } from '@/lib/format/datetime'
import { fmtSatangSymbol } from '@/lib/format/money'

/**
 * หน้าแรกของ Field Tracker (`41` §7.1) — 5 บล็อก
 *
 * 1 Draft ค้าง (ส้ม) · 2 เคสที่ต้องไปวันนี้ (การ์ดดำ) · 3 สรุปภาพรวม 3 สถานะ
 * 4 % ความสำเร็จสะสม + คอมมิชชั่นเดือนนี้ (กดไปหน้าสรุปรายได้) · 5 กราฟแท่ง 7 วันล่าสุด
 *
 * ตัวเลขเงิน/% มาจาก `GET /api/field/income-summary` (สะสม + เดือนนี้) — หน้าจอไม่คำนวณเงินเอง (Rule 01)
 * Desktop จัด 2 คอลัมน์ (เนื้อหาหลัก 2/3 + สรุปด่วน 1/3) ตาม §7.1
 */

function StatCell({ value, label, tone }: { value: number; label: string; tone: 'amber' | 'indigo' | 'emerald' }) {
  const cell = {
    amber: 'bg-amber-50 text-amber-700',
    indigo: 'bg-indigo-50 text-indigo-700',
    emerald: 'bg-emerald-50 text-emerald-700',
  }[tone]
  const labelClass = {
    amber: 'text-amber-600',
    indigo: 'text-indigo-600',
    emerald: 'text-emerald-600',
  }[tone]

  return (
    <div className={`rounded-xl py-3 lg:py-4 ${cell}`}>
      <div className="text-xl font-extrabold lg:text-2xl">{value}</div>
      <div className={`text-[10px] font-semibold lg:text-[11px] ${labelClass}`}>{label}</div>
    </div>
  )
}

export function FieldDashboard() {
  const session = useSession()
  const { items: activeItems, loading, error } = useFieldCases()
  const [closedItems, setClosedItems] = useState<readonly FieldCaseListItemDto[]>([])
  const [allTime, setAllTime] = useState<FieldIncomeSummaryDto | null>(null)
  const [thisMonth, setThisMonth] = useState<FieldIncomeSummaryDto | null>(null)
  const [detailCaseId, setDetailCaseId] = useState<string | null>(null)
  const [todayIso] = useState(() => toInputDate(new Date()))

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const month = todayIso.slice(0, 7)
      const [closed, cumulative, current] = await Promise.all([
        callApi<FieldCaseListResultDto>(apiPath('field.caseList', undefined, { status: 'closed', view: 'own' })),
        callApi<FieldIncomeSummaryDto>(apiPath('field.incomeSummary')),
        callApi<FieldIncomeSummaryDto>(apiPath('field.incomeSummary', undefined, { month })),
      ])
      if (cancelled) return
      setClosedItems(closed.data?.items ?? [])
      setAllTime(cumulative.data ?? null)
      setThisMonth(current.data ?? null)
    })()
    return () => {
      cancelled = true
    }
  }, [todayIso])

  if (loading) return <LoadingState message="กำลังโหลดภาพรวมงานของคุณ..." />
  if (error !== null) return <ErrorState title={error.title} message={error.message} code={error.code} />

  const model = buildFieldDashboard(activeItems, closedItems, todayIso)
  const trend = buildSevenDayTrend(
    closedItems
      .filter((item) => item.closedAt !== null && item.status !== 'reassigned_away')
      .map((item) => ({ dayIso: toInputDate(item.closedAt), success: item.status === 'closed_success' })),
    todayIso,
  )
  const rate = successRatePct(allTime?.successCount ?? 0, allTime?.failCount ?? 0)

  const overviewCard = (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:p-5">
      <h2 className="mb-2 text-sm font-bold text-slate-800">สรุปภาพรวม</h2>
      <div className="grid grid-cols-3 gap-2 text-center lg:gap-3">
        <StatCell value={model.pendingAcceptCount} label="รอรับงาน" tone="amber" />
        <StatCell value={model.trackingCount} label="กำลังติดตาม" tone="indigo" />
        <StatCell value={model.successCount} label="สำเร็จ" tone="emerald" />
      </div>
    </div>
  )

  const trendCard = (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:p-5">
      <h2 className="mb-3 text-[13px] font-extrabold text-slate-800 lg:mb-4 lg:text-sm">แนวโน้มผลงาน 7 วันล่าสุด</h2>
      <div className="flex h-24 items-end justify-between gap-1.5 lg:h-32 lg:gap-2.5">
        {trend.map((day) => (
          <div key={day.dateIso} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex w-full flex-1 items-end">
              <div
                className="flex w-full flex-col-reverse overflow-hidden rounded-t-md"
                style={{ height: `${day.heightPct}%` }}
              >
                {day.total === 0 ? (
                  <div className="h-full w-full bg-slate-100" />
                ) : (
                  <>
                    <div className="w-full bg-emerald-500" style={{ height: `${day.successPct}%` }} />
                    <div className="w-full bg-slate-300" style={{ height: `${100 - day.successPct}%` }} />
                  </>
                )}
              </div>
            </div>
            <span className="text-[10px] font-bold text-slate-400 lg:text-[11px]">
              {Number(day.dateIso.slice(8, 10))}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500 lg:gap-4 lg:text-xs">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> สำเร็จ
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-slate-300" /> ไม่สำเร็จ
        </span>
      </div>
    </div>
  )

  const unscheduledCard =
    model.unscheduledCount === 0 ? null : (
      <Link
        href="/field/accepted"
        className="focus-ring flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <span>
          <span className="block text-sm font-bold text-slate-800">เคสรอลงวันที่ติดตาม</span>
          <span className="block text-xs text-slate-400">{model.unscheduledCount} เคสยังไม่ได้จัดวัน</span>
        </span>
        <IconChevronRight className="h-4 w-4 text-slate-300" />
      </Link>
    )

  const todayCard =
    model.todayCases.length === 0 ? null : (
      <div className="rounded-2xl bg-slate-900 p-4 shadow-sm">
        <div className="mb-2.5 flex items-center gap-1.5 text-[13px] font-extrabold text-white">
          <IconCompass className="h-4 w-4" /> เคสที่ต้องไปวันนี้ ({model.todayCases.length})
        </div>
        <div className="space-y-2">
          {model.todayCases.map((item, index) => (
            <button
              key={item.assignmentId}
              type="button"
              onClick={() => setDetailCaseId(item.caseId)}
              className="focus-ring flex w-full items-center gap-2.5 rounded-xl bg-white/10 px-3 py-2.5 text-left"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-bold text-white">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-bold text-white">{item.debtorName ?? '—'}</span>
                <span className="block truncate text-[11px] text-white/50">{item.district ?? '—'}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    )

  const rateCard = (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
      <div className="text-[28px] font-extrabold text-slate-900">{rate === null ? '-' : `${rate}%`}</div>
      <div className="text-[11px] font-bold text-slate-400">% ความสำเร็จสะสม</div>
    </div>
  )

  const commissionCard = (
    <Link
      href="/field/income"
      className="focus-ring block rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm"
    >
      <div className="text-[28px] font-extrabold text-emerald-600">
        {fmtSatangSymbol(thisMonth?.commissionSatang ?? 0)}
      </div>
      <div className="text-[11px] font-bold text-slate-400">คอมมิชชั่นเดือนนี้</div>
    </Link>
  )

  return (
    <>
      {model.draftCases.length > 0 && (
        <Link
          href="/field/tracking"
          className="focus-ring mb-4 flex items-center gap-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 shadow-sm"
        >
          <IconAlert className="h-5 w-5 shrink-0 text-amber-600" />
          <span>
            <span className="block text-sm font-extrabold text-amber-800">
              มี {model.draftCases.length} เคสที่บันทึก Draft ไว้ยังไม่ปิดงาน
            </span>
            <span className="mt-0.5 block text-xs text-amber-600">แตะเพื่อไปทำต่อให้เสร็จ</span>
          </span>
        </Link>
      )}

      <h1 className="mb-4 text-lg font-extrabold text-slate-900 lg:hidden">
        สวัสดี, {session?.fullName ?? 'พนักงานภาคสนาม'}
      </h1>

      {/* Mobile = เรียงซ้อนแนวตั้ง · Desktop = 2 คอลัมน์ (เนื้อหาหลัก 2/3 + สรุปด่วน 1/3) ตาม §7.1 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:order-1 lg:col-span-2">
          <div className="lg:hidden">{todayCard}</div>
          {overviewCard}
          {trendCard}
          {unscheduledCard}
        </div>

        <div className="space-y-4 lg:order-2">
          <div className="hidden lg:block">{todayCard}</div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            {rateCard}
            {commissionCard}
          </div>
          <div className="grid grid-cols-2 gap-3 lg:hidden">
            <Link
              href="/field/expenses"
              className="focus-ring flex flex-col items-center gap-1 rounded-xl bg-slate-50 p-3 text-xs font-bold text-slate-600 hover:bg-slate-100"
            >
              <IconWallet className="h-5 w-5 text-emerald-600" /> เบิกค่าใช้จ่าย
            </Link>
            <Link
              href="/field/closed"
              className="focus-ring flex flex-col items-center gap-1 rounded-xl bg-slate-50 p-3 text-xs font-bold text-slate-600 hover:bg-slate-100"
            >
              <IconCheck className="h-5 w-5 text-slate-500" /> ผลงานที่จบแล้ว
            </Link>
          </div>
        </div>
      </div>

      <FieldCaseDetailModal
        open={detailCaseId !== null}
        caseId={detailCaseId}
        onClose={() => setDetailCaseId(null)}
      />
    </>
  )
}
