'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useDashboardKpi } from '@/components/finance/use-reports'
import { KpiCard } from '@/components/reports/kpi-card'
import { useReportData } from '@/components/reports/use-report-data'
import type { ReportRangeValue } from '@/components/reports/date-range-picker'
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  InlineAlert,
  Skeleton,
  StatCard,
  StatusBadge,
  buttonClass,
} from '@/components/ui'
import { cn } from '@/components/ui/cn'
import { usePermission } from '@/components/auth/permission-provider'
import { callApi, type ApiCallResult } from '@/lib/api/types'
import { FIELD_TRACKER_PATH } from '@/lib/auth/constants'
import {
  EXECUTIVE_DASHBOARD_KPI_KEYS,
  pendingQueueItems,
  withArOver60Hint,
  queueCountText,
  queueKpiItems,
  type DashboardOverviewDto,
  type DashboardQueueItemDto,
} from '@/lib/dashboard/widgets'
import { notificationHref } from '@/lib/field/push-client'
import { fmtDateTime } from '@/lib/format/datetime'
import { fmtCount, fmtRatioPct, fmtSatangSymbol } from '@/lib/format/money'
import { notificationDisplay } from '@/lib/notifications/events'
import type { NotificationListDto } from '@/lib/notifications/queries'
import { canViewMenu } from '@/lib/nav/menu-registry'
import { KPI_TONE_CLASS } from '@/lib/reports/dashboard'
import type { ReportKpi } from '@/lib/reports/payload'

/**
 * แดชบอร์ดหลัก (เมนูแรกของ Top Nav · Phase 6.6) — mockup `dashboard.html` ปรับเข้าข้อมูลจริงตามมติ PO 2026-08-16
 *
 * 4 บล็อก: KPI แถวบน · งานรอดำเนินการของฉัน · เคสตามสถานะ · แจ้งเตือนล่าสุด
 * แต่ละบล็อกโหลดแยกกันและมี loading / empty / error ของตัวเอง (บล็อกหนึ่งพังไม่ลากทั้งหน้า)
 *
 * ⚠️ **อ่านอย่างเดียวทั้งหน้า** — ทุกปุ่มเป็นลิงก์ไปทำงานจริงที่โมดูลต้นทาง
 * ⚠️ ตัวเลขเงินมาจาก endpoint เดิมทั้งหมด หน้าจอห้ามบวก/ลบยอดเอง (Rule 01)
 */

const THIS_MONTH: ReportRangeValue = { preset: 'this_month', from: '', to: '' }
const NOTIFICATION_LIMIT = 5

interface LoadState<T> {
  data: T | null
  loading: boolean
  error: { title: string; message: string } | null
  reload: () => Promise<void>
}

/** ตัวโหลด GET แบบเดียวกับ `use-reports.ts` — setState หลัง `await` ใน IIFE เท่านั้น */
function useGet<T>(url: string): LoadState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)

  const apply = useCallback((result: ApiCallResult<T>) => {
    if (result.error !== undefined) {
      setError({ title: result.error.title, message: result.error.message })
    } else {
      setData(result.data ?? null)
      setError(null)
    }
    setLoading(false)
  }, [])

  const reload = useCallback(async () => {
    setLoading(true)
    apply(await callApi<T>(url))
  }, [apply, url])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await callApi<T>(url)
      if (!cancelled) apply(result)
    })()
    return () => {
      cancelled = true
    }
  }, [apply, url])

  return { data, loading, error, reload }
}

function KpiSkeletonRow() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="กำลังโหลดตัวชี้วัด">
      {[0, 1, 2, 3].map((index) => (
        <Skeleton key={index} className="h-24 rounded-xl" />
      ))}
    </div>
  )
}

function SectionLink({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} className={buttonClass('ghost', 'sm')}>
      {children}
    </Link>
  )
}

// ── KPI แถวบน ─────────────────────────────────────────────────────────────────

/** ผู้บริหาร/Superadmin — การ์ดจากรายงาน KPI ภาพรวม (เดือนนี้) */
/** U115 — การ์ด AR + บรรทัด "เกิน 60 วัน" จากรายงานอายุหนี้ (F3) · ใช้เฉพาะผู้ที่ `arOver60` = true */
function ExecutiveKpiRowWithArAging() {
  const arAging = useReportData('ar-aging', THIS_MONTH)
  return <ExecutiveKpiRow arAgingKpis={arAging.error === null ? (arAging.payload?.kpis ?? null) : null} />
}

