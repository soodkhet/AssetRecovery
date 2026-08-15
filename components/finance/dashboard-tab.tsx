'use client'

import Link from 'next/link'
import { useDashboardKpi, useExceptions } from '@/components/finance/use-reports'
import {
  Button,
  InlineAlert,
  StatCard,
  StatusBadge,
  TBody,
  THead,
  Table,
  TableState,
  Td,
  Th,
  Tr,
} from '@/components/ui'
import { cn } from '@/components/ui/cn'
import { fmtDate } from '@/lib/format/datetime'
import { fmtCount, fmtRatioPct, fmtSatangSymbol } from '@/lib/format/money'
import { EXCEPTION_LEVEL_LABEL, KPI_TONE_CLASS } from '@/lib/reports/dashboard'

/**
 * แท็บ "ภาพรวม" (ไฟล์ 14 §8 · mockup `finance.html` แท็บ `dashboard`)
 * — KPI 4 การ์ด + ตาราง Alerts ที่ต้องจัดการ
 *
 * ⚠️ **read-only ทั้งหน้า** (`14` §10) — ทุกปุ่มลิงก์กลับไฟล์ต้นทาง ห้ามมี mutation ที่นี่
 * ⚠️ ตัวเลขทุกช่องมาจาก API (`14` §6.1) — หน้าจอห้ามบวก/ลบยอดเอง (Rule 01)
 */
export function DashboardTab() {
  const dashboard = useDashboardKpi()
  const exceptions = useExceptions('open')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">ภาพรวมการเงิน</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            สรุปสถานะเงินสดและปัญหาที่ค้างอยู่ในหน้าเดียว — จัดการจริงที่โมดูลต้นทาง
          </p>
        </div>
        <Button
          variant="secondary"
          loading={dashboard.loading}
          onClick={() => {
            void dashboard.reload(true)
            void exceptions.reload()
          }}
        >
          รีเฟรชตอนนี้
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {dashboard.data.kpis.length === 0 && dashboard.loading && (
          <p className="text-sm text-slate-500">กำลังโหลด KPI…</p>
        )}
        {dashboard.data.kpis.map((kpi) => (
          <StatCard
            key={kpi.id}
            label={kpi.label}
            value={fmtSatangSymbol(kpi.amountSatang)}
            hint={
              kpi.marginPct === undefined
                ? `${kpi.hint} · ${kpi.source}`
                : `Margin ${fmtRatioPct(kpi.marginPct)} · ${kpi.source}`
            }
            className={cn(KPI_TONE_CLASS[kpi.tone])}
          />
        ))}
      </div>

      {dashboard.error !== null && (
        <InlineAlert tone="error" title={dashboard.error.title}>
          {dashboard.error.message}
        </InlineAlert>
      )}

      {dashboard.data.exceptions.critical > 0 && (
        <InlineAlert
          tone="error"
          title={`มี ${fmtCount(dashboard.data.exceptions.critical)} Critical Exception ที่ยังเปิดอยู่`}
        >
          ต้องแก้ไขหรือให้ผู้บริหารรับความเสี่ยงก่อน จึงจะ Export Accounting Pack ได้ (ไฟล์ 30/34)
        </InlineAlert>
      )}

      <div>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-800">
          <span className="h-2 w-2 rounded-full bg-red-500" />
          Alerts ที่ต้องจัดการ (Exceptions)
        </h3>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <Table>
            <THead>
              <Tr>
                <Th>ระดับ</Th>
                <Th>โมดูล / งวด</Th>
                <Th>รายละเอียด</Th>
                <Th>วันที่พบ</Th>
                <Th className="text-right">จัดการ</Th>
              </Tr>
            </THead>
            <TableState
              loading={exceptions.loading}
              error={exceptions.error}
              isEmpty={exceptions.data.rows.length === 0}
              emptyTitle="ไม่มีรายการค้าง"
              emptyDescription="ยังไม่มี Exception ที่เปิดอยู่ในระบบ"
              colSpan={5}
            />
            <TBody>
              {!exceptions.loading &&
                exceptions.error === null &&
                exceptions.data.rows.map((row) => (
                  <Tr key={row.id} className={row.level === 'critical' ? 'bg-red-50/40' : undefined}>
                    <Td>
                      <StatusBadge status={row.level} label={EXCEPTION_LEVEL_LABEL[row.level]} />
                    </Td>
                    <Td className="text-xs text-slate-600">
                      {row.sourceModuleLabel}
                      <span className="mt-0.5 block text-[10px] text-slate-400">{row.periodLabel}</span>
                    </Td>
                    <Td>
                      <span className="font-medium text-slate-900">{row.title}</span>
                      <span className="mt-0.5 block text-[11px] text-slate-500">{row.description}</span>
                    </Td>
                    <Td className="text-xs text-slate-500">{fmtDate(row.createdAt)}</Td>
                    <Td className="text-right">
                      {row.link === null ? (
                        <span className="text-[11px] text-slate-400">ยังไม่มีหน้าจอปลายทาง</span>
                      ) : (
                        <Link
                          href={row.link}
                          className="focus-ring rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                        >
                          ดูรายละเอียด
                        </Link>
                      )}
                    </Td>
                  </Tr>
                ))}
            </TBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
