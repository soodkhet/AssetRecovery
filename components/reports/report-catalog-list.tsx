'use client'

import Link from 'next/link'
import { Badge, Card, EmptyState } from '@/components/ui'
import { REPORT_CATEGORIES, REPORT_CATEGORY_LABEL, type ReportCategory } from '@/lib/reports/catalog'

/**
 * หน้ารวมเมนูรายงาน (`96` §6) — การ์ดแยกตามหมวด F/O/A/E
 *
 * รายการที่แสดงถูกกรองด้วยสิทธิ์มาจาก backend แล้ว (`GET /api/reports`) ⇒ ผู้ใช้ไม่เห็นแม้ชื่อ
 * รายงานของหมวดที่ตัวเองไม่มีสิทธิ์ · รายงานที่ยังไม่มีตัวคำนวณขึ้นป้าย "ยังไม่เปิดใช้งาน"
 * และ **กดไม่ได้** (ห้ามพาไปหน้าที่ตอบ 404)
 */

export interface ReportCatalogItem {
  code: string
  id: string
  title: string
  category: ReportCategory
  categoryLabel: string
  cacheMode: 'daily' | 'hourly' | 'realtime'
  available: boolean
}

const CACHE_LABEL: Readonly<Record<ReportCatalogItem['cacheMode'], string>> = {
  daily: 'อัปเดตรายวัน',
  hourly: 'อัปเดตรายชั่วโมง',
  realtime: 'ข้อมูลสด',
}

export function ReportCatalogList({ reports }: { reports: readonly ReportCatalogItem[] }) {
  if (reports.length === 0) {
    return (
      <Card>
        <EmptyState
          title="ยังไม่มีรายงานที่คุณเข้าถึงได้"
          description="สิทธิ์ดูรายงานแบ่งตามหมวด (การเงิน / งานติดตาม / บัญชี / ผู้บริหาร) — ติดต่อผู้ดูแลระบบหากต้องการเข้าถึง"
        />
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {REPORT_CATEGORIES.map((category) => {
        const items = reports.filter((report) => report.category === category)
        if (items.length === 0) return null

        return (
          <section key={category} className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-slate-700">
              {REPORT_CATEGORY_LABEL[category]}
              <span className="ml-2 text-xs font-normal text-slate-400">{items.length} รายงาน</span>
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((report) => (
                <ReportCard key={report.id} report={report} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function ReportCard({ report }: { report: ReportCatalogItem }) {
  const body = (
    <Card className={report.available ? 'h-full transition hover:border-slate-300' : 'h-full bg-slate-50'}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-semibold text-slate-400">{report.code}</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-900">{report.title}</p>
          <p className="mt-1 text-xs text-slate-500">{CACHE_LABEL[report.cacheMode]}</p>
        </div>
        {!report.available && <Badge>ยังไม่เปิดใช้งาน</Badge>}
      </div>
    </Card>
  )

  if (!report.available) return body
  return (
    <Link href={`/reports/${report.id}`} className="block">
      {body}
    </Link>
  )
}
