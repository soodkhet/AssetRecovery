'use client'

import { useState } from 'react'
import { ApprovalMatrixTab } from '@/components/settings/approval-matrix-tab'
import { BankAccountsTab } from '@/components/settings/bank-accounts-tab'
import { BankFileFormatsTab } from '@/components/settings/bank-file-formats-tab'
import { CostCentersTab } from '@/components/settings/cost-centers-tab'
import { CyclesTab } from '@/components/settings/cycles-tab'
import { ExportFormatsTab } from '@/components/settings/export-formats-tab'
import { FunctionalPermissionsTab } from '@/components/settings/functional-permissions-tab'
import { InternalDocumentsTab } from '@/components/settings/internal-documents-tab'
import { InvoiceNumberingTab } from '@/components/settings/invoice-numbering-tab'
import { PayeeTab } from '@/components/settings/payee-tab'
import { PeriodLockTab } from '@/components/settings/period-lock-tab'
import { TaxDocTemplatesTab } from '@/components/settings/tax-doc-templates-tab'
import { TaxProfilesTab } from '@/components/settings/tax-profiles-tab'
import { VatRatesTab } from '@/components/settings/vat-rates-tab'
import { EmptyState, PageHeader } from '@/components/ui'
import { cn } from '@/components/ui/cn'
import { FINANCE_SETTINGS_TABS } from '@/lib/settings/finance-tabs'

/**
 * หน้า "ตั้งค่าบัญชี/การเงิน" — โครงตาม mockup `settings.html` (`renderSettingsLayout`):
 * **แถบแท็บแนวตั้งด้านซ้าย + เนื้อหาด้านขวา** (โทน emerald แยกจากตั้งค่าทั่วไปที่เป็น slate)
 *
 * แท็บที่หน้าจริงยังไม่เกิดแสดงเป็น disabled พร้อมบอก phase — ไม่พาไปหน้าว่าง (แนวเดียวกับ `<SubNav>`)
 * ครบ 13 แท็บของไฟล์ 13 ตั้งแต่ Phase 1.12 (5 ตัวจาก 1.11 + 8 ตัวจาก 1.12)
 * + แท็บ "ผู้รับเงิน" ของ **ไฟล์ 18** ที่ Phase 3.2 เพิ่มเข้ามาในหน้าเดียวกันตาม mockup
 */

export function FinanceSettingsShell({ initialTab }: { initialTab: string }) {
  const [tab, setTab] = useState(initialTab)
  // `initialTab` ผ่าน `resolveFinanceSettingsTab()` มาแล้ว และปุ่มที่กดได้มีแต่แท็บที่ `available`
  // ⇒ หา id ไม่เจอไม่ควรเกิดจริง แต่กันไว้ด้วยแท็บเริ่มต้นแทนที่จะพังทั้งหน้า
  const current = FINANCE_SETTINGS_TABS.find((item) => item.id === tab)

  return (
    <>
      <PageHeader
        title="ตั้งค่าบัญชี / การเงิน"
        description="ค่ากลางที่ระบบใช้คำนวณเงิน ภาษี และรอบเอกสาร (ไฟล์ 13) — ทุกการแก้ไขต้องมีเหตุผลและถูกบันทึกลง Audit Log"
      />

      <div className="flex flex-col gap-6 md:flex-row">
        <aside className="no-scrollbar w-full shrink-0 overflow-y-auto md:max-h-[80vh] md:w-56">
          <nav aria-label="แท็บตั้งค่าบัญชี/การเงิน" className="flex flex-col space-y-1 border-l-4 border-emerald-100 pl-2">
            {FINANCE_SETTINGS_TABS.map((item) => {
              if (!item.available) {
                return (
                  <span
                    key={item.id}
                    title={`หน้าจริงเกิดใน Phase ${item.plannedPhase ?? '-'}`}
                    className="cursor-not-allowed rounded-lg px-4 py-2.5 text-sm font-medium text-slate-400"
                  >
                    {item.label}
                    <span className="ml-1 font-mono text-[10px] text-slate-300">Phase {item.plannedPhase ?? '-'}</span>
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
                    'focus-ring rounded-lg px-4 py-2.5 text-left text-sm font-medium transition-colors',
                    active
                      ? 'border border-emerald-200 bg-emerald-50 text-emerald-900 shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                  )}
                >
                  {item.label}
                  <span className="ml-1 font-mono text-[10px] text-slate-400">{item.section}</span>
                </button>
              )
            })}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          {current?.id === 'cycles' && <CyclesTab />}
          {current?.id === 'approval' && <ApprovalMatrixTab />}
          {current?.id === 'bank' && <BankAccountsTab />}
          {current?.id === 'payee' && <PayeeTab />}
          {current?.id === 'tax' && <TaxProfilesTab />}
          {current?.id === 'vat' && <VatRatesTab />}
          {current?.id === 'cost' && <CostCentersTab />}
          {current?.id === 'docs' && <InternalDocumentsTab />}
          {current?.id === 'bankfile' && <BankFileFormatsTab />}
          {current?.id === 'export' && <ExportFormatsTab />}
          {current?.id === 'permission' && <FunctionalPermissionsTab />}
          {current?.id === 'lock' && <PeriodLockTab />}
          {current?.id === 'numbering' && <InvoiceNumberingTab />}
          {current?.id === 'taxdoc' && <TaxDocTemplatesTab />}
          {current !== undefined && !current.available && (
            <EmptyState
              title={`${current.label} ${current.section}`}
              description={`หน้าจริงเกิดใน Phase ${current.plannedPhase ?? '-'}`}
            />
          )}
        </main>
      </div>
    </>
  )
}
