'use client'

import { useState } from 'react'
import { AdvanceTab } from '@/components/finance/advance-tab'
import { ApprovalTab } from '@/components/finance/approval-tab'
import { CompensationTab } from '@/components/finance/compensation-tab'
import { PayoutTab } from '@/components/finance/payout-tab'
import { EmptyState, PageHeader } from '@/components/ui'
import { cn } from '@/components/ui/cn'
import { FINANCE_OPERATION_TABS } from '@/lib/finance/operation-tabs'

/**
 * หน้า "การเงิน (Finance Operation)" — โครงตาม mockup `finance.html` (`renderFinanceOperations`):
 * **แถบแท็บแนวนอนใต้หัวข้อ + เนื้อหาในการ์ดเดียว** (`06` §8)
 *
 * ทะเบียนแท็บอยู่ที่ `lib/finance/operation-tabs.ts` ที่เดียว — แท็บที่หน้าจริงยังไม่เกิดแสดงเป็น
 * ปุ่มเทากดไม่ได้พร้อมบอก Phase (แนวเดียวกับ `<SubNav>` / `<FinanceSettingsShell>`)
 */
export function FinanceShell({ initialTab }: { initialTab: string }) {
  const [tab, setTab] = useState(initialTab)
  // `initialTab` ผ่าน `resolveFinanceOperationTab()` มาแล้ว และปุ่มที่กดได้มีแต่แท็บที่ `available`
  const current = FINANCE_OPERATION_TABS.find((item) => item.id === tab)

  return (
    <>
      <PageHeader
        title="การเงิน (Finance Operation)"
        description="จัดการรอบจ่ายเงินทีมงาน (AP) ยอดเรียกเก็บ (AR) ตรวจสอบรายการเบิก และรายงานกำไร"
      />

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <nav
          aria-label="แท็บงานการเงิน"
          className="no-scrollbar mb-6 flex gap-6 overflow-x-auto border-b border-slate-200"
        >
          {FINANCE_OPERATION_TABS.map((item) => {
            if (!item.available) {
              return (
                <span
                  key={item.id}
                  title={`หน้าจริงเกิดใน Phase ${item.plannedPhase ?? '-'}`}
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

        {current?.id === 'approval' && <ApprovalTab />}
        {current?.id === 'comp' && <CompensationTab />}
        {current?.id === 'advances' && <AdvanceTab />}
        {current?.id === 'payout' && <PayoutTab />}
        {current === undefined && (
          <EmptyState title="ยังไม่มีหน้าจอของแท็บนี้" description="เลือกแท็บที่พร้อมใช้งานจากแถบด้านบน" />
        )}
      </div>
    </>
  )
}
