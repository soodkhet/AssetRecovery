'use client'

import { useState } from 'react'
import { BankReconTab } from '@/components/accounting/bank-recon-tab'
import { ClosingTab } from '@/components/accounting/closing-tab'
import { ExceptionsTab } from '@/components/accounting/exceptions-tab'
import { ExpensesTab } from '@/components/accounting/expenses-tab'
import { ExportTab } from '@/components/accounting/export-tab'
import { QuestionsTab } from '@/components/accounting/questions-tab'
import { ReceiptsTab } from '@/components/accounting/receipts-tab'
import { SalesTab } from '@/components/accounting/sales-tab'
import { WhtTab } from '@/components/accounting/wht-tab'
import { Card, EmptyState, PageHeader } from '@/components/ui'
import { cn } from '@/components/ui/cn'
import { ACCOUNTING_TABS } from '@/lib/accounting/accounting-tabs'

/**
 * หน้า "บัญชี (Accounting)" — โครงตาม mockup `accounting.html` (`renderAccountingOperations`):
 * **แถบแท็บแนวนอนใต้หัวข้อ + เนื้อหาในการ์ดเดียว** (`06` §8)
 *
 * ทะเบียนแท็บอยู่ที่ `lib/accounting/accounting-tabs.ts` ที่เดียว — แท็บที่หน้าจริงยังไม่เกิดแสดงเป็น
 * ปุ่มเทากดไม่ได้พร้อมบอก Phase (แนวเดียวกับ `<FinanceShell>` ของ Phase 3)
 */
export function AccountingShell({ initialTab }: { initialTab: string }) {
  const [tab, setTab] = useState(initialTab)
  const current = ACCOUNTING_TABS.find((item) => item.id === tab)

  return (
    <>
      <PageHeader
        title="บัญชี (Accounting)"
        description="รวบรวมหลักฐาน ปิดงบ กระทบยอด และประสานงานสำนักงานบัญชี"
      />

      <Card>
        <nav
          aria-label="แท็บงานบัญชี"
          className="no-scrollbar mb-6 flex gap-6 overflow-x-auto border-b border-slate-200"
        >
          {ACCOUNTING_TABS.map((item) => {
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

        {current?.id === 'closing' && <ClosingTab />}
        {current?.id === 'sales' && <SalesTab />}
        {current?.id === 'receipts' && <ReceiptsTab />}
        {current?.id === 'expenses' && <ExpensesTab />}
        {current?.id === 'bank' && <BankReconTab />}
        {current?.id === 'wht' && <WhtTab />}
        {current?.id === 'documents' && <ExceptionsTab />}
        {current?.id === 'qa' && <QuestionsTab />}
        {current?.id === 'export' && <ExportTab />}
        {current === undefined && (
          <EmptyState title="ยังไม่มีหน้าจอของแท็บนี้" description="เลือกแท็บที่พร้อมใช้งานจากแถบด้านบน" />
        )}
      </Card>
    </>
  )
}
