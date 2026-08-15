'use client'

import { useCallback, useState } from 'react'
import { Button, Card, InlineAlert, PageHeader, Skeleton, useToast } from '@/components/ui'
import { DateRangePicker, isReportRangeReady, reportRangeQuery, type ReportRangeValue } from '@/components/reports/date-range-picker'
import { KpiCardRow } from '@/components/reports/kpi-card'
import { ReportTable } from '@/components/reports/report-table'
import { useReportData } from '@/components/reports/use-report-data'
import { readEnvelope } from '@/lib/api/envelope'
import { fmtDateTime } from '@/lib/format/datetime'
import type { ReportDefinition } from '@/lib/reports/catalog'
import type { ReportExportFormat } from '@/lib/reports/export'

/**
 * โครงหน้าจอกลางของทุกรายงาน (`96` §11) — **หน้ารายงานใน 6.2–6.5 ต้องใช้ตัวนี้ ห้ามทำตารางเอง**
 *
 * ประกอบด้วย: หัวเรื่อง → ตัวเลือกช่วงเวลา + ปุ่มรีเฟรช/ส่งออก → KPI + badge MoM → ตาราง
 * (virtual scroll เมื่อเกิน 100 แถว) → ป้าย "ข้อมูล ณ …" · ครบทั้ง loading / empty / error (`04` §9)
 *
 * ปุ่มส่งออกเรียก `POST /api/reports/:id/export` ตัวเดียว: ไฟล์เล็กดาวน์โหลดทันที
 * ไฟล์ใหญ่ (>5,000 แถว) ระบบตอบ 202 แล้วบอกผู้ใช้ให้ไปดูที่หน้างานเบื้องหลัง (E13)
 */

const EXPORT_LABEL: Readonly<Record<ReportExportFormat, string>> = {
  xlsx: 'ส่งออก Excel',
  pdf: 'ส่งออก PDF',
}

export function ReportView({
  report,
  params = {},
  filters,
  initialRange,
}: {
  report: Pick<ReportDefinition, 'id' | 'code' | 'title'>
  params?: Readonly<Record<string, string>>
  /** ตัวกรองเฉพาะรายงาน (6.2–6.5 ส่งเข้ามา) — วางต่อจาก DateRangePicker */
  filters?: React.ReactNode
  initialRange?: ReportRangeValue
}) {
  const { showToast } = useToast()
  const [range, setRange] = useState<ReportRangeValue>(initialRange ?? { preset: 'this_month', from: '', to: '' })
  const [exporting, setExporting] = useState<ReportExportFormat | null>(null)

  const ready = isReportRangeReady(range)
  const { payload, loading, error, reload } = useReportData(report.id, range, params)

  const runExport = useCallback(
    async (format: ReportExportFormat) => {
      setExporting(format)
      try {
        const query = reportRangeQuery(range)
        const response = await fetch(`/api/reports/${report.id}/export`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            format,
            preset: range.preset,
            ...(range.preset === 'custom' ? { from: query.get('from'), to: query.get('to') } : {}),
            params,
          }),
        })

        // ไฟล์ทำสด: ตอบเป็นไฟล์ตรง ๆ ไม่ใช่ envelope
        const contentType = response.headers.get('content-type') ?? ''
        if (response.ok && !contentType.includes('application/json')) {
          const blob = await response.blob()
          const url = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          link.download = fileNameOf(response.headers.get('content-disposition'), report.code, format)
          link.click()
          URL.revokeObjectURL(url)
          return
        }

        const envelope = readEnvelope<{ mode: string; jobId: string; rowCount: number }>(
          await response.json(),
          response.ok,
        )
        if (!envelope.success) {
          showToast({ tone: 'error', title: envelope.error.title, description: envelope.error.message })
          return
        }
        showToast({
          tone: 'info',
          title: 'รายงานใหญ่เกินกว่าจะสร้างทันที — ส่งเข้างานเบื้องหลังแล้ว',
          description: `${(envelope.data.rowCount ?? 0).toLocaleString('th-TH')} แถว · ดาวน์โหลดได้ที่หน้า "งานเบื้องหลัง" เมื่อทำเสร็จ`,
        })
      } catch {
        showToast({ tone: 'error', title: 'ส่งออกไม่สำเร็จ', description: 'ลองใหม่อีกครั้ง' })
      } finally {
        setExporting(null)
      }
    },
    [params, range, report.code, report.id, showToast],
  )

  const cache = payload?.cache ?? null

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={`${report.code} — ${report.title}`}
        description={payload === null ? undefined : `ช่วงเวลา ${payload.range.label}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" loading={loading} disabled={!ready} onClick={() => void reload(true)}>
              รีเฟรชตอนนี้
            </Button>
            {(['xlsx', 'pdf'] as const).map((format) => (
              <Button
                key={format}
                variant="secondary"
                size="sm"
                loading={exporting === format}
                disabled={!ready || payload === null || exporting !== null}
                onClick={() => void runExport(format)}
              >
                {EXPORT_LABEL[format]}
              </Button>
            ))}
          </div>
        }
      />

      <Card>
        <div className="flex flex-col gap-3">
          <DateRangePicker value={range} onChange={setRange} disabled={loading} />
          {filters}
        </div>
      </Card>

      {cache?.refreshThrottled === true && (
        <InlineAlert tone="info" title="เพิ่งรีเฟรชไปเมื่อครู่">
          ระบบเว้นระยะการรีเฟรช 5 นาทีต่อรายงาน — ข้อมูลที่แสดงคือชุดล่าสุดที่คำนวณไว้
        </InlineAlert>
      )}
      {cache?.stale === true && (
        <InlineAlert tone="warning" title="ข้อมูลชุดนี้เก่ากว่า 24 ชั่วโมง">
          คำนวณล่าสุด {fmtDateTime(cache.computedAt)} — กดปุ่ม &quot;รีเฟรชตอนนี้&quot; เพื่อคำนวณใหม่
        </InlineAlert>
      )}

      {loading && payload === null ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : (
        <KpiCardRow kpis={payload?.kpis ?? []} />
      )}

      <ReportTable
        columns={payload?.columns ?? []}
        rows={payload?.rows ?? []}
        totalRow={payload?.totalRow ?? null}
        loading={loading}
        error={error}
        onRetry={
          <Button variant="secondary" size="sm" onClick={() => void reload(false)}>
            ลองใหม่
          </Button>
        }
      />

      {payload?.note !== undefined && payload.note !== null && (
        <p className="text-xs text-slate-500">{payload.note}</p>
      )}
      {cache !== null && (
        <p className="text-xs text-slate-400">
          ข้อมูล ณ {fmtDateTime(cache.computedAt)}
          {cache.fromCache ? ' (จากแคช)' : ' (คำนวณสด)'}
        </p>
      )}
    </div>
  )
}

/** ชื่อไฟล์จาก header ของ response — อ่านไม่ได้ค่อยตั้งชื่อสำรอง (ไม่ปล่อยให้เป็น "download") */
function fileNameOf(disposition: string | null, code: string, format: ReportExportFormat): string {
  const match = disposition?.match(/filename\*=UTF-8''([^;]+)/i)
  if (match?.[1] !== undefined) return decodeURIComponent(match[1])
  const plain = disposition?.match(/filename="([^"]+)"/i)
  if (plain?.[1] !== undefined) return plain[1]
  return `${code}.${format}`
}