function ExecutiveKpiRow({ arAgingKpis }: { arAgingKpis: readonly ReportKpi[] | null }) {
  const report = useReportData('kpi-summary', THIS_MONTH)
  const kpis = (report.payload?.kpis ?? []).filter((kpi) =>
    (EXECUTIVE_DASHBOARD_KPI_KEYS as readonly string[]).includes(kpi.key),
  )

  return (
    <section className="space-y-2" aria-label="ตัวชี้วัดภาพรวม">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-700">
          ภาพรวมธุรกิจ{report.payload !== null ? ` · ${report.payload.range.label}` : ''}
        </h2>
        <SectionLink href="/reports/kpi-summary">ดูรายงาน KPI ภาพรวม</SectionLink>
      </div>
      {report.loading && report.payload === null ? (
        <KpiSkeletonRow />
      ) : report.error !== null ? (
        <InlineAlert tone="error" title={report.error.title}>
          {report.error.message}
        </InlineAlert>
      ) : kpis.length === 0 ? (
        <EmptyState title="ยังไม่มีตัวชี้วัด" description="ยังไม่มีข้อมูลรายได้หรือเคสในเดือนนี้" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {EXECUTIVE_DASHBOARD_KPI_KEYS.map((key) => {
            const kpi = kpis.find((each) => each.key === key)
            return kpi === undefined ? null : <KpiCard key={key} kpi={withArOver60Hint(kpi, arAgingKpis)} />
          })}
        </div>
      )}
    </section>
  )
}

/** การเงิน/บัญชี — KPI 4 ตัวชุดเดียวกับแท็บ "ภาพรวม" ของเมนูการเงิน */
function FinanceKpiRow() {
  const dashboard = useDashboardKpi()
  // บัญชีเห็น KPI ชุดนี้แต่ไม่มีเมนูการเงิน — ซ่อนลิงก์แทนการพาไปหน้าที่เด้งกลับ (staging S-016)
  const { session } = usePermission()
  const canOpenFinance = session !== null && canViewMenu(session, 'finance')

  return (
    <section className="space-y-2" aria-label="ตัวชี้วัดการเงิน">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-700">ภาพรวมการเงิน</h2>
        {canOpenFinance && <SectionLink href="/finance?tab=dashboard">ไปที่ การเงิน › ภาพรวม</SectionLink>}
      </div>
      {dashboard.loading && dashboard.data.kpis.length === 0 ? (
        <KpiSkeletonRow />
      ) : dashboard.error !== null ? (
        <InlineAlert tone="error" title={dashboard.error.title}>
          {dashboard.error.message}
        </InlineAlert>
      ) : dashboard.data.kpis.length === 0 ? (
        <EmptyState title="ยังไม่มีตัวชี้วัด" description="ยังไม่มีข้อมูลการเงินให้สรุป" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {dashboard.data.kpis.map((kpi) => (
            <StatCard
              key={kpi.id}
              label={kpi.label}
              value={fmtSatangSymbol(kpi.amountSatang)}
              hint={kpi.marginPct === undefined ? kpi.hint : `Margin ${fmtRatioPct(kpi.marginPct)}`}
              className={cn(KPI_TONE_CLASS[kpi.tone])}
            />
          ))}
        </div>
      )}
    </section>
  )
}

/** role ที่ไม่มีสิทธิ์เห็นตัวเลขเงิน — การ์ดเป็นจำนวนงานค้างของคิวตัวเอง */
function QueueKpiRow({ overview }: { overview: LoadState<DashboardOverviewDto> }) {
  if (overview.loading && overview.data === null) return <KpiSkeletonRow />
  if (overview.data === null) return null
  const items = queueKpiItems(overview.data.queues)
  if (items.length === 0) return null

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <Link key={item.id} href={item.href} className="focus-ring rounded-xl">
          <StatCard
            label={item.label}
            value={queueCountText(item)}
            hint={item.count === 0 ? 'ไม่มีงานค้าง' : item.hint}
            className="h-full hover:border-slate-300"
          />
        </Link>
      ))}
    </div>
  )
}

// ── งานรอดำเนินการของฉัน ──────────────────────────────────────────────────────

function QueueRow({ item }: { item: DashboardQueueItemDto }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <StatusBadge group={item.tone} label={queueCountText(item)} className="font-mono" />
          <span className="text-sm font-semibold text-slate-800">{item.label}</span>
        </div>
        <p className="mt-0.5 text-xs text-slate-500">{item.hint}</p>
      </div>
      <Link href={item.href} className={buttonClass('secondary', 'sm')}>
        {item.linkLabel}
      </Link>
    </li>
  )
}

