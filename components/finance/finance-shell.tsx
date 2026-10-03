'use client'

import Link from 'next/link'
import { useState } from 'react'
import { AdjustmentTab } from '@/components/finance/adjustment-tab'
import { AdvanceTab } from '@/components/finance/advance-tab'
import { ApprovalTab } from '@/components/finance/approval-tab'
import { CompensationTab } from '@/components/finance/compensation-tab'
import { DashboardTab } from '@/components/finance/dashboard-tab'
import { PayoutTab } from '@/components/finance/payout-tab'
import { ProfitTab } from '@/components/finance/profit-tab'
import { RevenueTab } from '@/components/finance/revenue-tab'
import { PayeeTab } from '@/components/settings/payee-tab'
import { Card, EmptyState, PageHeader } from '@/components/ui'
import { cn } from '@/components/ui/cn'
import { useSession } from '@/components/auth/permission-provider'
import { visibleFinanceOperationTabs } from '@/lib/finance/operation-tabs'
import { UNDER_DEVELOPMENT_TEXT } from '@/lib/nav/menu-registry'

/**
 * หน้า "การเงิน (Finance Operation)" — โครงตาม mockup `finance.html` (`renderFinanceOperations`):
 * **แถบแท็บแนวนอนใต้หัวข้อ + เนื้อหาในการ์ดเดียว** (`06` §8)
 *
 * ทะเบียนแท็บอยู่ที่ `lib/finance/operation-tabs.ts` ที่เดียว — แท็บที่หน้าจริงยังไม่เกิดแสดงเป็น
 * ปุ่มเทากดไม่ได้พร้อมบอก Phase (แนวเดียวกับ `<SubNav>` / `<FinanceSettingsShell>`)
 */
export function FinanceShell({ initialTab }: { initialTab: string }) {
  const [tab, setTab] = useState(initialTab)
  const session = useSession()
  // แท็บที่ผู้ใช้ไม่มีสิทธิ์อ่าน **ซ่อน** (ไม่ใช่โชว์ตารางว่าง) — ผู้จัดการทีมเห็นเฉพาะคิวอนุมัติค่าตอบแทน
  // (มติ PO 03/10/2569 — UAT R6-A) · API ตรวจสิทธิ์ซ้ำทุก endpoint (DEC-002)
  const tabs = session === null ? [] : visibleFinanceOperationTabs(session)
  // `initialTab` ผ่าน `resolveFinanceOperationTab()` มาแล้ว และปุ่มที่กดได้มีแต่แท็บที่ `available`
  const current = tabs.find((item) => item.id === tab)

  return (
    <>
      <PageHeader
        title="การเงิน (Finance Operation)"
        description="จัดการรอบจ่ายเงินทีมงาน (AP) ยอดเรียกเก็บ (AR) ตรวจสอบรายการเบิก และรายงานกำไร"
      />

      <Card>
        <nav
          aria-label="แท็บงานการเงิน"
          className="no-scrollbar mb-6 flex gap-6 overflow-x-auto border-b border-slate-200"
        >
          {tabs.map((item) => {
            // หน้าจริงอยู่คนละ route — ลิงก์ข้ามไป (ปัจจุบันไม่มีแท็บแบบนี้ เก็บไว้รองรับในอนาคต)
            if (item.href !== undefined) {
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className="focus-ring border-b-2 border-transparent py-2.5 text-sm font-semibold whitespace-nowrap text-slate-500 transition-colors hover:text-slate-800"
                >
                  {item.label}
                </Link>
              )
            }

            if (!item.available) {
              return (
                <span
                  key={item.id}
                  title={UNDER_DEVELOPMENT_TEXT}
                  className="cursor-not-allowed border-b-2 border-transparent py-2.5 text-sm font-semibold whitespace-nowrap text-slate-300"
                >
                  {item.label}
                </span>
              )
            }

            const active = item.id === current?.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'focus-ring border-b-2 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors',
                  active
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-800',
                )}
              >
                {item.label}
              </button>
            )
          })}
        </nav>

        {current?.id === 'dashboard' && <DashboardTab />}
        {current?.id === 'approval' && <ApprovalTab />}
        {current?.id === 'comp' && <CompensationTab />}
        {current?.id === 'advances' && <AdvanceTab />}
        {current?.id === 'payout' && <PayoutTab />}
        {current?.id === 'revenue' && <RevenueTab />}
        {current?.id === 'payee' && <PayeeTab />}
        {current?.id === 'adjustment' && <AdjustmentTab />}
        {current?.id === 'profit' && <ProfitTab />}
        {current === undefined && (
          <EmptyState title="ยังไม่มีหน้าจอของแท็บนี้" description="เลือกแท็บที่พร้อมใช้งานจากแถบด้านบน" />
        )}
      </Card>
    </>
  )
}