function MyQueuesCard({ overview }: { overview: LoadState<DashboardOverviewDto> }) {
  const queues = overview.data?.queues ?? []
  const pending = pendingQueueItems(queues)

  return (
    <Card>
      <CardHeader
        title="งานรอดำเนินการของฉัน"
        description={
          overview.data === null
            ? 'คิวงานที่คุณลงมือทำได้'
            : `ข้อมูล ณ ${fmtDateTime(overview.data.computedAt)}`
        }
        action={
          <Button variant="ghost" loading={overview.loading} onClick={() => void overview.reload()}>
            รีเฟรช
          </Button>
        }
      />
      <div className="mt-4">
        {overview.loading && overview.data === null ? (
          <div className="space-y-3">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-12" />
            ))}
          </div>
        ) : overview.error !== null ? (
          <ErrorState
            title={overview.error.title}
            message={overview.error.message}
            action={
              <Button variant="secondary" onClick={() => void overview.reload()}>
                ลองใหม่
              </Button>
            }
          />
        ) : queues.length === 0 ? (
          <EmptyState
            title="ไม่มีคิวงานสำหรับบทบาทนี้"
            description="งานของคุณจะแสดงที่นี่เมื่อบทบาทมีหน้าที่อนุมัติหรือดำเนินการในระบบ"
          />
        ) : pending.length === 0 ? (
          <EmptyState title="ไม่มีงานค้าง" description={`ตรวจแล้ว ${fmtCount(queues.length)} คิว — ทุกคิวว่างอยู่`} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {pending.map((item) => (
              <QueueRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}

// ── เคสตามสถานะ ───────────────────────────────────────────────────────────────

function CaseBoardCard({ overview }: { overview: LoadState<DashboardOverviewDto> }) {
  const board = overview.data?.caseBoard ?? null
  if (overview.data !== null && board === null) return null

  return (
    <Card>
      <CardHeader
        title="เคสตามสถานะ"
        description={board === null ? undefined : `รวม ${fmtCount(board.total)} เคส · ปิดงานนับเฉพาะ ${board.monthLabel}`}
        action={board?.href == null ? undefined : <SectionLink href={board.href}>ดูเคสทั้งหมด</SectionLink>}
      />
      <div className="mt-4">
        {board === null ? (
          overview.error !== null ? (
            <ErrorState
              title={overview.error.title}
              message={overview.error.message}
              onRetry={() => void overview.reload()}
            />
          ) : (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((index) => (
                <Skeleton key={index} className="h-6" />
              ))}
            </div>
          )
        ) : board.total === 0 ? (
          <EmptyState title="ยังไม่มีเคส" description="ยังไม่มีเคสที่อยู่ในขอบเขตที่คุณเห็น" />
        ) : (
          <ul className="space-y-2">
            {board.rows.map((row) => (
              <li key={row.status} className="flex items-center justify-between gap-3 text-sm">
                <StatusBadge group={row.group} label={row.label} />
                <span className="font-mono font-semibold text-slate-800">{fmtCount(row.count)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}

// ── แจ้งเตือนล่าสุด ───────────────────────────────────────────────────────────

function NotificationsCard() {
  const notifications = useGet<NotificationListDto>(`/api/notifications?limit=${NOTIFICATION_LIMIT}`)
  const items = notifications.data?.items ?? []

  return (
    <Card>
      <CardHeader
        title="แจ้งเตือนล่าสุด"
        description={
          notifications.data === null ? undefined : `ยังไม่อ่าน ${fmtCount(notifications.data.unreadCount)} รายการ`
        }
        action={<SectionLink href="/notifications">ดูทั้งหมด</SectionLink>}
      />
      <div className="mt-4">
        {notifications.loading && notifications.data === null ? (
          <div className="space-y-2">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-10" />
            ))}
          </div>
        ) : notifications.error !== null ? (
          <ErrorState
            title={notifications.error.title}
            message={notifications.error.message}
            action={
              <Button variant="secondary" onClick={() => void notifications.reload()}>
                ลองใหม่
              </Button>
            }
          />
        ) : items.length === 0 ? (
          <EmptyState title="ยังไม่มีการแจ้งเตือน" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((item) => {
              const href = notificationHref(item.linkPath)
              const body = (
                <>
                  <span className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                    <span className="font-semibold text-slate-500">{notificationDisplay(item.eventCode).module}</span>
                    <span>{fmtDateTime(item.createdAt)}</span>
                  </span>
                  <span
                    className={cn(
                      'mt-0.5 block text-xs text-slate-700',
                      item.readAt === null && 'font-semibold text-slate-900',
                    )}
                  >
                    {item.title}
                  </span>
                </>
              )
              return (
                <li key={item.id} className="py-2 first:pt-0 last:pb-0">
                  {href === null ? (
                    <div>{body}</div>
                  ) : (
                    <Link href={href} className="focus-ring block rounded hover:bg-slate-50 pointer-coarse:min-h-11">
                      {body}
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Card>
  )
}

// ── หน้า ──────────────────────────────────────────────────────────────────────

export function MainDashboard() {
  const overview = useGet<DashboardOverviewDto>('/api/dashboard')
  const source = overview.data?.kpiSource ?? null

  return (
    <div className="space-y-5">
      {overview.data?.fieldTracker === true && (
        <InlineAlert tone="info" title="งานภาคสนามของคุณอยู่ที่ Field Tracker">
          <Link href={FIELD_TRACKER_PATH} className="font-semibold underline">
            เปิด Field Tracker
          </Link>
        </InlineAlert>
      )}

      {source === 'executive' ? (
        overview.data?.arOver60 === true ? (
          <ExecutiveKpiRowWithArAging />
        ) : (
          <ExecutiveKpiRow arAgingKpis={null} />
        )
      ) : source === 'finance' ? (
        <FinanceKpiRow />
      ) : (
        <QueueKpiRow overview={overview} />
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <MyQueuesCard overview={overview} />
        </div>
        <div className="space-y-5">
          <CaseBoardCard overview={overview} />
          <NotificationsCard />
        </div>
      </div>
    </div>
  )
}
